import type { SupabaseClient } from '@supabase/supabase-js';
import type { SavedSession } from '@/types/savedSessions';
import type { SavedWorkout } from '@/types/savedWorkouts';
import type {
    SupabaseSavedSessionRow,
    SupabaseSavedSessionWriteRow,
    SupabaseSavedWorkoutRow,
    SupabaseSavedWorkoutWriteRow,
} from '@/types/sync';
import { clearSyncMetadata, normalizeSyncMetadata, toSupabaseSavedSessionWriteRow, toSupabaseSavedWorkoutWriteRow } from '@/utils/sync';

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

        return {
            ...record,
            sourceWorkoutId,
            notes: typeof record.notes === 'string' ? record.notes : '',
        };
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
    createdAt: row.created_at,
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
    createdAt: row.created_at,
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

export const fetchRemoteLibrarySnapshot = async (
    client: SupabaseClient,
    userId: string,
): Promise<{ workouts: SavedWorkout[]; sessions: SavedSession[] }> => {
    const [workoutsResult, sessionsResult] = await Promise.all([
        client
            .from('saved_workouts')
            .select('id,user_id,local_id,name,sets,reps,seconds,rest,myo_reps,myo_work_secs,times_used,last_used_at,revision,updated_at,deleted_at,created_at')
            .eq('user_id', userId),
        client
            .from('saved_sessions')
            .select('id,user_id,local_id,name,nodes,times_used,last_used_at,revision,updated_at,deleted_at,created_at')
            .eq('user_id', userId),
    ]);

    if (workoutsResult.error) {
        throw workoutsResult.error;
    }
    if (sessionsResult.error) {
        throw sessionsResult.error;
    }

    return {
        workouts: (workoutsResult.data as SupabaseSavedWorkoutRow[])
            .filter((row) => row.deleted_at === null)
            .map(fromSupabaseSavedWorkoutRow),
        sessions: (sessionsResult.data as SupabaseSavedSessionRow[])
            .filter((row) => row.deleted_at === null)
            .map(fromSupabaseSavedSessionRow),
    };
};

const buildDeletedWorkoutRows = (
    remoteRows: SupabaseSavedWorkoutRow[],
    localIds: Set<string>,
): SupabaseSavedWorkoutWriteRow[] => {
    const nowIso = new Date().toISOString();
    return remoteRows
        .filter((row) => !localIds.has(row.local_id) && row.deleted_at === null)
        .map((row) => ({
            id: row.id,
            user_id: row.user_id,
            local_id: row.local_id,
            name: row.name,
            sets: row.sets,
            reps: row.reps,
            seconds: row.seconds,
            rest: row.rest,
            myo_reps: row.myo_reps,
            myo_work_secs: row.myo_work_secs,
            times_used: row.times_used,
            last_used_at: row.last_used_at,
            revision: row.revision + 1,
            updated_at: nowIso,
            deleted_at: nowIso,
        }));
};

const buildDeletedSessionRows = (
    remoteRows: SupabaseSavedSessionRow[],
    localIds: Set<string>,
): SupabaseSavedSessionWriteRow[] => {
    const nowIso = new Date().toISOString();
    return remoteRows
        .filter((row) => !localIds.has(row.local_id) && row.deleted_at === null)
        .map((row) => ({
            id: row.id,
            user_id: row.user_id,
            local_id: row.local_id,
            name: row.name,
            nodes: row.nodes,
            times_used: row.times_used,
            last_used_at: row.last_used_at,
            revision: row.revision + 1,
            updated_at: nowIso,
            deleted_at: nowIso,
        }));
};

export const overwriteRemoteLibraryWithLocal = async (
    client: SupabaseClient,
    userId: string,
    workouts: SavedWorkout[],
    sessions: SavedSession[],
): Promise<{ workouts: SavedWorkout[]; sessions: SavedSession[] }> => {
    const [remoteWorkoutsResult, remoteSessionsResult] = await Promise.all([
        client
            .from('saved_workouts')
            .select('id,user_id,local_id,name,sets,reps,seconds,rest,myo_reps,myo_work_secs,times_used,last_used_at,revision,updated_at,deleted_at,created_at')
            .eq('user_id', userId),
        client
            .from('saved_sessions')
            .select('id,user_id,local_id,name,nodes,times_used,last_used_at,revision,updated_at,deleted_at,created_at')
            .eq('user_id', userId),
    ]);

    if (remoteWorkoutsResult.error) {
        throw remoteWorkoutsResult.error;
    }
    if (remoteSessionsResult.error) {
        throw remoteSessionsResult.error;
    }

    const remoteWorkouts = remoteWorkoutsResult.data as SupabaseSavedWorkoutRow[];
    const remoteSessions = remoteSessionsResult.data as SupabaseSavedSessionRow[];
    const localWorkoutIds = new Set(workouts.map((workout) => workout.sync?.localId ?? workout.id));
    const localSessionIds = new Set(sessions.map((session) => session.sync?.localId ?? session.id));

    const workoutWrites = workouts.map((workout) => toSupabaseSavedWorkoutWriteRow(workout, userId));
    const sessionWrites = sessions.map((session) => toSupabaseSavedSessionWriteRow(session, userId));
    const deletedWorkoutWrites = buildDeletedWorkoutRows(remoteWorkouts, localWorkoutIds);
    const deletedSessionWrites = buildDeletedSessionRows(remoteSessions, localSessionIds);

    const [workoutUpsertResult, sessionUpsertResult, workoutDeleteResult, sessionDeleteResult] = await Promise.all([
        workoutWrites.length > 0
            ? client.from('saved_workouts').upsert(workoutWrites, { onConflict: 'user_id,local_id' }).select('id,user_id,local_id,name,sets,reps,seconds,rest,myo_reps,myo_work_secs,times_used,last_used_at,revision,updated_at,deleted_at,created_at')
            : Promise.resolve({ data: [] as SupabaseSavedWorkoutRow[], error: null }),
        sessionWrites.length > 0
            ? client.from('saved_sessions').upsert(sessionWrites, { onConflict: 'user_id,local_id' }).select('id,user_id,local_id,name,nodes,times_used,last_used_at,revision,updated_at,deleted_at,created_at')
            : Promise.resolve({ data: [] as SupabaseSavedSessionRow[], error: null }),
        deletedWorkoutWrites.length > 0
            ? client.from('saved_workouts').upsert(deletedWorkoutWrites, { onConflict: 'user_id,local_id' })
            : Promise.resolve({ error: null }),
        deletedSessionWrites.length > 0
            ? client.from('saved_sessions').upsert(deletedSessionWrites, { onConflict: 'user_id,local_id' })
            : Promise.resolve({ error: null }),
    ]);

    if (workoutUpsertResult.error) {
        throw workoutUpsertResult.error;
    }
    if (sessionUpsertResult.error) {
        throw sessionUpsertResult.error;
    }
    if (workoutDeleteResult.error) {
        throw workoutDeleteResult.error;
    }
    if (sessionDeleteResult.error) {
        throw sessionDeleteResult.error;
    }

    return {
        workouts: (workoutUpsertResult.data as SupabaseSavedWorkoutRow[]).map(fromSupabaseSavedWorkoutRow),
        sessions: (sessionUpsertResult.data as SupabaseSavedSessionRow[]).map(fromSupabaseSavedSessionRow),
    };
};

export const pushWorkoutMutation = async (
    client: SupabaseClient,
    userId: string,
    workout: SavedWorkout,
): Promise<SavedWorkout | null> => {
    if (workout.sync?.pendingDelete && !workout.sync.remoteId) {
        return null;
    }

    const row = toSupabaseSavedWorkoutWriteRow(workout, userId);
    const { data, error } = await client
        .from('saved_workouts')
        .upsert(row, { onConflict: 'user_id,local_id' })
        .select('id,user_id,local_id,name,sets,reps,seconds,rest,myo_reps,myo_work_secs,times_used,last_used_at,revision,updated_at,deleted_at,created_at')
        .single<SupabaseSavedWorkoutRow>();

    if (error) {
        throw error;
    }

    return data.deleted_at ? null : fromSupabaseSavedWorkoutRow(data);
};

export const pushSessionMutation = async (
    client: SupabaseClient,
    userId: string,
    session: SavedSession,
): Promise<SavedSession | null> => {
    if (session.sync?.pendingDelete && !session.sync.remoteId) {
        return null;
    }

    const row = toSupabaseSavedSessionWriteRow(session, userId);
    const { data, error } = await client
        .from('saved_sessions')
        .upsert(row, { onConflict: 'user_id,local_id' })
        .select('id,user_id,local_id,name,nodes,times_used,last_used_at,revision,updated_at,deleted_at,created_at')
        .single<SupabaseSavedSessionRow>();

    if (error) {
        throw error;
    }

    return data.deleted_at ? null : fromSupabaseSavedSessionRow(data);
};
