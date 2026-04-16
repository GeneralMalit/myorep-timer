import type { SavedSession, SavedSessionExportRecordV1 } from '@/types/savedSessions';
import type { SavedWorkout, SavedWorkoutExportRecordV1 } from '@/types/savedWorkouts';
import type {
    SupabaseSavedSessionRow,
    SupabaseSavedSessionWriteRow,
    SupabaseSavedWorkoutRow,
    SupabaseSavedWorkoutWriteRow,
} from '@/types/sync';

export type SyncEntityKind = 'workout' | 'session';
export type SyncQueueAction = 'upsert' | 'delete';
export type SyncQueueStatus = 'idle' | 'queued' | 'syncing' | 'paused' | 'error';
export type SyncFirstSyncOnboardingState = 'not-started' | 'in-progress' | 'completed';
export type SyncRemotePresenceSource = 'local-id' | 'remote-id' | 'both' | 'missing';

export interface SyncPendingCounts {
    workouts: number;
    sessions: number;
    upserts: number;
    deletes: number;
    total: number;
}

export interface SyncQueueEntry {
    id: string;
    entity: SyncEntityKind;
    action: SyncQueueAction;
    localId: string;
    remoteId: string | null;
    localRevision: number;
    queuedAt: string;
    lastAttemptAt: string | null;
    attemptCount: number;
    dedupeKey: string;
    error: string | null;
}

export interface SyncQueueEntryInput {
    entity: SyncEntityKind;
    action: SyncQueueAction;
    localId: string;
    remoteId?: string | null;
    localRevision?: number;
    nowIso?: string;
    id?: string;
}

export interface SyncRemotePresence {
    entity: SyncEntityKind;
    localId: string;
    remoteId: string | null;
    hasRemoteRow: boolean;
    source: SyncRemotePresenceSource;
    deletedAt: string | null;
    revision: number;
    updatedAt: string;
    lastSyncedAt: string | null;
}

export interface SyncReadContract<TRemoteRow, TLocalRecord> {
    entity: SyncEntityKind;
    select: string;
    mapRemoteRow: (row: TRemoteRow) => TLocalRecord | null;
}

export interface SyncWriteContract<TLocalRecord, TContext, TWriteRow> {
    entity: SyncEntityKind;
    toWriteRow: (record: TLocalRecord, context: TContext) => TWriteRow;
}

export interface SyncReadResult<TRemoteRow> {
    workouts: SupabaseSavedWorkoutRow[];
    sessions: SupabaseSavedSessionRow[];
    raw: {
        workouts: TRemoteRow[];
        sessions: TRemoteRow[];
    };
}

export interface SyncWriteResult {
    written: number;
    skipped: number;
    deleted: number;
}

export interface SyncRecoveryBackup {
    schemaVersion: 1;
    createdAt: string;
    reason: string;
    syncEnabled: boolean;
    firstSyncOnboardingState: SyncFirstSyncOnboardingState;
    queueStatus: SyncQueueStatus;
    pendingCounts: SyncPendingCounts;
    queue: SyncQueueEntry[];
    workouts: SavedWorkoutExportRecordV1[];
    sessions: SavedSessionExportRecordV1[];
}

export interface SyncDomainSnapshot {
    syncEnabled: boolean;
    firstSyncOnboardingState: SyncFirstSyncOnboardingState;
    queueStatus: SyncQueueStatus;
    pendingCounts: SyncPendingCounts;
    syncError: string | null;
    authExpired: boolean;
    lastSyncAt: string | null;
    lastSuccessfulSyncAt: string | null;
    queue: SyncQueueEntry[];
}

export interface SyncDomainActions {
    setSyncEnabled: (enabled: boolean) => void;
    enableSync: () => void;
    disableSync: () => void;
    setFirstSyncOnboardingState: (state: SyncFirstSyncOnboardingState) => void;
    startFirstSyncOnboarding: () => void;
    completeFirstSyncOnboarding: () => void;
    resetFirstSyncOnboarding: () => void;
    setQueueStatus: (status: SyncQueueStatus) => void;
    setPendingCounts: (counts: Partial<SyncPendingCounts>) => void;
    refreshPendingCounts: () => void;
    enqueueSyncEntry: (entry: SyncQueueEntryInput) => string;
    replaceSyncQueue: (queue: SyncQueueEntry[]) => void;
    dedupeSyncQueue: () => void;
    ackSyncEntry: (entryId: string) => void;
    clearSyncQueue: () => void;
    setSyncError: (message: string | null) => void;
    clearSyncError: () => void;
    markAuthExpired: () => void;
    clearAuthExpired: () => void;
    setLastSyncAt: (timestamp: string | null) => void;
    setLastSuccessfulSyncAt: (timestamp: string | null) => void;
    resetSyncDomain: () => void;
}

export interface SyncDomainState extends SyncDomainSnapshot, SyncDomainActions {}

export interface SyncRemoteSnapshot {
    workouts: SupabaseSavedWorkoutRow[];
    sessions: SupabaseSavedSessionRow[];
    workoutPresence: Record<string, SyncRemotePresence>;
    sessionPresence: Record<string, SyncRemotePresence>;
}

export interface SyncLoadResult {
    workouts: SavedWorkout[];
    sessions: SavedSession[];
    remoteSnapshot: SyncRemoteSnapshot;
}

export interface SyncWritePayload {
    workouts: SupabaseSavedWorkoutWriteRow[];
    sessions: SupabaseSavedSessionWriteRow[];
    deletedWorkoutIds: string[];
    deletedSessionIds: string[];
}
