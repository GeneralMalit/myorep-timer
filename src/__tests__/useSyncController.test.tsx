import { act, renderHook, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountSnapshot } from '@/types/account';
import type { SavedWorkout } from '@/types/savedWorkouts';
import { useAccountStore } from '@/store/useAccountStore';
import { useSyncStore } from '@/store/useSyncStore';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { createSavedWorkout } from '@/utils/savedWorkouts';

const getSupabaseClientMock = vi.hoisted(() => vi.fn());
const fetchRemoteLibrarySnapshotMock = vi.hoisted(() => vi.fn());
const inspectRemoteSyncPresenceMock = vi.hoisted(() => vi.fn());
const overwriteRemoteLibraryWithLocalMock = vi.hoisted(() => vi.fn());
const pushSessionMutationMock = vi.hoisted(() => vi.fn());
const pushWorkoutMutationMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
    getSupabaseClient: getSupabaseClientMock,
}));

vi.mock('@/lib/supabaseSync', () => ({
    fetchRemoteLibrarySnapshot: fetchRemoteLibrarySnapshotMock,
    inspectRemoteSyncPresence: inspectRemoteSyncPresenceMock,
    overwriteRemoteLibraryWithLocal: overwriteRemoteLibraryWithLocalMock,
    pushSessionMutation: pushSessionMutationMock,
    pushWorkoutMutation: pushWorkoutMutationMock,
}));

import { useSyncController } from '@/hooks/useSyncController';

const workoutConfig = {
    sets: '3',
    reps: '12',
    seconds: '3',
    rest: '20',
    myoReps: '4',
    myoWorkSecs: '2',
};

const buildAccount = (userId: string): AccountSnapshot => ({
    bootstrapStatus: 'ready',
    mode: 'signed-in-plus',
    session: {
        access_token: `access-${userId}`,
        refresh_token: `refresh-${userId}`,
        expires_in: 3600,
        token_type: 'bearer',
        user: {
            id: userId,
            app_metadata: {},
            user_metadata: {},
            aud: 'authenticated',
            created_at: '2026-04-01T00:00:00.000Z',
        },
    } as Session,
    profile: null,
    entitlement: {
        userId,
        plan: 'plus',
        cloudSyncEnabled: true,
        updatedAt: '2026-04-01T00:00:00.000Z',
        source: 'supabase',
    },
    syncStatus: 'idle',
    error: null,
    requiresPasswordReset: false,
});

const resetStores = () => {
    useAccountStore.setState({ syncStatus: 'disabled' });
    useSyncStore.setState({
        syncEnabled: false,
        firstSyncState: 'idle',
        currentUserId: null,
        authGeneration: 'controller-test-auth',
        onboardingRemoteHasData: false,
        recoveryBackup: null,
        pendingChoice: null,
        queuedOperations: [],
        lastSyncedAt: null,
        queueStatus: 'idle',
        syncError: null,
        authExpired: false,
        pendingCounts: { total: 0, workouts: 0, sessions: 0, deletes: 0, upserts: 0, deadLetters: 0 },
        hydrateComplete: true,
    });
    useWorkoutStore.setState({
        savedWorkouts: [],
        selectedSavedWorkoutId: null,
        savedSessions: [],
        selectedSavedSessionId: null,
        editingSessionId: null,
        editingSessionDraft: null,
        editingSessionNodeId: null,
        activeSessionId: null,
        activeSessionNodeIndex: 0,
        sessionStatus: 'idle',
        isRunningSession: false,
        sessionNodeRuntimeType: null,
        isTimerRunning: false,
        pendingElapsedSeconds: 0,
    });
};

const seedQueuedWorkout = (userId: string, workout: SavedWorkout) => {
    act(() => {
        useSyncStore.getState().setCurrentUser(userId);
        useSyncStore.setState({ syncEnabled: true });
        useWorkoutStore.setState({
            savedWorkouts: [workout],
            selectedSavedWorkoutId: workout.id,
        });
        useSyncStore.getState().enqueueEntityChange({
            entityType: 'workout',
            entityId: workout.id,
            localId: workout.sync!.localId,
            operation: workout.sync?.pendingDelete ? 'delete' : 'upsert',
            revision: workout.sync!.revision,
            expectedRemoteRevision: workout.sync!.baseRevision,
            queuedAt: workout.updatedAt,
        });
    });
};

const asAppliedWorkout = (workout: SavedWorkout, remoteRevision: number): SavedWorkout => ({
    ...workout,
    sync: {
        ...workout.sync!,
        remoteId: 'remote-workout',
        revision: remoteRevision,
        baseRevision: remoteRevision,
        dirty: false,
        pendingDelete: false,
        deletedAt: null,
        lastSyncedAt: '2026-04-01T01:00:00.000Z',
    },
});

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
};

describe('useSyncController orchestration', () => {
    beforeEach(() => {
        resetStores();
        getSupabaseClientMock.mockReturnValue({});
        fetchRemoteLibrarySnapshotMock.mockResolvedValue({ workouts: [], sessions: [] });
        inspectRemoteSyncPresenceMock.mockResolvedValue({ hasData: false, workoutCount: 0, sessionCount: 0 });
        overwriteRemoteLibraryWithLocalMock.mockResolvedValue({ workouts: [], sessions: [] });
        pushSessionMutationMock.mockReset();
        pushWorkoutMutationMock.mockReset();
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('never executes account A queue entries under account B', async () => {
        const workoutA = createSavedWorkout('Account A Workout', workoutConfig, '2026-04-01T00:00:00.000Z');
        seedQueuedWorkout('account-a', workoutA);

        renderHook(() => useSyncController({
            account: buildAccount('account-b'),
            savedWorkouts: [workoutA],
            savedSessions: [],
        }));

        await waitFor(() => {
            expect(useSyncStore.getState().currentUserId).toBe('account-b');
        });
        expect(pushWorkoutMutationMock).not.toHaveBeenCalled();
        expect(useSyncStore.getState().queuedOperations).toEqual([]);
    });

    it('preserves a newer local edit and replacement operation when an old request resolves', async () => {
        const workout = createSavedWorkout('Original', workoutConfig, '2026-04-01T00:00:00.000Z');
        seedQueuedWorkout('account-a', workout);
        const request = deferred<unknown>();
        pushWorkoutMutationMock.mockReturnValueOnce(request.promise);

        renderHook(() => useSyncController({
            account: buildAccount('account-a'),
            savedWorkouts: [workout],
            savedSessions: [],
        }));

        await waitFor(() => expect(pushWorkoutMutationMock).toHaveBeenCalledTimes(1));
        expect(pushWorkoutMutationMock).toHaveBeenCalledWith(expect.anything(), 'account-a', workout, 0);
        const oldOperationId = useSyncStore.getState().queuedOperations[0].operationId;

        act(() => {
            useWorkoutStore.getState().renameWorkout(workout.id, 'Newest Local Name');
        });
        const replacement = useSyncStore.getState().queuedOperations[0];
        expect(replacement.operationId).not.toBe(oldOperationId);

        await act(async () => {
            request.resolve({
                status: 'applied',
                record: asAppliedWorkout(workout, 1),
                remoteRevision: 1,
            });
            await request.promise;
        });

        await waitFor(() => {
            expect(useWorkoutStore.getState().savedWorkouts[0].name).toBe('Newest Local Name');
            expect(useSyncStore.getState().queuedOperations[0].operationId).toBe(replacement.operationId);
        });
    });

    it('dead-letters CAS conflicts without acknowledging or overwriting local data', async () => {
        const workout = createSavedWorkout('Local Winner', workoutConfig, '2026-04-01T00:00:00.000Z');
        seedQueuedWorkout('account-a', workout);
        pushWorkoutMutationMock.mockResolvedValueOnce({
            status: 'conflict',
            reason: 'stale_revision',
            expectedRevision: 0,
            remoteRevision: 3,
            remoteDeletedAt: null,
            remoteRecord: asAppliedWorkout({ ...workout, name: 'Remote Copy' }, 3),
        });

        const { result } = renderHook(() => useSyncController({
            account: buildAccount('account-a'),
            savedWorkouts: [workout],
            savedSessions: [],
        }));

        await waitFor(() => {
            expect(useSyncStore.getState().queueStatus).toBe('dead-letter');
        });
        expect(useWorkoutStore.getState().savedWorkouts[0].name).toBe('Local Winner');
        expect(useSyncStore.getState().queuedOperations).toHaveLength(1);
        expect(result.current.syncSnapshot).toMatchObject({
            status: 'sync-error',
            isPaused: true,
        });
        expect(result.current.syncSnapshot?.detail).toContain('manual retry');
    });

    it('schedules a jittered transient retry and supports an immediate manual retry', async () => {
        const workout = createSavedWorkout('Retry Workout', workoutConfig, '2026-04-01T00:00:00.000Z');
        seedQueuedWorkout('account-a', workout);
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-01T00:00:00.000Z').getTime());
        vi.spyOn(Math, 'random').mockReturnValue(1);
        pushWorkoutMutationMock
            .mockRejectedValueOnce(new TypeError('Network unavailable'))
            .mockResolvedValueOnce({
                status: 'applied',
                record: asAppliedWorkout(workout, 1),
                remoteRevision: 1,
            });

        const { result } = renderHook(() => useSyncController({
            account: buildAccount('account-a'),
            savedWorkouts: [workout],
            savedSessions: [],
        }));

        await waitFor(() => {
            expect(useSyncStore.getState().queuedOperations[0]?.attempts).toBe(1);
        });
        expect(useSyncStore.getState().queuedOperations[0].nextRetryAt).toBe('2026-04-01T00:00:02.500Z');
        nowSpy.mockRestore();

        await act(async () => {
            await result.current.syncActions?.onRetrySync?.();
        });
        await waitFor(() => expect(pushWorkoutMutationMock).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(useSyncStore.getState().queuedOperations).toEqual([]));
        expect(useWorkoutStore.getState().savedWorkouts[0].sync).toMatchObject({
            dirty: false,
            baseRevision: 1,
        });
    });

    it('purges an acknowledged tombstone only for the exact queued revision', async () => {
        const base = createSavedWorkout('Delete Me', workoutConfig, '2026-04-01T00:00:00.000Z');
        const deleted: SavedWorkout = {
            ...base,
            sync: {
                ...base.sync!,
                remoteId: 'remote-delete',
                revision: 6,
                baseRevision: 5,
                dirty: true,
                pendingDelete: true,
                deletedAt: '2026-04-01T01:00:00.000Z',
            },
        };
        seedQueuedWorkout('account-a', deleted);
        pushWorkoutMutationMock.mockResolvedValueOnce({ status: 'deleted', record: null, remoteRevision: 6 });

        renderHook(() => useSyncController({
            account: buildAccount('account-a'),
            savedWorkouts: [deleted],
            savedSessions: [],
        }));

        await waitFor(() => expect(useWorkoutStore.getState().savedWorkouts).toEqual([]));
        expect(useSyncStore.getState().queuedOperations).toEqual([]);
        expect(pushWorkoutMutationMock).toHaveBeenCalledWith(expect.anything(), 'account-a', deleted, 5);
    });

    it('clears the first-sync recovery backup after a confirmed setup', async () => {
        const workout = createSavedWorkout('First Sync', workoutConfig, '2026-04-01T00:00:00.000Z');
        act(() => {
            useSyncStore.getState().setCurrentUser('account-a');
            useWorkoutStore.setState({ savedWorkouts: [workout] });
        });
        overwriteRemoteLibraryWithLocalMock.mockResolvedValueOnce({ workouts: [asAppliedWorkout(workout, 1)], sessions: [] });

        const { result } = renderHook(() => useSyncController({
            account: buildAccount('account-a'),
            savedWorkouts: [workout],
            savedSessions: [],
        }));

        let actionResult;
        await act(async () => {
            actionResult = await result.current.syncActions?.onEnableSync?.('upload-local');
        });

        expect(actionResult).toMatchObject({ ok: true });
        expect(useSyncStore.getState()).toMatchObject({
            syncEnabled: true,
            recoveryBackup: null,
            firstSyncState: 'idle',
        });
        expect(overwriteRemoteLibraryWithLocalMock).toHaveBeenCalledWith(expect.anything(), 'account-a', [workout], []);
    });
});
