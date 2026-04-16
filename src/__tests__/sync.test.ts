import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSavedSession, createWorkoutSessionNode } from '@/utils/savedSessions';
import { createSavedWorkout } from '@/utils/savedWorkouts';
import {
    clearSyncMetadata,
    createSyncMetadata,
    markSyncDeleted,
    normalizeSyncMetadata,
    toSupabaseSavedSessionWriteRow,
    toSupabaseSavedWorkoutWriteRow,
    touchSyncMetadata,
} from '@/utils/sync';

describe('sync metadata helpers', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('creates default metadata for a new local record', () => {
        const metadata = createSyncMetadata('local-1', '2026-02-01T00:00:00.000Z');

        expect(metadata).toEqual({
            localId: 'local-1',
            remoteId: null,
            revision: 1,
            updatedAt: '2026-02-01T00:00:00.000Z',
            dirty: true,
            pendingDelete: false,
            deletedAt: null,
            lastSyncedAt: null,
        });
    });

    it('normalizes malformed metadata into a stable sync shape', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-02T03:04:05.000Z'));

        const metadata = normalizeSyncMetadata({
            localId: '  ',
            remoteId: 'remote-9',
            revision: '7',
            updatedAt: '',
            dirty: false,
            pendingDelete: true,
            deletedAt: '',
            lastSyncedAt: '',
        }, 'local-9', '2026-02-02T03:04:05.000Z');

        expect(metadata).toEqual({
            localId: 'local-9',
            remoteId: 'remote-9',
            revision: 7,
            updatedAt: '2026-02-02T03:04:05.000Z',
            dirty: false,
            pendingDelete: true,
            deletedAt: null,
            lastSyncedAt: null,
        });
    });

    it('increments revision when touched and preserves remote state', () => {
        const metadata = touchSyncMetadata({
            localId: 'local-1',
            remoteId: 'remote-1',
            revision: 2,
            updatedAt: '2026-02-01T00:00:00.000Z',
            dirty: false,
            pendingDelete: false,
            deletedAt: null,
            lastSyncedAt: '2026-02-01T01:00:00.000Z',
        }, 'local-1', '2026-02-03T00:00:00.000Z');

        expect(metadata).toEqual({
            localId: 'local-1',
            remoteId: 'remote-1',
            revision: 3,
            updatedAt: '2026-02-03T00:00:00.000Z',
            dirty: true,
            pendingDelete: false,
            deletedAt: null,
            lastSyncedAt: '2026-02-01T01:00:00.000Z',
        });
    });

    it('marks a record deleted and can clear the tombstone again', () => {
        const deleted = markSyncDeleted(undefined, 'local-1', '2026-02-04T00:00:00.000Z');
        expect(deleted).toEqual({
            localId: 'local-1',
            remoteId: null,
            revision: 1,
            updatedAt: '2026-02-04T00:00:00.000Z',
            dirty: true,
            pendingDelete: true,
            deletedAt: '2026-02-04T00:00:00.000Z',
            lastSyncedAt: null,
        });

        const cleared = clearSyncMetadata(deleted, 'local-1', '2026-02-05T00:00:00.000Z');
        expect(cleared).toEqual({
            localId: 'local-1',
            remoteId: null,
            revision: 2,
            updatedAt: '2026-02-05T00:00:00.000Z',
            dirty: false,
            pendingDelete: false,
            deletedAt: null,
            lastSyncedAt: '2026-02-05T00:00:00.000Z',
        });
    });

    it('maps synced workouts and sessions into Supabase write rows', () => {
        const workout = createSavedWorkout('Push Day', {
            sets: '3',
            reps: '12',
            seconds: '3',
            rest: '20',
            myoReps: '4',
            myoWorkSecs: '2',
        }, '2026-02-01T00:00:00.000Z');
        const session = createSavedSession(
            'Session One',
            [
                createWorkoutSessionNode(
                    'Workout Node',
                    {
                        sets: '3',
                        reps: '12',
                        seconds: '3',
                        rest: '20',
                        myoReps: '4',
                        myoWorkSecs: '2',
                    },
                    '2026-02-01T00:00:00.000Z',
                ),
            ],
            '2026-02-01T00:00:00.000Z',
        );

        const syncedWorkout = {
            ...workout,
            sync: {
                ...workout.sync!,
                remoteId: 'remote-workout-1',
                revision: 3,
                dirty: false,
                pendingDelete: true,
                deletedAt: '2026-02-03T00:00:00.000Z',
                lastSyncedAt: '2026-02-02T00:00:00.000Z',
            },
        };
        const syncedSession = {
            ...session,
            sync: {
                ...session.sync!,
                remoteId: 'remote-session-1',
                revision: 4,
                dirty: false,
                pendingDelete: true,
                deletedAt: '2026-02-03T00:00:00.000Z',
                lastSyncedAt: '2026-02-02T00:00:00.000Z',
            },
        };

        expect(toSupabaseSavedWorkoutWriteRow(syncedWorkout, 'user-1')).toEqual({
            id: 'remote-workout-1',
            user_id: 'user-1',
            local_id: syncedWorkout.id,
            name: 'Push Day',
            sets: '3',
            reps: '12',
            seconds: '3',
            rest: '20',
            myo_reps: '4',
            myo_work_secs: '2',
            times_used: 0,
            last_used_at: null,
            revision: 3,
            updated_at: '2026-02-01T00:00:00.000Z',
            deleted_at: '2026-02-03T00:00:00.000Z',
        });

        expect(toSupabaseSavedSessionWriteRow(syncedSession, 'user-1')).toEqual({
            id: 'remote-session-1',
            user_id: 'user-1',
            local_id: syncedSession.id,
            name: 'Session One',
            nodes: expect.any(Array),
            times_used: 0,
            last_used_at: null,
            revision: 4,
            updated_at: '2026-02-01T00:00:00.000Z',
            deleted_at: '2026-02-03T00:00:00.000Z',
        });
    });
});
