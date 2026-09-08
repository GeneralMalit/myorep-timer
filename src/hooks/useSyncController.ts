import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { SavedSession } from '@/types/savedSessions';
import type { SavedWorkout } from '@/types/savedWorkouts';
import type {
    AccountActionResult,
    AccountSnapshot,
    AccountSyncActions,
    AccountSyncSnapshot,
    FirstSyncChoice,
} from '@/types/account';
import type { SyncOperation, SyncOperationToken, SyncQueueItem } from '@/types/sync';
import { useAccountStore } from '@/store/useAccountStore';
import { useSyncStore } from '@/store/useSyncStore';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import {
    fetchRemoteLibrarySnapshot,
    inspectRemoteSyncPresence,
    overwriteRemoteLibraryWithLocal,
    pushSessionMutation,
    pushWorkoutMutation,
} from '@/lib/supabaseSync';
import type { SyncMutationResult } from '@/lib/supabaseSync';
import { getSupabaseClient } from '@/lib/supabase';
import { canAccessCloudSync } from '@/utils/account';
import { createSyncRecoveryBackup, isSyncAuthExpiredError } from '@/utils/sync';

const RETRY_BASE_DELAY_MS = 2_000;
const RETRY_MAX_DELAY_MS = 30_000;
const RETRY_JITTER_RATIO = 0.25;
const MAX_RETRY_ATTEMPTS = 5;

type ActiveSyncProcess = {
    id: string;
    ownerUserId: string;
    authGeneration: string;
    operationId: string;
    cancelled: boolean;
};

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
        return error;
    }

    return 'Cloud sync failed.';
};

const getErrorStatus = (error: unknown): number | null => {
    if (!error || typeof error !== 'object') {
        return null;
    }

    const record = error as Record<string, unknown>;
    const candidate = record.status ?? record.statusCode;
    return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
};

const getErrorCode = (error: unknown): string => {
    if (!error || typeof error !== 'object') {
        return '';
    }

    const code = (error as Record<string, unknown>).code;
    return typeof code === 'string' ? code : '';
};

const isPermanentSyncError = (error: unknown): boolean => {
    const status = getErrorStatus(error);
    if (status !== null) {
        return status >= 400
            && status < 500
            && status !== 408
            && status !== 409
            && status !== 425
            && status !== 429;
    }

    const code = getErrorCode(error);
    return /^(22|23|42|PGRST1)/i.test(code);
};

const getRetryDelayMs = (attempts: number): number => {
    const exponentialDelay = RETRY_BASE_DELAY_MS * Math.max(1, 2 ** attempts);
    const jitterMultiplier = 1 - RETRY_JITTER_RATIO + (Math.random() * RETRY_JITTER_RATIO * 2);
    return Math.min(RETRY_MAX_DELAY_MS, Math.max(RETRY_BASE_DELAY_MS, Math.round(exponentialDelay * jitterMultiplier)));
};

const toOperationToken = (item: SyncQueueItem): SyncOperationToken => ({
    operationId: item.operationId,
    ownerUserId: item.ownerUserId,
    authGeneration: item.authGeneration,
    entityType: item.entityType,
    localId: item.localId,
    revision: item.revision,
    expectedRemoteRevision: item.expectedRemoteRevision,
});

const normalizeMutationResult = <T extends SavedWorkout | SavedSession>(
    value: unknown,
    operation: SyncOperation,
): SyncMutationResult<T> => {
    if (value && typeof value === 'object' && 'status' in value) {
        return value as SyncMutationResult<T>;
    }

    if (value === null && operation === 'delete') {
        return { status: 'deleted', record: null, remoteRevision: 0 };
    }

    if (value && typeof value === 'object') {
        const record = value as T;
        return {
            status: 'applied',
            record,
            remoteRevision: record.sync?.baseRevision ?? record.sync?.revision ?? 0,
        };
    }

    throw new Error('Cloud sync returned an invalid mutation response.');
};

const hasLocalLibraryData = (workouts: SavedWorkout[], sessions: SavedSession[]): boolean => {
    return workouts.length > 0 || sessions.length > 0;
};

const resolveFirstSyncChoice = (params: {
    localHasData: boolean;
    remoteHasData: boolean;
    choice?: FirstSyncChoice;
}): FirstSyncChoice | null => {
    const { localHasData, remoteHasData, choice } = params;

    if (localHasData && !remoteHasData) {
        return 'upload-local';
    }

    if (!localHasData && remoteHasData) {
        return 'replace-local';
    }

    if (!localHasData && !remoteHasData) {
        return 'upload-local';
    }

    return choice ?? null;
};

export const useSyncController = (params: {
    account: AccountSnapshot;
    savedWorkouts: SavedWorkout[];
    savedSessions: SavedSession[];
}): {
    visibleWorkouts: SavedWorkout[];
    visibleSessions: SavedSession[];
    syncSnapshot?: AccountSyncSnapshot;
    syncActions?: AccountSyncActions;
} => {
    const { account, savedWorkouts, savedSessions } = params;
    const client = getSupabaseClient();
    const [isOnline, setIsOnline] = useState(() => (
        typeof navigator === 'undefined' ? true : navigator.onLine
    ));
    const [retryClock, setRetryClock] = useState(0);
    const processingRef = useRef<ActiveSyncProcess | null>(null);

    const {
        syncEnabled,
        firstSyncState,
        currentUserId,
        authGeneration,
        queuedOperations,
        queueStatus,
        syncError,
        authExpired,
        lastSyncedAt,
        recoveryBackup,
        setCurrentUser,
        beginEnableSync,
        cancelEnableSync,
        markFirstSyncProcessing,
        completeEnableSync,
        disableSync,
        clearExpiredRecoveryBackup,
        isOperationCurrent,
        markQueuePending,
        markQueueSyncing,
        markQueuePausedOffline,
        markQueuePausedAuth,
        markQueueError,
        clearQueueError,
        acknowledgeUpsert,
        acknowledgeDelete,
        incrementAttempt,
        retryFailedOperations,
        resetForNewSession,
    } = useSyncStore(useShallow((state) => ({
        syncEnabled: state.syncEnabled,
        firstSyncState: state.firstSyncState,
        currentUserId: state.currentUserId,
        authGeneration: state.authGeneration,
        queuedOperations: state.queuedOperations,
        queueStatus: state.queueStatus,
        syncError: state.syncError,
        authExpired: state.authExpired,
        lastSyncedAt: state.lastSyncedAt,
        recoveryBackup: state.recoveryBackup,
        setCurrentUser: state.setCurrentUser,
        beginEnableSync: state.beginEnableSync,
        cancelEnableSync: state.cancelEnableSync,
        markFirstSyncProcessing: state.markFirstSyncProcessing,
        completeEnableSync: state.completeEnableSync,
        disableSync: state.disableSync,
        clearExpiredRecoveryBackup: state.clearExpiredRecoveryBackup,
        isOperationCurrent: state.isOperationCurrent,
        markQueuePending: state.markQueuePending,
        markQueueSyncing: state.markQueueSyncing,
        markQueuePausedOffline: state.markQueuePausedOffline,
        markQueuePausedAuth: state.markQueuePausedAuth,
        markQueueError: state.markQueueError,
        clearQueueError: state.clearQueueError,
        acknowledgeUpsert: state.acknowledgeUpsert,
        acknowledgeDelete: state.acknowledgeDelete,
        incrementAttempt: state.incrementAttempt,
        retryFailedOperations: state.retryFailedOperations,
        resetForNewSession: state.resetForNewSession,
    })));

    const replaceLibrariesFromSync = useWorkoutStore((state) => state.replaceLibrariesFromSync);
    const acknowledgeSyncedWorkout = useWorkoutStore((state) => state.acknowledgeSyncedWorkout);
    const acknowledgeSyncedSession = useWorkoutStore((state) => state.acknowledgeSyncedSession);
    const purgeDeletedWorkout = useWorkoutStore((state) => state.purgeDeletedWorkout);
    const purgeDeletedSession = useWorkoutStore((state) => state.purgeDeletedSession);

    const visibleWorkouts = useMemo(
        () => savedWorkouts.filter((workout) => !workout.sync?.pendingDelete),
        [savedWorkouts],
    );
    const visibleSessions = useMemo(
        () => savedSessions.filter((session) => !session.sync?.pendingDelete),
        [savedSessions],
    );

    const userId = account.session?.user.id ?? null;
    const canUseCloudSync = canAccessCloudSync(account.entitlement);

    const isCurrentAuthContext = useCallback((expectedUserId: string, expectedAuthGeneration: string): boolean => {
        const state = useSyncStore.getState();
        return state.currentUserId === expectedUserId && state.authGeneration === expectedAuthGeneration;
    }, []);

    useEffect(() => {
        if (userId) {
            setCurrentUser(userId);
            return;
        }

        resetForNewSession();
    }, [resetForNewSession, setCurrentUser, userId]);

    useEffect(() => {
        clearExpiredRecoveryBackup();
    }, [clearExpiredRecoveryBackup, recoveryBackup]);

    useEffect(() => {
        const activeProcess = processingRef.current;
        if (activeProcess && (
            activeProcess.ownerUserId !== userId
            || activeProcess.ownerUserId !== currentUserId
            || activeProcess.authGeneration !== authGeneration
        )) {
            activeProcess.cancelled = true;
        }
    }, [authGeneration, currentUserId, userId]);

    useEffect(() => {
        const syncStatus = !canUseCloudSync || !syncEnabled
            ? 'disabled'
            : queueStatus === 'syncing'
                ? 'syncing'
                : (syncError || authExpired)
                    ? 'error'
                    : 'idle';
        useAccountStore.getState().setSyncStatus(syncStatus);
    }, [authExpired, canUseCloudSync, queueStatus, syncEnabled, syncError]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const handleOnline = () => {
            setIsOnline(true);
            if (syncEnabled) {
                markQueuePending();
            }
        };
        const handleOffline = () => {
            setIsOnline(false);
            if (syncEnabled) {
                markQueuePausedOffline();
            }
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [markQueuePausedOffline, markQueuePending, syncEnabled]);

    useEffect(() => {
        let nextRetry: number | null = null;
        for (const item of queuedOperations) {
            if (item.deadLetteredAt !== null || !item.nextRetryAt) {
                continue;
            }

            const retryAt = new Date(item.nextRetryAt).getTime();
            if (Number.isFinite(retryAt) && (nextRetry === null || retryAt < nextRetry)) {
                nextRetry = retryAt;
            }
        }

        if (!nextRetry) {
            return undefined;
        }

        const delay = Math.max(0, nextRetry - Date.now());
        const timeoutId = window.setTimeout(() => {
            setRetryClock(Date.now());
        }, delay);

        return () => window.clearTimeout(timeoutId);
    }, [queuedOperations, retryClock]);

    const runFirstSync = useCallback(async (choice?: FirstSyncChoice): Promise<AccountActionResult> => {
        if (!client || !userId || !canUseCloudSync) {
            return { ok: false, message: 'Cloud sync is only available for signed-in Plus users.' };
        }

        if (currentUserId !== userId) {
            return { ok: false, message: 'Your account session changed. Try enabling sync again.' };
        }

        const actionAuthGeneration = authGeneration;

        const backup = createSyncRecoveryBackup({
            reason: 'first-sync',
            syncEnabled,
            firstSyncOnboardingState: firstSyncState === 'processing' ? 'in-progress' : 'not-started',
            queueStatus: queueStatus === 'pending'
                ? 'queued'
                : queueStatus === 'paused-auth' || queueStatus === 'paused-offline'
                    ? 'paused'
                    : queueStatus === 'dead-letter'
                        ? 'error'
                        : queueStatus,
            workouts: visibleWorkouts,
            sessions: visibleSessions,
        });

        try {
            const presence = await inspectRemoteSyncPresence(client, userId);
            if (!isCurrentAuthContext(userId, actionAuthGeneration)) {
                return { ok: false, message: 'Your account session changed before sync setup completed.' };
            }
            const localHasData = hasLocalLibraryData(visibleWorkouts, visibleSessions);
            const effectiveChoice = resolveFirstSyncChoice({
                localHasData,
                remoteHasData: presence.hasData,
                choice,
            });

            beginEnableSync(backup, presence.hasData);

            if (!effectiveChoice) {
                return {
                    ok: false,
                    message: 'Choose whether this device uploads its local library or replaces it with cloud data.',
                    requiresChoice: true,
                };
            }

            markFirstSyncProcessing(effectiveChoice);

            if (effectiveChoice === 'replace-local') {
                const snapshot = await fetchRemoteLibrarySnapshot(client, userId);
                if (!isCurrentAuthContext(userId, actionAuthGeneration)) {
                    return { ok: false, message: 'Your account session changed before sync setup completed.' };
                }
                replaceLibrariesFromSync(snapshot);
            } else {
                const snapshot = await overwriteRemoteLibraryWithLocal(client, userId, visibleWorkouts, visibleSessions);
                if (!isCurrentAuthContext(userId, actionAuthGeneration)) {
                    return { ok: false, message: 'Your account session changed before sync setup completed.' };
                }
                replaceLibrariesFromSync(snapshot);
            }

            if (!isCurrentAuthContext(userId, actionAuthGeneration)) {
                return { ok: false, message: 'Your account session changed before sync setup completed.' };
            }
            completeEnableSync(userId, new Date().toISOString());
            clearQueueError();
            return {
                ok: true,
                message: effectiveChoice === 'replace-local'
                    ? 'This device now matches your cloud library.'
                    : 'This device uploaded its local library to cloud sync.',
            };
        } catch (error: unknown) {
            const message = getErrorMessage(error);
            if (!isCurrentAuthContext(userId, actionAuthGeneration)) {
                return { ok: false, message: 'Your account session changed before sync setup completed.' };
            }
            cancelEnableSync();
            markQueueError(message);
            return { ok: false, message };
        }
    }, [
        beginEnableSync,
        authGeneration,
        cancelEnableSync,
        clearQueueError,
        client,
        completeEnableSync,
        currentUserId,
        firstSyncState,
        canUseCloudSync,
        isCurrentAuthContext,
        markFirstSyncProcessing,
        markQueueError,
        queueStatus,
        replaceLibrariesFromSync,
        syncEnabled,
        userId,
        visibleSessions,
        visibleWorkouts,
    ]);

    const syncNow = useCallback(async (): Promise<AccountActionResult> => {
        if (!client || !userId || !canUseCloudSync) {
            return { ok: false, message: 'Cloud sync is only available for signed-in Plus users.' };
        }

        if (currentUserId !== userId) {
            return { ok: false, message: 'Your account session changed. Try syncing again.' };
        }

        const actionAuthGeneration = authGeneration;

        if (!syncEnabled) {
            return { ok: false, message: 'Enable cloud sync on this device first.' };
        }

        if (!isOnline) {
            markQueuePausedOffline();
            return { ok: false, message: 'You are offline. Sync will resume when you reconnect.' };
        }

        clearQueueError();
        markQueuePending();

        if (queuedOperations.length === 0) {
            try {
                markQueueSyncing();
                const snapshot = await fetchRemoteLibrarySnapshot(client, userId);
                if (!isCurrentAuthContext(userId, actionAuthGeneration)) {
                    return { ok: false, message: 'Your account session changed before sync completed.' };
                }
                replaceLibrariesFromSync(snapshot);
                useSyncStore.getState().markQueuePending();
                useSyncStore.setState({ lastSyncedAt: new Date().toISOString() });
                return { ok: true, message: 'Cloud sync completed.' };
            } catch (error: unknown) {
                const message = getErrorMessage(error);
                if (!isCurrentAuthContext(userId, actionAuthGeneration)) {
                    return { ok: false, message: 'Your account session changed before sync completed.' };
                }
                if (isSyncAuthExpiredError(error)) {
                    markQueuePausedAuth(message);
                    return { ok: false, message };
                }
                markQueueError(message);
                return { ok: false, message };
            }
        }

        return { ok: true, message: `Queued ${queuedOperations.length} local change${queuedOperations.length === 1 ? '' : 's'} for sync.` };
    }, [
        authGeneration,
        clearQueueError,
        client,
        currentUserId,
        isOnline,
        isCurrentAuthContext,
        canUseCloudSync,
        markQueueError,
        markQueuePausedAuth,
        markQueuePausedOffline,
        markQueuePending,
        markQueueSyncing,
        queuedOperations.length,
        replaceLibrariesFromSync,
        syncEnabled,
        userId,
    ]);

    const retrySync = useCallback(async (): Promise<AccountActionResult> => {
        if (!syncEnabled) {
            return { ok: false, message: 'Enable cloud sync on this device first.' };
        }
        if (!userId || currentUserId !== userId) {
            return { ok: false, message: 'Your account session changed. Sign in again before retrying.' };
        }
        retryFailedOperations();
        clearQueueError();
        markQueuePending();
        return { ok: true, message: 'Retrying cloud sync.' };
    }, [clearQueueError, currentUserId, markQueuePending, retryFailedOperations, syncEnabled, userId]);

    const resumeSync = useCallback(async (): Promise<AccountActionResult> => {
        if (!syncEnabled || !userId || currentUserId !== userId) {
            return { ok: false, message: 'Sign in to the sync account before resuming cloud sync.' };
        }
        clearQueueError();
        markQueuePending();
        return { ok: true, message: 'Cloud sync resumed.' };
    }, [clearQueueError, currentUserId, markQueuePending, syncEnabled, userId]);

    const turnSyncOff = useCallback(async (): Promise<AccountActionResult> => {
        if (!syncEnabled) {
            return { ok: true, message: 'Cloud sync is already off on this device.' };
        }

        disableSync();
        return { ok: true, message: 'Cloud sync turned off for this device.' };
    }, [disableSync, syncEnabled]);

    useEffect(() => {
        if (!client || !userId || !syncEnabled || !canUseCloudSync || processingRef.current) {
            return;
        }

        if (currentUserId !== userId) {
            return;
        }

        if (!isOnline) {
            markQueuePausedOffline();
            return;
        }

        if (authExpired) {
            return;
        }

        const now = Date.now();
        let nextItem: SyncQueueItem | undefined;
        let queueHasNoRunnableWork = queuedOperations.length === 0;
        for (const item of queuedOperations) {
            if (item.deadLetteredAt !== null) {
                continue;
            }

            queueHasNoRunnableWork = false;
            if (
                item.ownerUserId === userId
                && item.authGeneration === authGeneration
                && (!item.nextRetryAt || new Date(item.nextRetryAt).getTime() <= now)
            ) {
                nextItem = item;
                break;
            }
        }

        if (!nextItem) {
            if (
                queueHasNoRunnableWork
                && !syncError
                && queueStatus !== 'idle'
                && queueStatus !== 'dead-letter'
            ) {
                markQueuePending();
            }
            return;
        }

        const token = toOperationToken(nextItem);
        const activeProcess: ActiveSyncProcess = {
            id: `${nextItem.operationId}:${Date.now()}`,
            ownerUserId: userId,
            authGeneration,
            operationId: nextItem.operationId,
            cancelled: false,
        };
        const isActive = (): boolean => (
            !activeProcess.cancelled
            && isCurrentAuthContext(userId, authGeneration)
            && isOperationCurrent(token)
        );
        const deadLetter = (message: string): void => {
            if (!isActive()) {
                return;
            }
            incrementAttempt({
                ...token,
                nextRetryAt: null,
                error: message,
                deadLetter: true,
                failedAt: new Date().toISOString(),
            });
        };

        processingRef.current = activeProcess;
        markQueueSyncing();

        void (async () => {
            try {
                if (!isActive()) {
                    return;
                }

                if (nextItem.entityType === 'workout') {
                    const workout = useWorkoutStore.getState().savedWorkouts.find((entry) => (
                        entry.id === nextItem.entityId || entry.sync?.localId === nextItem.localId
                    ));
                    if (!workout) {
                        deadLetter('The queued workout snapshot is no longer available. Save it again to retry.');
                        return;
                    }
                    if (
                        workout.sync?.localId !== nextItem.localId
                        || workout.sync.revision !== nextItem.revision
                        || workout.sync.baseRevision !== nextItem.expectedRemoteRevision
                    ) {
                        deadLetter('The queued workout revision no longer matches local data. Save it again to retry.');
                        return;
                    }

                    const rawResult = await pushWorkoutMutation(
                        client,
                        userId,
                        workout,
                        nextItem.expectedRemoteRevision,
                    );
                    if (!isActive()) {
                        return;
                    }

                    const result = normalizeMutationResult<SavedWorkout>(rawResult, nextItem.operation);
                    if (result.status === 'conflict') {
                        deadLetter(`Cloud conflict: ${result.reason || 'a newer remote workout revision exists'}. Review the local copy and retry manually.`);
                        return;
                    }

                    const syncedAt = new Date().toISOString();
                    if (result.status === 'deleted' || nextItem.operation === 'delete') {
                        if (purgeDeletedWorkout(workout.id, token)) {
                            acknowledgeDelete({ ...token, syncedAt });
                        }
                        return;
                    }

                    const acknowledged = acknowledgeSyncedWorkout(result.record, {
                        localId: nextItem.localId,
                        revision: nextItem.revision,
                        remoteRevision: result.remoteRevision,
                    });
                    if (acknowledged) {
                        acknowledgeUpsert({ ...token, syncedAt });
                    }
                    return;
                }

                const session = useWorkoutStore.getState().savedSessions.find((entry) => (
                    entry.id === nextItem.entityId || entry.sync?.localId === nextItem.localId
                ));
                if (!session) {
                    deadLetter('The queued session snapshot is no longer available. Save it again to retry.');
                    return;
                }
                if (
                    session.sync?.localId !== nextItem.localId
                    || session.sync.revision !== nextItem.revision
                    || session.sync.baseRevision !== nextItem.expectedRemoteRevision
                ) {
                    deadLetter('The queued session revision no longer matches local data. Save it again to retry.');
                    return;
                }

                const rawResult = await pushSessionMutation(
                    client,
                    userId,
                    session,
                    nextItem.expectedRemoteRevision,
                );
                if (!isActive()) {
                    return;
                }

                const result = normalizeMutationResult<SavedSession>(rawResult, nextItem.operation);
                if (result.status === 'conflict') {
                    deadLetter(`Cloud conflict: ${result.reason || 'a newer remote session revision exists'}. Review the local copy and retry manually.`);
                    return;
                }

                const syncedAt = new Date().toISOString();
                if (result.status === 'deleted' || nextItem.operation === 'delete') {
                    if (purgeDeletedSession(session.id, token)) {
                        acknowledgeDelete({ ...token, syncedAt });
                    }
                    return;
                }

                const acknowledged = acknowledgeSyncedSession(result.record, {
                    localId: nextItem.localId,
                    revision: nextItem.revision,
                    remoteRevision: result.remoteRevision,
                });
                if (acknowledged) {
                    acknowledgeUpsert({ ...token, syncedAt });
                }
            } catch (error: unknown) {
                if (!isActive()) {
                    return;
                }

                const message = getErrorMessage(error);
                if (isSyncAuthExpiredError(error)) {
                    markQueuePausedAuth(message);
                    return;
                }

                const nextAttempt = nextItem.attempts + 1;
                const shouldDeadLetter = isPermanentSyncError(error) || nextAttempt >= MAX_RETRY_ATTEMPTS;
                const nextRetryAt = shouldDeadLetter
                    ? null
                    : new Date(Date.now() + getRetryDelayMs(nextItem.attempts)).toISOString();
                incrementAttempt({
                    ...token,
                    nextRetryAt,
                    error: shouldDeadLetter
                        ? `${message} Manual retry is required.`
                        : message,
                    deadLetter: shouldDeadLetter,
                    failedAt: new Date().toISOString(),
                });
            } finally {
                if (processingRef.current?.id === activeProcess.id) {
                    processingRef.current = null;
                }

                const latestSyncState = useSyncStore.getState();
                if (
                    isCurrentAuthContext(userId, authGeneration)
                    && latestSyncState.queueStatus === 'syncing'
                ) {
                    latestSyncState.markQueuePending();
                }
            }
        })();
    }, [
        acknowledgeDelete,
        acknowledgeSyncedSession,
        acknowledgeSyncedWorkout,
        acknowledgeUpsert,
        authExpired,
        authGeneration,
        canUseCloudSync,
        client,
        currentUserId,
        incrementAttempt,
        isCurrentAuthContext,
        isOnline,
        isOperationCurrent,
        markQueuePausedAuth,
        markQueuePausedOffline,
        markQueuePending,
        markQueueSyncing,
        purgeDeletedSession,
        purgeDeletedWorkout,
        queueStatus,
        queuedOperations,
        retryClock,
        syncEnabled,
        syncError,
        userId,
    ]);

    const syncSnapshot = useMemo<AccountSyncSnapshot | undefined>(() => {
        if (!canUseCloudSync) {
            return undefined;
        }

        if (!syncEnabled) {
            return {
                status: 'enable-sync',
                detail: 'Cloud sync is available on Plus, but it stays off until you enable it on this device.',
                isOnline,
            };
        }

        if (authExpired) {
            return {
                status: 'auth-expired',
                detail: syncError ?? 'Your sync session expired. Sign in again to resume cloud sync.',
                lastSyncedAt,
                isOnline,
            };
        }

        if (!isOnline || queueStatus === 'paused-offline') {
            return {
                status: 'offline',
                detail: 'You are offline. Local changes stay on this device and will sync when you are back online.',
                lastSyncedAt,
                isOnline: false,
            };
        }

        if (queueStatus === 'syncing') {
            return {
                status: 'syncing',
                detail: `Syncing ${queuedOperations.length} pending change${queuedOperations.length === 1 ? '' : 's'} in the background.`,
                lastSyncedAt,
                isOnline,
            };
        }

        const deadLetterCount = queuedOperations.reduce(
            (count, item) => count + (item.deadLetteredAt !== null ? 1 : 0),
            0,
        );
        if (deadLetterCount > 0 || queueStatus === 'dead-letter') {
            return {
                status: 'sync-error',
                detail: `${deadLetterCount || 1} local change${deadLetterCount === 1 ? '' : 's'} need manual retry. ${syncError ?? 'Review the local copy, then retry cloud sync.'}`,
                lastSyncedAt,
                isOnline,
                isPaused: true,
            };
        }

        if (syncError) {
            return {
                status: 'sync-error',
                detail: syncError,
                lastSyncedAt,
                isOnline,
            };
        }

        if (firstSyncState === 'processing') {
            return {
                status: 'syncing',
                detail: 'Setting up cloud sync for this device.',
                lastSyncedAt,
                isOnline,
            };
        }

        if (firstSyncState === 'pending-choice') {
            return {
                status: 'first-sync-required',
                detail: recoveryBackup
                    ? 'Pick whether this device uploads its local library or replaces it with cloud data.'
                    : 'Run the first sync to choose how this device connects to cloud data.',
                lastSyncedAt,
                isOnline,
            };
        }

        return {
            status: 'last-synced',
            detail: queuedOperations.length > 0
                ? `${queuedOperations.length} local change${queuedOperations.length === 1 ? '' : 's'} waiting to sync.`
                : 'Cloud sync is on for this device.',
            lastSyncedAt,
            isOnline,
        };
    }, [authExpired, canUseCloudSync, firstSyncState, isOnline, lastSyncedAt, queueStatus, queuedOperations, recoveryBackup, syncEnabled, syncError]);

    const syncActions = useMemo<AccountSyncActions | undefined>(() => {
        if (!canUseCloudSync) {
            return undefined;
        }

        return {
            onEnableSync: runFirstSync,
            onSyncNow: syncNow,
            onRetrySync: retrySync,
            onResumeSync: resumeSync,
            onDisableSync: turnSyncOff,
        };
    }, [canUseCloudSync, retrySync, resumeSync, runFirstSync, syncNow, turnSyncOff]);

    return {
        visibleWorkouts,
        visibleSessions,
        syncSnapshot,
        syncActions,
    };
};
