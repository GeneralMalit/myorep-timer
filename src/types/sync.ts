export interface SyncMetadata {
    localId: string;
    remoteId: string | null;
    revision: number;
    updatedAt: string;
    dirty: boolean;
    pendingDelete: boolean;
    deletedAt: string | null;
    lastSyncedAt: string | null;
}

export type SyncEntityType = 'workout' | 'session';
export type SyncEntityKind = SyncEntityType;
export type SyncOperation = 'upsert' | 'delete';
export type SyncQueueStatus =
    | 'idle'
    | 'pending'
    | 'syncing'
    | 'paused'
    | 'paused-offline'
    | 'paused-auth'
    | 'error';
export type FirstSyncState = 'idle' | 'pending-choice' | 'processing';
export type FirstSyncChoice = 'upload-local' | 'replace-local';

export interface SyncQueueItem {
    id: string;
    entityType: SyncEntityType;
    entityId: string;
    localId: string;
    operation: SyncOperation;
    revision: number;
    queuedAt: string;
    attempts: number;
    nextRetryAt: string | null;
    lastError: string | null;
}

export interface SyncPendingCounts {
    total: number;
    workouts: number;
    sessions: number;
    deletes: number;
    upserts?: number;
}

export interface SyncRecoveryBackup {
    createdAt: string;
    workouts: unknown;
    sessions: unknown;
    queue?: SyncQueueItem[];
    syncEnabled?: boolean;
    queueStatus?: SyncQueueStatus;
    firstSyncState?: FirstSyncState;
    pendingCounts?: SyncPendingCounts;
}

export interface SupabaseProfileRow {
    id: string;
    email: string | null;
    display_name: string | null;
    created_at: string;
    updated_at: string;
}

export interface SupabaseEntitlementRow {
    user_id: string;
    plan: 'free' | 'plus';
    cloud_sync_enabled: boolean;
    updated_at: string;
}

export interface SupabaseSavedWorkoutRow {
    id: string;
    user_id: string;
    local_id: string;
    name: string;
    sets: string;
    reps: string;
    seconds: string;
    rest: string;
    myo_reps: string;
    myo_work_secs: string;
    times_used: number;
    last_used_at: string | null;
    revision: number;
    updated_at: string;
    deleted_at: string | null;
    created_at?: string;
}

export type SupabaseSavedWorkoutWriteRow = Omit<SupabaseSavedWorkoutRow, 'id'> & {
    id?: string;
};

export interface SupabaseSavedSessionRow {
    id: string;
    user_id: string;
    local_id: string;
    name: string;
    nodes: unknown[];
    times_used: number;
    last_used_at: string | null;
    revision: number;
    updated_at: string;
    deleted_at: string | null;
    created_at?: string;
}

export type SupabaseSavedSessionWriteRow = Omit<SupabaseSavedSessionRow, 'id'> & {
    id?: string;
};
