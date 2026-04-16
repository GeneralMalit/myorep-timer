import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SavedSession } from '@/types/savedSessions';
import type { SavedWorkout } from '@/types/savedWorkouts';
import type {
    AccountActionResult,
    AccountSnapshot,
    AccountSyncActions,
    AccountSyncSnapshot,
    FirstSyncChoice,
} from '@/types/account';
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
import { getSupabaseClient } from '@/lib/supabase';
import { canAccessCloudSync } from '@/utils/account';
import { createSyncRecoveryBackup, isSyncAuthExpiredError } from '@/utils/sync';

const RETRY_BASE_DELAY_MS = 2_000;
const RETRY_MAX_DELAY_MS = 30_000;

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
        return error;
    }

    return 'Cloud sync failed.';
};

export const useSyncController = (params: {
    account: AccountSnapshot;
    savedWorkouts: SavedWorkout[];
    savedSessions: SavedSession[];
    sendMagicLink: (email: string) => Promise<AccountActionResult>;
}): {
    visibleWorkouts: SavedWorkout[];
    visibleSessions: SavedSession[];
    syncSnapshot?: AccountSyncSnapshot;
    syncActions?: AccountSyncActions;
} => {
    const { account, savedWorkouts, savedSessions, sendMagicLink } = params;
    const client = getSupabaseClient();
    const [isOnline, setIsOnline] = useState(() => (
        typeof navigator === 'undefined' ? true : navigator.onLine
    ));
    const [retryClock, setRetryClock] = useState(0);
    const processingRef = useRef(false);

    const {
        syncEnabled,
        firstSyncState,
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
        markQueuePending,
        markQueueSyncing,
        markQueuePausedOffline,
        markQueuePausedAuth,
        markQueueError,
        clearQueueError,
        acknowledgeUpsert,
        acknowledgeDelete,
        incrementAttempt,
        resetForNewSession,
    } = useSyncStore();

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

    useEffect(() => {
        if (userId) {
            setCurrentUser(userId);
            return;
        }

        resetForNewSession();
    }, [resetForNewSession, setCurrentUser, userId]);

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
        const nextRetry = queuedOperations
            .filter((item) => item.nextRetryAt)
            .map((item) => new Date(item.nextRetryAt as string).getTime())
            .filter((value) => Number.isFinite(value))
            .sort((a, b) => a - b)[0];

        if (!nextRetry) {
            return undefined;
        }

        const delay = Math.max(0, nextRetry - Date.now());
        const timeoutId = window.setTimeout(() => {
            setRetryClock(Date.now());
        }, delay);

        return () => window.clearTimeout(timeoutId);
    }, [queuedOperations, retryClock]);

    const runFirstSync = useCallback(async (choice: FirstSyncChoice): Promise<AccountActionResult> => {
        if (!client || !userId || !canUseCloudSync) {
            return { ok: false, message: 'Cloud sync is only available for signed-in Plus users.' };
        }

        const backup = createSyncRecoveryBackup({
            reason: 'first-sync',
            syncEnabled,
            firstSyncOnboardingState: firstSyncState === 'processing' ? 'in-progress' : 'not-started',
            queueStatus: queueStatus === 'pending' ? 'queued' : queueStatus === 'paused-auth' || queueStatus === 'paused-offline' ? 'paused' : queueStatus,
            workouts: visibleWorkouts,
            sessions: visibleSessions,
        });

        try {
            const presence = await inspectRemoteSyncPresence(client, userId);
            beginEnableSync(backup, presence.hasData);
            markFirstSyncProcessing(choice);

            if (choice === 'replace-local') {
                const snapshot = await fetchRemoteLibrarySnapshot(client, userId);
                replaceLibrariesFromSync(snapshot);
            } else {
                const snapshot = await overwriteRemoteLibraryWithLocal(client, userId, visibleWorkouts, visibleSessions);
                replaceLibrariesFromSync(snapshot);
            }

            completeEnableSync(userId, new Date().toISOString());
            clearQueueError();
            return {
                ok: true,
                message: choice === 'replace-local'
                    ? 'This device now matches your cloud library.'
                    : 'This device uploaded its local library to cloud sync.',
            };
        } catch (error: unknown) {
            const message = getErrorMessage(error);
            cancelEnableSync();
            markQueueError(message);
            return { ok: false, message };
        }
    }, [
        beginEnableSync,
        cancelEnableSync,
        clearQueueError,
        client,
        completeEnableSync,
        firstSyncState,
        canUseCloudSync,
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
                replaceLibrariesFromSync(snapshot);
                useSyncStore.getState().markQueuePending();
                useSyncStore.setState({ lastSyncedAt: new Date().toISOString() });
                return { ok: true, message: 'Cloud sync completed.' };
            } catch (error: unknown) {
                const message = getErrorMessage(error);
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
        clearQueueError,
        client,
        isOnline,
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
        clearQueueError();
        if (!syncEnabled) {
            return { ok: false, message: 'Enable cloud sync on this device first.' };
        }
        markQueuePending();
        return { ok: true, message: 'Retrying cloud sync.' };
    }, [clearQueueError, markQueuePending, syncEnabled]);

    const resumeSync = useCallback(async (): Promise<AccountActionResult> => {
        clearQueueError();
        markQueuePending();
        return { ok: true, message: 'Cloud sync resumed.' };
    }, [clearQueueError, markQueuePending]);

    const reauthenticate = useCallback(async (): Promise<AccountActionResult> => {
        const email = account.profile?.email ?? account.session?.user.email ?? '';
        if (!email) {
            return { ok: false, message: 'No email is available for this account.' };
        }

        const result = await sendMagicLink(email);
        if (!result.ok) {
            return { ok: false, message: result.message };
        }

        clearQueueError();
        return { ok: true, message: result.message };
    }, [account.profile?.email, account.session?.user.email, clearQueueError, sendMagicLink]);

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

        if (!isOnline) {
            markQueuePausedOffline();
            return;
        }

        if (authExpired) {
            return;
        }

        const now = Date.now();
        const nextItem = queuedOperations.find((item) => (
            !item.nextRetryAt || new Date(item.nextRetryAt).getTime() <= now
        ));

        if (!nextItem) {
            if (queueStatus !== 'idle' && queueStatus !== 'syncing' && !syncError) {
                markQueuePending();
            }
            return;
        }

        processingRef.current = true;
        markQueueSyncing();

        void (async () => {
            try {
                if (nextItem.entityType === 'workout') {
                    const workout = savedWorkouts.find((entry) => entry.id === nextItem.entityId || entry.sync?.localId === nextItem.localId);
                    if (!workout) {
                        acknowledgeDelete({
                            entityType: 'workout',
                            localId: nextItem.localId,
                            syncedAt: new Date().toISOString(),
                        });
                        return;
                    }

                    const remoteWorkout = await pushWorkoutMutation(client, userId, workout);
                    if (workout.sync?.pendingDelete || nextItem.operation === 'delete') {
                        acknowledgeDelete({
                            entityType: 'workout',
                            localId: nextItem.localId,
                            syncedAt: new Date().toISOString(),
                        });
                        purgeDeletedWorkout(workout.id);
                        return;
                    }

                    if (remoteWorkout) {
                        acknowledgeSyncedWorkout(remoteWorkout);
                    }
                    acknowledgeUpsert({
                        entityType: 'workout',
                        localId: nextItem.localId,
                        syncedAt: new Date().toISOString(),
                    });
                    return;
                }

                const session = savedSessions.find((entry) => entry.id === nextItem.entityId || entry.sync?.localId === nextItem.localId);
                if (!session) {
                    acknowledgeDelete({
                        entityType: 'session',
                        localId: nextItem.localId,
                        syncedAt: new Date().toISOString(),
                    });
                    return;
                }

                const remoteSession = await pushSessionMutation(client, userId, session);
                if (session.sync?.pendingDelete || nextItem.operation === 'delete') {
                    acknowledgeDelete({
                        entityType: 'session',
                        localId: nextItem.localId,
                        syncedAt: new Date().toISOString(),
                    });
                    purgeDeletedSession(session.id);
                    return;
                }

                if (remoteSession) {
                    acknowledgeSyncedSession(remoteSession);
                }
                acknowledgeUpsert({
                    entityType: 'session',
                    localId: nextItem.localId,
                    syncedAt: new Date().toISOString(),
                });
            } catch (error: unknown) {
                const message = getErrorMessage(error);
                if (isSyncAuthExpiredError(error)) {
                    markQueuePausedAuth(message);
                    return;
                }

                const nextRetryAt = new Date(
                    Date.now() + Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * Math.max(1, 2 ** nextItem.attempts)),
                ).toISOString();
                incrementAttempt({
                    entityType: nextItem.entityType,
                    localId: nextItem.localId,
                    nextRetryAt,
                    error: message,
                });
                markQueueError(message);
            } finally {
                processingRef.current = false;
            }
        })();
    }, [
        acknowledgeDelete,
        acknowledgeSyncedSession,
        acknowledgeSyncedWorkout,
        acknowledgeUpsert,
        authExpired,
        client,
        incrementAttempt,
        isOnline,
        canUseCloudSync,
        markQueueError,
        markQueuePausedAuth,
        markQueuePausedOffline,
        markQueuePending,
        markQueueSyncing,
        purgeDeletedSession,
        purgeDeletedWorkout,
        queueStatus,
        queuedOperations,
        savedSessions,
        savedWorkouts,
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
    }, [authExpired, canUseCloudSync, firstSyncState, isOnline, lastSyncedAt, queueStatus, queuedOperations.length, recoveryBackup, syncEnabled, syncError]);

    const syncActions = useMemo<AccountSyncActions | undefined>(() => {
        if (!canUseCloudSync) {
            return undefined;
        }

        return {
            onEnableSync: runFirstSync,
            onSyncNow: syncNow,
            onRetrySync: retrySync,
            onResumeSync: resumeSync,
            onReauthenticate: reauthenticate,
            onDisableSync: turnSyncOff,
        };
    }, [canUseCloudSync, reauthenticate, retrySync, resumeSync, runFirstSync, syncNow, turnSyncOff]);

    return {
        visibleWorkouts,
        visibleSessions,
        syncSnapshot,
        syncActions,
    };
};
