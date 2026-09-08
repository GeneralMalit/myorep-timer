import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import type {
    FirstSyncChoice,
    FirstSyncState,
    SyncEntityType,
    SyncOperation,
    SyncOperationToken,
    SyncPendingCounts,
    SyncQueueItem,
    SyncQueueStatus,
    SyncRecoveryBackup,
} from '@/types/sync';

const SYNC_STORE_VERSION = 2;
export const SYNC_RECOVERY_BACKUP_TTL_MS = 24 * 60 * 60 * 1000;

let fallbackIdCounter = 0;

const createImmutableId = (prefix: string): string => {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }

    fallbackIdCounter += 1;
    return `${prefix}-${Date.now()}-${fallbackIdCounter}`;
};

const createAuthGeneration = (): string => createImmutableId('auth');
const createOperationId = (): string => createImmutableId('operation');

const buildPendingCounts = (queue: SyncQueueItem[]): SyncPendingCounts => {
    const counts: Required<SyncPendingCounts> = {
        total: queue.length,
        workouts: 0,
        sessions: 0,
        deletes: 0,
        upserts: 0,
        deadLetters: 0,
    };

    for (const item of queue) {
        if (item.entityType === 'workout') {
            counts.workouts += 1;
        } else {
            counts.sessions += 1;
        }

        if (item.operation === 'delete') {
            counts.deletes += 1;
        } else {
            counts.upserts += 1;
        }

        if (item.deadLetteredAt !== null) {
            counts.deadLetters += 1;
        }
    }

    return counts;
};

const createQueueId = (entityType: SyncEntityType, localId: string): string => `${entityType}:${localId}`;

const hasRunnableOperations = (queue: SyncQueueItem[]): boolean => queue.some((item) => item.deadLetteredAt === null);
const hasDeadLetters = (queue: SyncQueueItem[]): boolean => queue.some((item) => item.deadLetteredAt !== null);

const resolveSettledQueueStatus = (queue: SyncQueueItem[], syncEnabled: boolean): SyncQueueStatus => {
    if (!syncEnabled || queue.length === 0) {
        return 'idle';
    }

    if (hasRunnableOperations(queue)) {
        return 'pending';
    }

    return hasDeadLetters(queue) ? 'dead-letter' : 'idle';
};

const isRecoveryBackupExpired = (backup: SyncRecoveryBackup | null, nowMs = Date.now()): boolean => {
    if (!backup) {
        return false;
    }

    const explicitExpiry = backup.expiresAt ? new Date(backup.expiresAt).getTime() : Number.NaN;
    if (Number.isFinite(explicitExpiry)) {
        return explicitExpiry <= nowMs;
    }

    const createdAt = new Date(backup.createdAt).getTime();
    return !Number.isFinite(createdAt) || createdAt + SYNC_RECOVERY_BACKUP_TTL_MS <= nowMs;
};

const withRecoveryBackupExpiry = (backup: SyncRecoveryBackup): SyncRecoveryBackup => {
    if (backup.expiresAt && Number.isFinite(new Date(backup.expiresAt).getTime())) {
        return backup;
    }

    const createdAt = new Date(backup.createdAt).getTime();
    const expiryBase = Number.isFinite(createdAt) ? createdAt : Date.now();
    return {
        ...backup,
        expiresAt: new Date(expiryBase + SYNC_RECOVERY_BACKUP_TTL_MS).toISOString(),
    };
};

const matchesOperation = (item: SyncQueueItem, token: SyncOperationToken): boolean => (
    item.operationId === token.operationId
    && item.ownerUserId === token.ownerUserId
    && item.authGeneration === token.authGeneration
    && item.entityType === token.entityType
    && item.localId === token.localId
    && item.revision === token.revision
    && item.expectedRemoteRevision === token.expectedRemoteRevision
);

interface PersistedSyncState {
    syncEnabled: boolean;
    firstSyncState: FirstSyncState;
    currentUserId: string | null;
    authGeneration: string;
    onboardingRemoteHasData: boolean;
    recoveryBackup: SyncRecoveryBackup | null;
    pendingChoice: FirstSyncChoice | null;
    queuedOperations: SyncQueueItem[];
    lastSyncedAt: string | null;
}

const persistedSyncStatesAreEqual = (left: PersistedSyncState, right: PersistedSyncState) => (
    left.syncEnabled === right.syncEnabled
    && left.firstSyncState === right.firstSyncState
    && left.currentUserId === right.currentUserId
    && left.authGeneration === right.authGeneration
    && left.onboardingRemoteHasData === right.onboardingRemoteHasData
    && left.recoveryBackup === right.recoveryBackup
    && left.pendingChoice === right.pendingChoice
    && left.queuedOperations === right.queuedOperations
    && left.lastSyncedAt === right.lastSyncedAt
);

const createSyncPersistStorage = (): PersistStorage<PersistedSyncState> => {
    let lastPersistedState: PersistedSyncState | null = null;
    let pendingWrite: { name: string; value: StorageValue<PersistedSyncState> } | null = null;
    let writeQueued = false;

    const flushPendingWrite = () => {
        writeQueued = false;
        const write = pendingWrite;
        pendingWrite = null;
        if (!write || typeof localStorage === 'undefined') {
            return;
        }

        localStorage.setItem(write.name, JSON.stringify(write.value));
    };

    return {
        getItem: (name) => {
            if (typeof localStorage === 'undefined') return null;
            const serialized = localStorage.getItem(name);
            if (!serialized) return null;

            try {
                const value = JSON.parse(serialized) as StorageValue<PersistedSyncState>;
                lastPersistedState = value.state;
                return value;
            } catch {
                return null;
            }
        },
        setItem: (name, value) => {
            if (lastPersistedState && persistedSyncStatesAreEqual(lastPersistedState, value.state)) {
                return;
            }

            lastPersistedState = value.state;
            pendingWrite = { name, value };
            if (writeQueued) {
                return;
            }

            writeQueued = true;
            queueMicrotask(flushPendingWrite);
        },
        removeItem: (name) => {
            pendingWrite = null;
            if (typeof localStorage !== 'undefined') localStorage.removeItem(name);
            lastPersistedState = null;
        },
    };
};

interface SyncState extends PersistedSyncState {
    queueStatus: SyncQueueStatus;
    syncError: string | null;
    authExpired: boolean;
    pendingCounts: SyncPendingCounts;
    hydrateComplete: boolean;
    markHydrated: () => void;
    setCurrentUser: (userId: string | null) => void;
    beginEnableSync: (backup: SyncRecoveryBackup, remoteHasData: boolean) => void;
    cancelEnableSync: () => void;
    markFirstSyncProcessing: (choice: FirstSyncChoice) => void;
    completeEnableSync: (userId: string, syncedAt: string) => void;
    disableSync: () => void;
    clearExpiredRecoveryBackup: (nowMs?: number) => void;
    enqueueEntityChange: (params: {
        entityType: SyncEntityType;
        entityId: string;
        localId: string;
        operation: SyncOperation;
        revision: number;
        expectedRemoteRevision?: number | null;
        queuedAt?: string;
    }) => void;
    isOperationCurrent: (token: SyncOperationToken) => boolean;
    markQueuePending: () => void;
    markQueueSyncing: () => void;
    markQueuePausedOffline: () => void;
    markQueuePausedAuth: (message: string) => void;
    markQueueError: (message: string) => void;
    clearQueueError: () => void;
    acknowledgeUpsert: (params: SyncOperationToken & { syncedAt: string }) => boolean;
    acknowledgeDelete: (params: SyncOperationToken & { syncedAt: string }) => boolean;
    incrementAttempt: (params: SyncOperationToken & {
        nextRetryAt: string | null;
        error: string;
        deadLetter: boolean;
        failedAt?: string;
    }) => void;
    retryFailedOperations: () => void;
    resetForNewSession: () => void;
}

const createInitialPersistedState = (authGeneration = createAuthGeneration()): PersistedSyncState => ({
    syncEnabled: false,
    firstSyncState: 'idle',
    currentUserId: null,
    authGeneration,
    onboardingRemoteHasData: false,
    recoveryBackup: null,
    pendingChoice: null,
    queuedOperations: [],
    lastSyncedAt: null,
});

const initialPersistedState = createInitialPersistedState();

const initialRuntimeState = {
    queueStatus: 'idle' as SyncQueueStatus,
    syncError: null as string | null,
    authExpired: false,
    pendingCounts: buildPendingCounts([]),
    hydrateComplete: false,
};

const removeAcknowledgedOperation = (
    state: SyncState,
    token: SyncOperationToken,
    syncedAt: string,
): Partial<SyncState> | null => {
    const currentItem = state.queuedOperations.find((item) => matchesOperation(item, token));
    if (!currentItem) {
        return null;
    }

    const queuedOperations = state.queuedOperations.filter((item) => item.operationId !== token.operationId);
    return {
        queuedOperations,
        lastSyncedAt: syncedAt,
        queueStatus: resolveSettledQueueStatus(queuedOperations, state.syncEnabled),
        syncError: hasDeadLetters(queuedOperations) ? state.syncError : null,
        authExpired: false,
        pendingCounts: buildPendingCounts(queuedOperations),
    };
};

export const migratePersistedSyncState = (persistedState: unknown): PersistedSyncState => {
    const record = persistedState && typeof persistedState === 'object'
        ? persistedState as Partial<PersistedSyncState> & { queuedOperations?: unknown[] }
        : {};
    const currentUserId = typeof record.currentUserId === 'string' && record.currentUserId.trim()
        ? record.currentUserId
        : null;
    const authGeneration = typeof record.authGeneration === 'string' && record.authGeneration.trim()
        ? record.authGeneration
        : createAuthGeneration();
    const queuedOperations = currentUserId && Array.isArray(record.queuedOperations)
        ? record.queuedOperations.flatMap((value): SyncQueueItem[] => {
            if (!value || typeof value !== 'object') {
                return [];
            }

            const item = value as Partial<SyncQueueItem>;
            if (
                (item.entityType !== 'workout' && item.entityType !== 'session')
                || (item.operation !== 'upsert' && item.operation !== 'delete')
                || typeof item.localId !== 'string'
                || typeof item.entityId !== 'string'
                || typeof item.revision !== 'number'
            ) {
                return [];
            }

            return [{
                id: createQueueId(item.entityType, item.localId),
                operationId: typeof item.operationId === 'string' && item.operationId
                    ? item.operationId
                    : createOperationId(),
                ownerUserId: currentUserId,
                authGeneration,
                entityType: item.entityType,
                entityId: item.entityId,
                localId: item.localId,
                operation: item.operation,
                revision: item.revision,
                expectedRemoteRevision: typeof item.expectedRemoteRevision === 'number' && item.expectedRemoteRevision >= 0
                    ? Math.floor(item.expectedRemoteRevision)
                    : null,
                queuedAt: typeof item.queuedAt === 'string' ? item.queuedAt : new Date().toISOString(),
                attempts: typeof item.attempts === 'number' && item.attempts >= 0 ? Math.floor(item.attempts) : 0,
                nextRetryAt: typeof item.nextRetryAt === 'string' ? item.nextRetryAt : null,
                lastError: typeof item.lastError === 'string' ? item.lastError : null,
                deadLetteredAt: typeof item.deadLetteredAt === 'string' ? item.deadLetteredAt : null,
            }];
        })
        : [];

    return {
        ...createInitialPersistedState(authGeneration),
        syncEnabled: record.syncEnabled === true,
        firstSyncState: record.firstSyncState === 'pending-choice' || record.firstSyncState === 'processing'
            ? record.firstSyncState
            : 'idle',
        currentUserId,
        onboardingRemoteHasData: record.onboardingRemoteHasData === true,
        recoveryBackup: record.recoveryBackup && !isRecoveryBackupExpired(record.recoveryBackup)
            ? withRecoveryBackupExpiry(record.recoveryBackup)
            : null,
        pendingChoice: record.pendingChoice === 'upload-local' || record.pendingChoice === 'replace-local'
            ? record.pendingChoice
            : null,
        queuedOperations,
        lastSyncedAt: typeof record.lastSyncedAt === 'string' ? record.lastSyncedAt : null,
    };
};

export const useSyncStore = create<SyncState>()(
    persist(
        (set, get) => ({
            ...initialPersistedState,
            ...initialRuntimeState,
            markHydrated: () => set((state) => ({
                hydrateComplete: true,
                recoveryBackup: isRecoveryBackupExpired(state.recoveryBackup) ? null : state.recoveryBackup,
                queueStatus: resolveSettledQueueStatus(state.queuedOperations, state.syncEnabled),
                pendingCounts: buildPendingCounts(state.queuedOperations),
            })),
            setCurrentUser: (userId) => set((state) => {
                if (!userId) {
                    return {
                        ...createInitialPersistedState(),
                        ...initialRuntimeState,
                        hydrateComplete: state.hydrateComplete,
                    };
                }

                if (state.currentUserId !== userId) {
                    return {
                        ...createInitialPersistedState(createAuthGeneration()),
                        currentUserId: userId,
                        ...initialRuntimeState,
                        hydrateComplete: state.hydrateComplete,
                    };
                }

                return { currentUserId: userId };
            }),
            beginEnableSync: (backup, remoteHasData) => set((state) => ({
                firstSyncState: 'pending-choice',
                onboardingRemoteHasData: remoteHasData,
                recoveryBackup: withRecoveryBackupExpiry(backup),
                pendingChoice: null,
                syncError: null,
                authExpired: false,
                queueStatus: resolveSettledQueueStatus(state.queuedOperations, state.syncEnabled),
            })),
            cancelEnableSync: () => set({
                firstSyncState: 'idle',
                onboardingRemoteHasData: false,
                recoveryBackup: null,
                pendingChoice: null,
                syncError: null,
            }),
            markFirstSyncProcessing: (choice) => set({
                firstSyncState: 'processing',
                pendingChoice: choice,
                syncError: null,
            }),
            completeEnableSync: (userId, syncedAt) => set((state) => {
                if (state.currentUserId !== userId) {
                    return state;
                }

                return {
                    syncEnabled: true,
                    firstSyncState: 'idle',
                    onboardingRemoteHasData: false,
                    recoveryBackup: null,
                    pendingChoice: null,
                    lastSyncedAt: syncedAt,
                    queueStatus: resolveSettledQueueStatus(state.queuedOperations, true),
                    syncError: null,
                    authExpired: false,
                    pendingCounts: buildPendingCounts(state.queuedOperations),
                };
            }),
            disableSync: () => set((state) => ({
                syncEnabled: false,
                firstSyncState: 'idle',
                onboardingRemoteHasData: false,
                recoveryBackup: null,
                pendingChoice: null,
                queuedOperations: [],
                queueStatus: 'idle',
                syncError: null,
                authExpired: false,
                pendingCounts: buildPendingCounts([]),
                authGeneration: createAuthGeneration(),
                currentUserId: state.currentUserId,
            })),
            clearExpiredRecoveryBackup: (nowMs = Date.now()) => set((state) => (
                isRecoveryBackupExpired(state.recoveryBackup, nowMs)
                    ? { recoveryBackup: null }
                    : state
            )),
            enqueueEntityChange: ({
                entityType,
                entityId,
                localId,
                operation,
                revision,
                expectedRemoteRevision = null,
                queuedAt,
            }) => set((state) => {
                if (!state.syncEnabled || !state.currentUserId) {
                    return state;
                }

                const nextQueuedAt = queuedAt ?? new Date().toISOString();
                const itemId = createQueueId(entityType, localId);
                const nextItem: SyncQueueItem = {
                    id: itemId,
                    operationId: createOperationId(),
                    ownerUserId: state.currentUserId,
                    authGeneration: state.authGeneration,
                    entityType,
                    entityId,
                    localId,
                    operation,
                    revision,
                    expectedRemoteRevision,
                    queuedAt: nextQueuedAt,
                    attempts: 0,
                    nextRetryAt: null,
                    lastError: null,
                    deadLetteredAt: null,
                };
                const existingIndex = state.queuedOperations.findIndex((item) => item.id === itemId);
                const queuedOperations = [...state.queuedOperations];
                if (existingIndex === -1) {
                    queuedOperations.push(nextItem);
                } else {
                    queuedOperations[existingIndex] = nextItem;
                }

                return {
                    queuedOperations,
                    queueStatus: state.queueStatus === 'syncing' ? 'syncing' : 'pending',
                    syncError: null,
                    authExpired: false,
                    pendingCounts: buildPendingCounts(queuedOperations),
                };
            }),
            isOperationCurrent: (token) => get().queuedOperations.some((item) => matchesOperation(item, token)),
            markQueuePending: () => set((state) => ({
                queueStatus: resolveSettledQueueStatus(state.queuedOperations, state.syncEnabled),
                syncError: hasDeadLetters(state.queuedOperations) ? state.syncError : null,
                authExpired: false,
                pendingCounts: buildPendingCounts(state.queuedOperations),
            })),
            markQueueSyncing: () => set({
                queueStatus: 'syncing',
                syncError: null,
                authExpired: false,
            }),
            markQueuePausedOffline: () => set({
                queueStatus: 'paused-offline',
            }),
            markQueuePausedAuth: (message) => set({
                queueStatus: 'paused-auth',
                syncError: message,
                authExpired: true,
            }),
            markQueueError: (message) => set({
                queueStatus: 'error',
                syncError: message,
                authExpired: false,
            }),
            clearQueueError: () => set({
                syncError: null,
                authExpired: false,
            }),
            acknowledgeUpsert: (params) => {
                let acknowledged = false;
                set((state) => {
                    const update = removeAcknowledgedOperation(state, params, params.syncedAt);
                    acknowledged = update !== null;
                    return update ?? state;
                });
                return acknowledged;
            },
            acknowledgeDelete: (params) => {
                let acknowledged = false;
                set((state) => {
                    const update = removeAcknowledgedOperation(state, params, params.syncedAt);
                    acknowledged = update !== null;
                    return update ?? state;
                });
                return acknowledged;
            },
            incrementAttempt: ({ nextRetryAt, error, deadLetter, failedAt, ...token }) => set((state) => {
                const failedOperation = state.queuedOperations.find((item) => matchesOperation(item, token));
                if (!failedOperation) {
                    return state;
                }

                const queuedOperations = state.queuedOperations.map((item) => (
                    item.operationId === failedOperation.operationId
                        ? {
                            ...item,
                            attempts: item.attempts + 1,
                            nextRetryAt: deadLetter ? null : nextRetryAt,
                            lastError: error,
                            deadLetteredAt: deadLetter ? failedAt ?? new Date().toISOString() : null,
                        }
                        : item
                ));
                return {
                    queuedOperations,
                    queueStatus: deadLetter ? 'dead-letter' : 'error',
                    syncError: error,
                    authExpired: false,
                    pendingCounts: buildPendingCounts(queuedOperations),
                };
            }),
            retryFailedOperations: () => set((state) => {
                const queuedOperations = state.queuedOperations.map((item) => (
                    item.lastError || item.deadLetteredAt
                        ? {
                            ...item,
                            attempts: 0,
                            nextRetryAt: null,
                            lastError: null,
                            deadLetteredAt: null,
                        }
                        : item
                ));
                return {
                    queuedOperations,
                    queueStatus: resolveSettledQueueStatus(queuedOperations, state.syncEnabled),
                    syncError: null,
                    authExpired: false,
                    pendingCounts: buildPendingCounts(queuedOperations),
                };
            }),
            resetForNewSession: () => set((state) => ({
                ...createInitialPersistedState(),
                ...initialRuntimeState,
                hydrateComplete: state.hydrateComplete,
            })),
        }),
        {
            name: 'myorep-sync-storage',
            storage: createSyncPersistStorage(),
            version: SYNC_STORE_VERSION,
            migrate: (persistedState) => migratePersistedSyncState(persistedState),
            partialize: (state) => ({
                syncEnabled: state.syncEnabled,
                firstSyncState: state.firstSyncState,
                currentUserId: state.currentUserId,
                authGeneration: state.authGeneration,
                onboardingRemoteHasData: state.onboardingRemoteHasData,
                recoveryBackup: isRecoveryBackupExpired(state.recoveryBackup) ? null : state.recoveryBackup,
                pendingChoice: state.pendingChoice,
                queuedOperations: state.queuedOperations,
                lastSyncedAt: state.lastSyncedAt,
            }),
            onRehydrateStorage: () => () => {
                useSyncStore.getState().markHydrated();
            },
        },
    ),
);
