import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
    FirstSyncChoice,
    FirstSyncState,
    SyncEntityType,
    SyncOperation,
    SyncPendingCounts,
    SyncQueueItem,
    SyncQueueStatus,
    SyncRecoveryBackup,
} from '@/types/sync';

const SYNC_STORE_VERSION = 1;

const buildPendingCounts = (queue: SyncQueueItem[]): SyncPendingCounts => ({
    total: queue.length,
    workouts: queue.filter((item) => item.entityType === 'workout').length,
    sessions: queue.filter((item) => item.entityType === 'session').length,
    deletes: queue.filter((item) => item.operation === 'delete').length,
});

const createQueueId = (entityType: SyncEntityType, localId: string): string => `${entityType}:${localId}`;

interface PersistedSyncState {
    syncEnabled: boolean;
    firstSyncState: FirstSyncState;
    currentUserId: string | null;
    onboardingRemoteHasData: boolean;
    recoveryBackup: SyncRecoveryBackup | null;
    pendingChoice: FirstSyncChoice | null;
    queuedOperations: SyncQueueItem[];
    lastSyncedAt: string | null;
}

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
    enqueueEntityChange: (params: {
        entityType: SyncEntityType;
        entityId: string;
        localId: string;
        operation: SyncOperation;
        revision: number;
        queuedAt?: string;
    }) => void;
    markQueuePending: () => void;
    markQueueSyncing: () => void;
    markQueuePausedOffline: () => void;
    markQueuePausedAuth: (message: string) => void;
    markQueueError: (message: string) => void;
    clearQueueError: () => void;
    acknowledgeUpsert: (params: { entityType: SyncEntityType; localId: string; syncedAt: string }) => void;
    acknowledgeDelete: (params: { entityType: SyncEntityType; localId: string; syncedAt: string }) => void;
    incrementAttempt: (params: { entityType: SyncEntityType; localId: string; nextRetryAt: string | null; error: string }) => void;
    resetForNewSession: () => void;
}

const initialPersistedState: PersistedSyncState = {
    syncEnabled: false,
    firstSyncState: 'idle',
    currentUserId: null,
    onboardingRemoteHasData: false,
    recoveryBackup: null,
    pendingChoice: null,
    queuedOperations: [],
    lastSyncedAt: null,
};

const initialRuntimeState = {
    queueStatus: 'idle' as SyncQueueStatus,
    syncError: null as string | null,
    authExpired: false,
    pendingCounts: buildPendingCounts([]),
    hydrateComplete: false,
};

export const useSyncStore = create<SyncState>()(
    persist(
        (set, get) => ({
            ...initialPersistedState,
            ...initialRuntimeState,
            markHydrated: () => set({ hydrateComplete: true }),
            setCurrentUser: (userId) => set((state) => {
                if (!userId) {
                    return {
                        ...initialPersistedState,
                        currentUserId: null,
                        ...initialRuntimeState,
                        hydrateComplete: state.hydrateComplete,
                    };
                }

                if (state.currentUserId && state.currentUserId !== userId) {
                    return {
                        ...initialPersistedState,
                        currentUserId: userId,
                        ...initialRuntimeState,
                        hydrateComplete: state.hydrateComplete,
                    };
                }

                return { currentUserId: userId };
            }),
            beginEnableSync: (backup, remoteHasData) => set({
                firstSyncState: 'pending-choice',
                onboardingRemoteHasData: remoteHasData,
                recoveryBackup: backup,
                pendingChoice: null,
                syncError: null,
                authExpired: false,
                queueStatus: get().queuedOperations.length > 0 ? 'pending' : 'idle',
            }),
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
            completeEnableSync: (userId, syncedAt) => set((state) => ({
                syncEnabled: true,
                firstSyncState: 'idle',
                currentUserId: userId,
                onboardingRemoteHasData: false,
                recoveryBackup: state.recoveryBackup,
                pendingChoice: null,
                lastSyncedAt: syncedAt,
                queueStatus: state.queuedOperations.length > 0 ? 'pending' : 'idle',
                syncError: null,
                authExpired: false,
                pendingCounts: buildPendingCounts(state.queuedOperations),
            })),
            disableSync: () => set((state) => ({
                syncEnabled: false,
                firstSyncState: 'idle',
                onboardingRemoteHasData: false,
                pendingChoice: null,
                queuedOperations: [],
                queueStatus: 'idle',
                syncError: null,
                authExpired: false,
                pendingCounts: buildPendingCounts([]),
            })),
            enqueueEntityChange: ({ entityType, entityId, localId, operation, revision, queuedAt }) => set((state) => {
                if (!state.syncEnabled) {
                    return state;
                }

                const nextQueuedAt = queuedAt ?? new Date().toISOString();
                const itemId = createQueueId(entityType, localId);
                const nextItem: SyncQueueItem = {
                    id: itemId,
                    entityType,
                    entityId,
                    localId,
                    operation,
                    revision,
                    queuedAt: nextQueuedAt,
                    attempts: 0,
                    nextRetryAt: null,
                    lastError: null,
                };
                const queuedOperations = state.queuedOperations.some((item) => item.id === itemId)
                    ? state.queuedOperations.map((item) => (item.id === itemId ? nextItem : item))
                    : [...state.queuedOperations, nextItem];

                return {
                    queuedOperations,
                    queueStatus: state.queueStatus === 'syncing' ? 'syncing' : 'pending',
                    pendingCounts: buildPendingCounts(queuedOperations),
                };
            }),
            markQueuePending: () => set((state) => ({
                queueStatus: state.syncEnabled && state.queuedOperations.length > 0 ? 'pending' : 'idle',
                syncError: null,
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
            acknowledgeUpsert: ({ entityType, localId, syncedAt }) => set((state) => {
                const itemId = createQueueId(entityType, localId);
                const queuedOperations = state.queuedOperations.filter((item) => item.id !== itemId);
                return {
                    queuedOperations,
                    lastSyncedAt: syncedAt,
                    queueStatus: queuedOperations.length > 0 ? 'pending' : 'idle',
                    syncError: null,
                    authExpired: false,
                    pendingCounts: buildPendingCounts(queuedOperations),
                };
            }),
            acknowledgeDelete: ({ entityType, localId, syncedAt }) => set((state) => {
                const itemId = createQueueId(entityType, localId);
                const queuedOperations = state.queuedOperations.filter((item) => item.id !== itemId);
                return {
                    queuedOperations,
                    lastSyncedAt: syncedAt,
                    queueStatus: queuedOperations.length > 0 ? 'pending' : 'idle',
                    syncError: null,
                    authExpired: false,
                    pendingCounts: buildPendingCounts(queuedOperations),
                };
            }),
            incrementAttempt: ({ entityType, localId, nextRetryAt, error }) => set((state) => {
                const itemId = createQueueId(entityType, localId);
                const queuedOperations = state.queuedOperations.map((item) => (
                    item.id === itemId
                        ? {
                            ...item,
                            attempts: item.attempts + 1,
                            nextRetryAt,
                            lastError: error,
                        }
                        : item
                ));
                return {
                    queuedOperations,
                    queueStatus: 'error',
                    syncError: error,
                    pendingCounts: buildPendingCounts(queuedOperations),
                };
            }),
            resetForNewSession: () => set((state) => ({
                ...initialPersistedState,
                currentUserId: state.currentUserId,
                ...initialRuntimeState,
                hydrateComplete: state.hydrateComplete,
            })),
        }),
        {
            name: 'myorep-sync-storage',
            version: SYNC_STORE_VERSION,
            partialize: (state) => ({
                syncEnabled: state.syncEnabled,
                firstSyncState: state.firstSyncState,
                currentUserId: state.currentUserId,
                onboardingRemoteHasData: state.onboardingRemoteHasData,
                recoveryBackup: state.recoveryBackup,
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
