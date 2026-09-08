import type { SupabaseClient } from '@supabase/supabase-js';
import type { SavedSession } from '@/types/savedSessions';
import type { SavedWorkout } from '@/types/savedWorkouts';
import type {
    SupabaseSavedSessionRow,
    SupabaseSavedWorkoutRow,
} from '@/types/sync';
import { clearSyncMetadata, normalizeSyncMetadata, toSupabaseSavedSessionWriteRow, toSupabaseSavedWorkoutWriteRow } from '@/utils/sync';
import { normalizeSessionNodeForPersistence } from '@/utils/workoutProgression';

export const SYNC_SNAPSHOT_PAGE_SIZE = 250;
export const SYNC_MAX_LIBRARY_ROWS = 5_000;

const WORKOUT_SELECT = 'id,user_id,local_id,name,sets,reps,seconds,rest,myo_reps,myo_work_secs,times_used,last_used_at,revision,updated_at,deleted_at,created_at';
const SESSION_SELECT = 'id,user_id,local_id,name,nodes,times_used,last_used_at,revision,updated_at,deleted_at,created_at';

export type SyncMutationConflictReason = 'stale_revision' | 'tombstone_wins' | 'revision_mismatch';

export type SyncMutationResult<TRecord> =
    | {
        status: 'applied';
        record: TRecord;
        remoteRevision: number;
    }
    | {
        status: 'deleted';
        record: null;
        remoteRevision: number;
    }
    | {
        status: 'conflict';
        reason: SyncMutationConflictReason;
        expectedRevision: number;
        remoteRevision: number;
        remoteDeletedAt: string | null;
        remoteRecord: TRecord | null;
    };

interface MutationRpcResponse<TRow> {
    status: 'applied' | 'deleted' | 'conflict';
    reason: SyncMutationConflictReason | null;
    expected_revision: number;
    remote_revision: number;
    remote_deleted_at: string | null;
    remote_record: TRow | null;
}

interface OverwriteLibraryRpcResponse {
    workouts: SupabaseSavedWorkoutRow[];
    sessions: SupabaseSavedSessionRow[];
}

const mapSupabaseSessionNodeSourceWorkoutIds = (nodes: unknown[]): unknown[] => {
    return nodes.map((node) => {
        if (!node || typeof node !== 'object') {
            return node;
        }

        const record = node as Record<string, unknown>;
        if (record.type !== 'workout') {
            return record;
        }

        const sourceWorkoutId = typeof record.sourceWorkoutId === 'string' && record.sourceWorkoutId.trim()
            ? record.sourceWorkoutId
            : null;

        return normalizeSessionNodeForPersistence({
            ...record,
            sourceWorkoutId,
            notes: typeof record.notes === 'string' ? record.notes : '',
        });
    });
};

export const fromSupabaseSavedWorkoutRow = (row: SupabaseSavedWorkoutRow): SavedWorkout => ({
    id: row.local_id,
    name: row.name,
    sets: row.sets,
    reps: row.reps,
    seconds: row.seconds,
    rest: row.rest,
    myoReps: row.myo_reps,
    myoWorkSecs: row.myo_work_secs,
    timesUsed: row.times_used,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at ?? row.updated_at,
    updatedAt: row.updated_at,
    sync: clearSyncMetadata(
        normalizeSyncMetadata({
            localId: row.local_id,
            remoteId: row.id,
            revision: row.revision,
            updatedAt: row.updated_at,
            dirty: false,
            pendingDelete: Boolean(row.deleted_at),
            deletedAt: row.deleted_at,
            lastSyncedAt: row.updated_at,
        }, row.local_id, row.updated_at),
        row.local_id,
        row.updated_at,
    ),
});

export const fromSupabaseSavedSessionRow = (row: SupabaseSavedSessionRow): SavedSession => ({
    id: row.local_id,
    name: row.name,
    nodes: mapSupabaseSessionNodeSourceWorkoutIds(Array.isArray(row.nodes) ? row.nodes : []) as SavedSession['nodes'],
    timesUsed: row.times_used,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at ?? row.updated_at,
    updatedAt: row.updated_at,
    sync: clearSyncMetadata(
        normalizeSyncMetadata({
            localId: row.local_id,
            remoteId: row.id,
            revision: row.revision,
            updatedAt: row.updated_at,
            dirty: false,
            pendingDelete: Boolean(row.deleted_at),
            deletedAt: row.deleted_at,
            lastSyncedAt: row.updated_at,
        }, row.local_id, row.updated_at),
        row.local_id,
        row.updated_at,
    ),
});

export const inspectRemoteSyncPresence = async (
    client: SupabaseClient,
    userId: string,
): Promise<{ hasData: boolean; workoutCount: number; sessionCount: number }> => {
    const [workoutsResult, sessionsResult] = await Promise.all([
        client
            .from('saved_workouts')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .is('deleted_at', null),
        client
            .from('saved_sessions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .is('deleted_at', null),
    ]);

    if (workoutsResult.error) {
        throw workoutsResult.error;
    }
    if (sessionsResult.error) {
        throw sessionsResult.error;
    }

    const workoutCount = workoutsResult.count ?? 0;
    const sessionCount = sessionsResult.count ?? 0;

    return {
        hasData: workoutCount > 0 || sessionCount > 0,
        workoutCount,
        sessionCount,
    };
};

const fetchActiveRows = async <TRow>(
    client: SupabaseClient,
    table: 'saved_workouts' | 'saved_sessions',
    select: string,
    userId: string,
): Promise<TRow[]> => {
    const rows: TRow[] = [];
    let offset = 0;

    while (rows.length <= SYNC_MAX_LIBRARY_ROWS) {
        const remainingWithOverflowSentinel = (SYNC_MAX_LIBRARY_ROWS + 1) - rows.length;
        const pageSize = Math.min(SYNC_SNAPSHOT_PAGE_SIZE, remainingWithOverflowSentinel);
        const result = await client
            .from(table)
            .select(select)
            .eq('user_id', userId)
            .is('deleted_at', null)
            .order('local_id', { ascending: true })
            .range(offset, offset + pageSize - 1);

        if (result.error) {
            throw result.error;
        }

        const page = (result.data ?? []) as TRow[];
        rows.push(...page);

        if (rows.length > SYNC_MAX_LIBRARY_ROWS) {
            throw new Error(`Cloud ${table === 'saved_workouts' ? 'workout' : 'session'} library exceeds the ${SYNC_MAX_LIBRARY_ROWS}-record sync limit.`);
        }

        if (page.length < pageSize) {
            return rows;
        }

        offset += page.length;
    }

    return rows;
};

export const fetchRemoteLibrarySnapshot = async (
    client: SupabaseClient,
    userId: string,
): Promise<{ workouts: SavedWorkout[]; sessions: SavedSession[] }> => {
    const [workoutRows, sessionRows] = await Promise.all([
        fetchActiveRows<SupabaseSavedWorkoutRow>(client, 'saved_workouts', WORKOUT_SELECT, userId),
        fetchActiveRows<SupabaseSavedSessionRow>(client, 'saved_sessions', SESSION_SELECT, userId),
    ]);

    return {
        workouts: workoutRows.map(fromSupabaseSavedWorkoutRow),
        sessions: sessionRows.map(fromSupabaseSavedSessionRow),
    };
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const parseRevision = (value: unknown, field: string): number => {
    const revision = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(revision) || revision < 0) {
        throw new Error(`Invalid ${field} returned by the sync service.`);
    }
    return revision;
};

const isConflictReason = (value: unknown): value is SyncMutationConflictReason => (
    value === 'stale_revision' || value === 'tombstone_wins' || value === 'revision_mismatch'
);

const decodeMutationRpcResponse = <TRow>(value: unknown): MutationRpcResponse<TRow> => {
    if (!isRecord(value)) {
        throw new Error('Invalid mutation response returned by the sync service.');
    }

    const status = value.status;
    if (status !== 'applied' && status !== 'deleted' && status !== 'conflict') {
        throw new Error('Invalid mutation status returned by the sync service.');
    }

    const reason = value.reason;
    if (status === 'conflict' && !isConflictReason(reason)) {
        throw new Error('Invalid mutation conflict returned by the sync service.');
    }

    const remoteRecord = value.remote_record;
    if (remoteRecord !== null && !isRecord(remoteRecord)) {
        throw new Error('Invalid remote record returned by the sync service.');
    }

    const remoteDeletedAt = value.remote_deleted_at;
    if (remoteDeletedAt !== null && typeof remoteDeletedAt !== 'string') {
        throw new Error('Invalid tombstone timestamp returned by the sync service.');
    }

    return {
        status,
        reason: status === 'conflict' ? reason as SyncMutationConflictReason : null,
        expected_revision: parseRevision(value.expected_revision, 'expected revision'),
        remote_revision: parseRevision(value.remote_revision, 'remote revision'),
        remote_deleted_at: remoteDeletedAt,
        remote_record: remoteRecord as TRow | null,
    };
};

const decodeOverwriteResponse = (value: unknown): OverwriteLibraryRpcResponse => {
    if (!isRecord(value) || !Array.isArray(value.workouts) || !Array.isArray(value.sessions)) {
        throw new Error('Invalid library response returned by the sync service.');
    }

    return {
        workouts: value.workouts as SupabaseSavedWorkoutRow[],
        sessions: value.sessions as SupabaseSavedSessionRow[],
    };
};

const resolveExpectedRevision = (
    suppliedRevision: number | null | undefined,
    remoteId: string | null | undefined,
    incomingRevision: number,
): number => {
    const expectedRevision = suppliedRevision
        ?? (remoteId ? Math.max(0, incomingRevision - 1) : 0);

    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        throw new Error('Expected remote revision must be a non-negative safe integer.');
    }

    return expectedRevision;
};

const toWorkoutMutationResult = (
    response: MutationRpcResponse<SupabaseSavedWorkoutRow>,
): SyncMutationResult<SavedWorkout> => {
    if (response.status === 'conflict') {
        const remoteRecord = response.remote_record && response.remote_record.deleted_at === null
            ? fromSupabaseSavedWorkoutRow(response.remote_record)
            : null;
        return {
            status: 'conflict',
            reason: response.reason as SyncMutationConflictReason,
            expectedRevision: response.expected_revision,
            remoteRevision: response.remote_revision,
            remoteDeletedAt: response.remote_deleted_at,
            remoteRecord,
        };
    }

    if (response.status === 'deleted') {
        return {
            status: 'deleted',
            record: null,
            remoteRevision: response.remote_revision,
        };
    }

    if (!response.remote_record || response.remote_record.deleted_at !== null) {
        throw new Error('Applied workout mutation did not return an active record.');
    }

    return {
        status: 'applied',
        record: fromSupabaseSavedWorkoutRow(response.remote_record),
        remoteRevision: response.remote_revision,
    };
};

const toSessionMutationResult = (
    response: MutationRpcResponse<SupabaseSavedSessionRow>,
): SyncMutationResult<SavedSession> => {
    if (response.status === 'conflict') {
        const remoteRecord = response.remote_record && response.remote_record.deleted_at === null
            ? fromSupabaseSavedSessionRow(response.remote_record)
            : null;
        return {
            status: 'conflict',
            reason: response.reason as SyncMutationConflictReason,
            expectedRevision: response.expected_revision,
            remoteRevision: response.remote_revision,
            remoteDeletedAt: response.remote_deleted_at,
            remoteRecord,
        };
    }

    if (response.status === 'deleted') {
        return {
            status: 'deleted',
            record: null,
            remoteRevision: response.remote_revision,
        };
    }

    if (!response.remote_record || response.remote_record.deleted_at !== null) {
        throw new Error('Applied session mutation did not return an active record.');
    }

    return {
        status: 'applied',
        record: fromSupabaseSavedSessionRow(response.remote_record),
        remoteRevision: response.remote_revision,
    };
};

export const overwriteRemoteLibraryWithLocal = async (
    client: SupabaseClient,
    userId: string,
    workouts: SavedWorkout[],
    sessions: SavedSession[],
): Promise<{ workouts: SavedWorkout[]; sessions: SavedSession[] }> => {
    const activeWorkouts = workouts.filter((workout) => !workout.sync?.pendingDelete);
    const activeSessions = sessions.filter((session) => !session.sync?.pendingDelete);

    if (activeWorkouts.length > SYNC_MAX_LIBRARY_ROWS || activeSessions.length > SYNC_MAX_LIBRARY_ROWS) {
        throw new Error(`Local library exceeds the ${SYNC_MAX_LIBRARY_ROWS}-record sync limit.`);
    }

    const { data, error } = await client.rpc('overwrite_sync_library', {
        p_workouts: activeWorkouts.map((workout) => toSupabaseSavedWorkoutWriteRow(workout, userId)),
        p_sessions: activeSessions.map((session) => toSupabaseSavedSessionWriteRow(session, userId)),
    });

    if (error) {
        throw error;
    }

    const response = decodeOverwriteResponse(data);
    return {
        workouts: response.workouts
            .filter((row) => row.deleted_at === null)
            .map(fromSupabaseSavedWorkoutRow),
        sessions: response.sessions
            .filter((row) => row.deleted_at === null)
            .map(fromSupabaseSavedSessionRow),
    };
};

export const pushWorkoutMutation = async (
    client: SupabaseClient,
    userId: string,
    workout: SavedWorkout,
    expectedRemoteRevision?: number | null,
): Promise<SyncMutationResult<SavedWorkout>> => {
    if (workout.sync?.pendingDelete && !workout.sync.remoteId) {
        return {
            status: 'deleted',
            record: null,
            remoteRevision: 0,
        };
    }

    const row = toSupabaseSavedWorkoutWriteRow(workout, userId);
    const expectedRevision = resolveExpectedRevision(expectedRemoteRevision, workout.sync?.remoteId, row.revision);
    const { data, error } = await client.rpc('mutate_saved_workout', {
        p_expected_revision: expectedRevision,
        p_row: row,
    });

    if (error) {
        throw error;
    }

    return toWorkoutMutationResult(decodeMutationRpcResponse<SupabaseSavedWorkoutRow>(data));
};

export const pushSessionMutation = async (
    client: SupabaseClient,
    userId: string,
    session: SavedSession,
    expectedRemoteRevision?: number | null,
): Promise<SyncMutationResult<SavedSession>> => {
    if (session.sync?.pendingDelete && !session.sync.remoteId) {
        return {
            status: 'deleted',
            record: null,
            remoteRevision: 0,
        };
    }

    const row = toSupabaseSavedSessionWriteRow(session, userId);
    const expectedRevision = resolveExpectedRevision(expectedRemoteRevision, session.sync?.remoteId, row.revision);
    const { data, error } = await client.rpc('mutate_saved_session', {
        p_expected_revision: expectedRevision,
        p_row: row,
    });

    if (error) {
        throw error;
    }

    return toSessionMutationResult(decodeMutationRpcResponse<SupabaseSavedSessionRow>(data));
};
