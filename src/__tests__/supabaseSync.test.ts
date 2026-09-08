import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { SavedSession } from '@/types/savedSessions';
import type { SavedWorkout } from '@/types/savedWorkouts';
import type { SupabaseSavedSessionRow, SupabaseSavedWorkoutRow } from '@/types/sync';
import {
    SYNC_SNAPSHOT_PAGE_SIZE,
    fetchRemoteLibrarySnapshot,
    overwriteRemoteLibraryWithLocal,
    pushSessionMutation,
    pushWorkoutMutation,
} from '@/lib/supabaseSync';
import { createSavedSession } from '@/utils/savedSessions';
import { createSavedWorkout } from '@/utils/savedWorkouts';

const NOW_ISO = '2026-08-05T00:00:00.000Z';
const USER_ID = '11111111-1111-4111-8111-111111111111';

const workoutRow = (
    overrides: Partial<SupabaseSavedWorkoutRow> = {},
): SupabaseSavedWorkoutRow => ({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    user_id: USER_ID,
    local_id: 'local-workout-1',
    name: 'Remote workout',
    sets: '3',
    reps: '12',
    seconds: '3',
    rest: '20',
    myo_reps: '4',
    myo_work_secs: '2',
    times_used: 0,
    last_used_at: null,
    revision: 4,
    updated_at: NOW_ISO,
    deleted_at: null,
    created_at: NOW_ISO,
    ...overrides,
});

const sessionRow = (
    overrides: Partial<SupabaseSavedSessionRow> = {},
): SupabaseSavedSessionRow => ({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    user_id: USER_ID,
    local_id: 'local-session-1',
    name: 'Remote session',
    nodes: [],
    times_used: 0,
    last_used_at: null,
    revision: 5,
    updated_at: NOW_ISO,
    deleted_at: null,
    created_at: NOW_ISO,
    ...overrides,
});

const localWorkout = (overrides: Partial<SavedWorkout> = {}): SavedWorkout => {
    const workout = createSavedWorkout('Local workout', {
        sets: '3',
        reps: '12',
        seconds: '3',
        rest: '20',
        myoReps: '4',
        myoWorkSecs: '2',
    }, NOW_ISO);

    return {
        ...workout,
        id: 'local-workout-1',
        sync: {
            ...workout.sync!,
            localId: 'local-workout-1',
            remoteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            revision: 3,
        },
        ...overrides,
    };
};

const localSession = (overrides: Partial<SavedSession> = {}): SavedSession => {
    const session = createSavedSession('Local session', [], NOW_ISO);
    return {
        ...session,
        id: 'local-session-1',
        sync: {
            ...session.sync!,
            localId: 'local-session-1',
            remoteId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            revision: 4,
        },
        ...overrides,
    };
};

const rpcClient = (data: unknown) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    return {
        client: { rpc } as unknown as SupabaseClient,
        rpc,
    };
};

const pagedQuery = (pages: unknown[][]) => {
    const remainingPages = [...pages];
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.is = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.range = vi.fn().mockImplementation(async () => ({
        data: remainingPages.shift() ?? [],
        error: null,
    }));
    return query;
};

describe('Supabase sync server contracts', () => {
    it('returns a typed stale-revision conflict and sends the explicit base revision', async () => {
        const remote = workoutRow({ revision: 4, name: 'Newer cloud copy' });
        const { client, rpc } = rpcClient({
            status: 'conflict',
            reason: 'stale_revision',
            expected_revision: 2,
            remote_revision: 4,
            remote_deleted_at: null,
            remote_record: remote,
        });

        const result = await pushWorkoutMutation(client, USER_ID, localWorkout(), 2);

        expect(rpc).toHaveBeenCalledWith('mutate_saved_workout', expect.objectContaining({
            p_expected_revision: 2,
            p_row: expect.objectContaining({
                user_id: USER_ID,
                local_id: 'local-workout-1',
                revision: 3,
            }),
        }));
        expect(result).toEqual(expect.objectContaining({
            status: 'conflict',
            reason: 'stale_revision',
            expectedRevision: 2,
            remoteRevision: 4,
            remoteDeletedAt: null,
            remoteRecord: expect.objectContaining({
                id: 'local-workout-1',
                name: 'Newer cloud copy',
            }),
        }));
    });

    it('returns tombstone precedence as a typed conflict without reviving remote content', async () => {
        const deletedAt = '2026-08-05T01:00:00.000Z';
        const { client } = rpcClient({
            status: 'conflict',
            reason: 'tombstone_wins',
            expected_revision: 4,
            remote_revision: 5,
            remote_deleted_at: deletedAt,
            remote_record: sessionRow({ deleted_at: deletedAt }),
        });

        const result = await pushSessionMutation(client, USER_ID, localSession(), 4);

        expect(result).toEqual({
            status: 'conflict',
            reason: 'tombstone_wins',
            expectedRevision: 4,
            remoteRevision: 5,
            remoteDeletedAt: deletedAt,
            remoteRecord: null,
        });
    });

    it('uses one atomic RPC for first-sync overwrite and returns its active snapshot', async () => {
        const workout = localWorkout();
        const session = localSession();
        const { client, rpc } = rpcClient({
            workouts: [workoutRow({ revision: 6 })],
            sessions: [sessionRow({ revision: 7 })],
        });

        const snapshot = await overwriteRemoteLibraryWithLocal(
            client,
            USER_ID,
            [workout],
            [session],
        );

        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith('overwrite_sync_library', {
            p_workouts: [expect.objectContaining({
                user_id: USER_ID,
                local_id: 'local-workout-1',
                deleted_at: null,
            })],
            p_sessions: [expect.objectContaining({
                user_id: USER_ID,
                local_id: 'local-session-1',
                nodes: [],
                deleted_at: null,
            })],
        });
        expect(snapshot.workouts).toEqual([
            expect.objectContaining({ id: 'local-workout-1' }),
        ]);
        expect(snapshot.sessions).toEqual([
            expect.objectContaining({ id: 'local-session-1' }),
        ]);
    });

    it('filters active rows in PostgREST and paginates deterministic snapshots', async () => {
        const firstWorkoutPage = Array.from({ length: SYNC_SNAPSHOT_PAGE_SIZE }, (_, index) => (
            workoutRow({
                id: `remote-workout-${index}`,
                local_id: `local-workout-${String(index).padStart(4, '0')}`,
            })
        ));
        const secondWorkoutPage = [workoutRow({
            id: 'remote-workout-last',
            local_id: 'local-workout-last',
        })];
        const workoutsQuery = pagedQuery([firstWorkoutPage, secondWorkoutPage]);
        const sessionsQuery = pagedQuery([[sessionRow()]]);
        const from = vi.fn((table: string) => (
            table === 'saved_workouts' ? workoutsQuery : sessionsQuery
        ));
        const client = { from } as unknown as SupabaseClient;

        const snapshot = await fetchRemoteLibrarySnapshot(client, USER_ID);

        expect(workoutsQuery.is).toHaveBeenCalledWith('deleted_at', null);
        expect(workoutsQuery.order).toHaveBeenCalledWith('local_id', { ascending: true });
        expect(workoutsQuery.range).toHaveBeenNthCalledWith(1, 0, SYNC_SNAPSHOT_PAGE_SIZE - 1);
        expect(workoutsQuery.range).toHaveBeenNthCalledWith(
            2,
            SYNC_SNAPSHOT_PAGE_SIZE,
            (SYNC_SNAPSHOT_PAGE_SIZE * 2) - 1,
        );
        expect(sessionsQuery.is).toHaveBeenCalledWith('deleted_at', null);
        expect(snapshot.workouts).toHaveLength(SYNC_SNAPSHOT_PAGE_SIZE + 1);
        expect(snapshot.sessions).toEqual([
            expect.objectContaining({ id: 'local-session-1' }),
        ]);
    });
});
