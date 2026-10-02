import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { SavedSession } from '@/types/savedSessions';
import type { SavedWorkout } from '@/types/savedWorkouts';
import type { FirstSyncState, SyncEntityType, SyncQueueItem, SyncQueueStatus } from '@/types/sync';
import { useAccountStore } from '@/store/useAccountStore';
import { useSyncStore } from '@/store/useSyncStore';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { canAccessCloudSync } from '@/utils/account';

type SaveRecord = SavedSession | SavedWorkout;
type SaveTarget = {
    entityType: SyncEntityType;
    entityId: string;
    localId: string;
    revision: number | null;
    updatedAt: string;
};
type SaveAttempt = {
    contextKey: string | null;
    ownerUserId: string | null;
    authGeneration: string;
    targets: SaveTarget[];
};

export interface BuilderSaveFeedback {
    tone: 'pending' | 'confirmed' | 'local' | 'paused' | 'error';
    message: string;
}

const makeTarget = (
    entityType: SyncEntityType,
    record: SaveRecord,
): SaveTarget => ({
    entityType,
    entityId: record.id,
    localId: record.sync?.localId ?? record.id,
    revision: record.sync?.revision ?? null,
    updatedAt: record.updatedAt,
});

const collectUniqueTargets = (
    records: Array<{ entityType: SyncEntityType; record: SaveRecord }>,
): SaveTarget[] => {
    const targets = new Map<string, SaveTarget>();
    for (const { entityType, record } of records) {
        const target = makeTarget(entityType, record);
        targets.set(`${entityType}:${target.localId}`, target);
    }
    return [...targets.values()];
};


const linkedWorkoutIds = (session: SavedSession): Set<string> => new Set(
    session.nodes.flatMap((node) => (
        node.type === 'workout' && node.sourceWorkoutId ? [node.sourceWorkoutId] : []
    )),
);

const captureSessionTargets = (
    sessionId: string,
    savedSessions: SavedSession[],
    savedWorkouts: SavedWorkout[],
): SaveTarget[] => {
    const session = savedSessions.find((entry) => entry.id === sessionId);
    if (!session) {
        return [];
    }

    const workoutIds = linkedWorkoutIds(session);
    const affectedSessions = savedSessions.filter((entry) => (
        entry.id === sessionId
        || entry.nodes.some((node) => node.type === 'workout' && node.sourceWorkoutId && workoutIds.has(node.sourceWorkoutId))
    ));
    const affectedWorkouts = savedWorkouts.filter((workout) => workoutIds.has(workout.id));

    return collectUniqueTargets([
        ...affectedSessions.map((record) => ({ entityType: 'session' as const, record })),
        ...affectedWorkouts.map((record) => ({ entityType: 'workout' as const, record })),
    ]);
};

const captureWorkoutTargets = (
    workoutId: string,
    savedSessions: SavedSession[],
    savedWorkouts: SavedWorkout[],
): SaveTarget[] => {
    const workout = savedWorkouts.find((entry) => entry.id === workoutId);
    if (!workout) {
        return [];
    }

    const linkedSessions = savedSessions.filter((session) => (
        session.nodes.some((node) => node.type === 'workout' && node.sourceWorkoutId === workoutId)
    ));

    return collectUniqueTargets([
        { entityType: 'workout', record: workout },
        ...linkedSessions.map((record) => ({ entityType: 'session' as const, record })),
    ]);
};

const findTargetRecord = (
    target: SaveTarget,
    savedSessions: SavedSession[],
    savedWorkouts: SavedWorkout[],
): SaveRecord | undefined => target.entityType === 'session'
    ? savedSessions.find((record) => record.id === target.entityId || record.sync?.localId === target.localId)
    : savedWorkouts.find((record) => record.id === target.entityId || record.sync?.localId === target.localId);

const isTargetAcknowledged = (
    target: SaveTarget,
    record: SaveRecord | undefined,
    queuedOperations: SyncQueueItem[],
): boolean => {
    const sync = record?.sync;
    const currentOperations = queuedOperations.filter((item) => (
        item.entityType === target.entityType
        && item.localId === target.localId
        && (target.revision === null || item.revision >= target.revision)
    ));
    return Boolean(
        record
        && sync
        && target.revision !== null
        && sync.localId === target.localId
        && sync.revision === target.revision
        && record.updatedAt === target.updatedAt
        && !sync.dirty
        && !sync.pendingDelete
        && Boolean(sync.remoteId?.trim())
        && sync.baseRevision === target.revision
        && Boolean(sync.lastSyncedAt)
        && currentOperations.length === 0,
    );
};

const resolveFeedback = (params: {
    attempt: SaveAttempt | null;
    savedSessions: SavedSession[];
    savedWorkouts: SavedWorkout[];
    queuedOperations: SyncQueueItem[];
    currentUserId: string | null;
    authGeneration: string;
    canUseCloudSync: boolean;
    syncEnabled: boolean;
    firstSyncState: FirstSyncState;
    queueStatus: SyncQueueStatus;
    syncError: string | null;
    authExpired: boolean;
    isOnline: boolean;
}): BuilderSaveFeedback | null => {
    const {
        attempt,
        savedSessions,
        savedWorkouts,
        queuedOperations,
        currentUserId,
        authGeneration,
        canUseCloudSync,
        syncEnabled,
        firstSyncState,
        queueStatus,
        syncError,
        authExpired,
        isOnline,
    } = params;
    if (
        !attempt
        || attempt.ownerUserId !== currentUserId
        || attempt.authGeneration !== authGeneration
    ) {
        return null;
    }

    const targetStates = attempt.targets.map((target) => {
        const record = findTargetRecord(target, savedSessions, savedWorkouts);
        return {
            target,
            record,
            acknowledged: isTargetAcknowledged(target, record, queuedOperations),
        };
    });
    const unresolved = targetStates.filter(({ acknowledged }) => !acknowledged);
    if (attempt.targets.length > 0 && unresolved.length === 0) {
        return { tone: 'confirmed', message: 'Saved locally and synced to the cloud.' };
    }

    const relevantQueueItems = unresolved.flatMap(({ target }) => queuedOperations.filter((item) => (
        item.entityType === target.entityType
        && item.localId === target.localId
        && (item.revision === target.revision || (target.revision !== null && item.revision > target.revision))
    )));
    const failedItem = relevantQueueItems.find((item) => item.deadLetteredAt || item.lastError);
    if (failedItem) {
        return {
            tone: 'error',
            message: failedItem.lastError
                ? `Saved locally, but cloud sync failed: ${failedItem.lastError}`
                : 'Saved locally, but this revision needs a manual cloud-sync retry.',
        };
    }

    if (!canUseCloudSync) {
        return { tone: 'local', message: 'Saved locally. Cloud sync is unavailable for this account.' };
    }
    if (firstSyncState === 'pending-choice') {
        return { tone: 'local', message: 'Saved locally. Choose a first-sync option before this can reach the cloud.' };
    }
    if (firstSyncState === 'processing') {
        return { tone: 'pending', message: 'Saved locally. The first cloud sync is still in progress.' };
    }
    if (!syncEnabled) {
        return { tone: 'local', message: 'Saved locally. Cloud sync is off on this device.' };
    }
    if (!isOnline || queueStatus === 'paused-offline') {
        return { tone: 'paused', message: 'Saved locally while offline. It will sync when you reconnect.' };
    }
    if (authExpired || queueStatus === 'paused-auth' || queueStatus === 'paused') {
        return { tone: 'paused', message: 'Saved locally. Cloud sync is paused; this save is still waiting for confirmation.' };
    }
    if (syncError || queueStatus === 'error' || queueStatus === 'dead-letter') {
        return {
            tone: 'error',
            message: syncError
                ? `Saved locally. Cloud sync has an error; this save is still waiting: ${syncError}`
                : 'Saved locally. Cloud sync has an error; this save is still waiting.',
        };
    }

    const superseded = unresolved.some(({ target, record }) => (
        target.revision !== null
        && record?.sync?.revision !== undefined
        && record.sync.revision > target.revision
    ));
    if (superseded) {
        return { tone: 'pending', message: 'Saved locally. A newer linked revision is waiting for cloud confirmation.' };
    }

    if (queueStatus === 'syncing') {
        return { tone: 'pending', message: 'Saved locally. Syncing; waiting for cloud confirmation.' };
    }
    const count = unresolved.length;
    return {
        tone: 'pending',
        message: count === 1
            ? 'Saved locally. Waiting for cloud confirmation.'
            : `Saved locally. Waiting for cloud confirmation of ${count} saved revisions.`,
    };
};

export const useBuilderSaveFeedback = (contextKey: string | null) => {
    const { savedSessions, savedWorkouts } = useWorkoutStore(useShallow((state) => ({
        savedSessions: state.savedSessions,
        savedWorkouts: state.savedWorkouts,
    })));
    const {
        queuedOperations,
        syncEnabled,
        firstSyncState,
        queueStatus,
        syncError,
        authExpired,
        currentUserId,
        authGeneration,
    } = useSyncStore(useShallow((state) => ({
        queuedOperations: state.queuedOperations,
        syncEnabled: state.syncEnabled,
        firstSyncState: state.firstSyncState,
        queueStatus: state.queueStatus,
        syncError: state.syncError,
        authExpired: state.authExpired,
        currentUserId: state.currentUserId,
        authGeneration: state.authGeneration,
    })));
    const entitlement = useAccountStore((state) => state.entitlement);
    const [isOnline, setIsOnline] = useState(() => (
        typeof navigator === 'undefined' ? true : navigator.onLine
    ));
    const [attempt, setAttempt] = useState<SaveAttempt | null>(null);
    const contextKeyRef = useRef(contextKey);
    contextKeyRef.current = contextKey;

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        if (
            attempt
            && (
                attempt.contextKey !== contextKey
                || attempt.ownerUserId !== currentUserId
                || attempt.authGeneration !== authGeneration
            )
        ) {
            setAttempt(null);
        }
    }, [attempt, authGeneration, contextKey, currentUserId]);

    const startAttempt = useCallback((
        targets: SaveTarget[],
        saveContextKey: string | null,
        ownerUserId: string | null,
        saveAuthGeneration: string,
    ) => {
        setAttempt({
            contextKey: saveContextKey,
            ownerUserId,
            authGeneration: saveAuthGeneration,
            targets,
        });
    }, []);

    const trackSessionSave = useCallback((sessionId: string) => {
        const state = useWorkoutStore.getState();
        const syncState = useSyncStore.getState();
        startAttempt(
            captureSessionTargets(sessionId, state.savedSessions, state.savedWorkouts),
            sessionId,
            syncState.currentUserId,
            syncState.authGeneration,
        );
    }, [startAttempt]);

    const trackWorkoutSave = useCallback((workoutId: string) => {
        const state = useWorkoutStore.getState();
        const syncState = useSyncStore.getState();
        startAttempt(
            captureWorkoutTargets(workoutId, state.savedSessions, state.savedWorkouts),
            contextKeyRef.current,
            syncState.currentUserId,
            syncState.authGeneration,
        );
    }, [startAttempt]);

    const dismiss = useCallback(() => setAttempt(null), []);
    const feedback = useMemo(() => resolveFeedback({
        attempt,
        savedSessions,
        savedWorkouts,
        queuedOperations,
        currentUserId,
        authGeneration,
        canUseCloudSync: canAccessCloudSync(entitlement),
        syncEnabled,
        firstSyncState,
        queueStatus,
        syncError,
        authExpired,
        isOnline,
    }), [
        attempt,
        authExpired,
        authGeneration,
        currentUserId,
        entitlement,
        firstSyncState,
        isOnline,
        queueStatus,
        queuedOperations,
        savedSessions,
        savedWorkouts,
        syncEnabled,
        syncError,
    ]);

    return { feedback, dismiss, trackSessionSave, trackWorkoutSave };
};
