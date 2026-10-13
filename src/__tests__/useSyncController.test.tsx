import { act, renderHook, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountActionResult, AccountSnapshot } from '@/types/account';
import type { SavedSession } from '@/types/savedSessions';
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

const buildGuestAccount = (): AccountSnapshot => ({
    ...buildAccount('account-a'),
    mode: 'guest',
    session: null,
    entitlement: null,
    syncStatus: 'disabled',
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

    it('keeps enabled sync and its queue while the account is being restored', async () => {
        const workout = createSavedWorkout('Pending workout', workoutConfig, '2026-10-05T00:00:00.000Z');
        seedQueuedWorkout('account-a', workout);
        const savedState = useSyncStore.getState();
        const restoredAccount = buildAccount('account-a');
        const pendingAccount: AccountSnapshot = {
            ...restoredAccount,
            bootstrapStatus: 'idle',
            mode: 'guest',
            session: null,
            entitlement: null,
        };
        getSupabaseClientMock.mockReturnValue(null);
        const { result, rerender } = renderHook(
            ({ account }) => useSyncController({ account, savedWorkouts: [workout], savedSessions: [] }),
            { initialProps: { account: pendingAccount } },
        );

        for (const bootstrapStatus of ['idle', 'bootstrapping', 'error'] as const) {
            rerender({ account: { ...pendingAccount, bootstrapStatus } });
            expect(useSyncStore.getState()).toMatchObject({
                syncEnabled: true,
                currentUserId: 'account-a',
                authGeneration: savedState.authGeneration,
                queuedOperations: savedState.queuedOperations,
            });
            expect(result.current.syncSnapshot).toBeUndefined();
        }

        rerender({ account: restoredAccount });
        expect(useSyncStore.getState()).toMatchObject({
            syncEnabled: true,
            firstSyncState: 'idle',
            currentUserId: 'account-a',
            authGeneration: savedState.authGeneration,
            queuedOperations: savedState.queuedOperations,
        });
        expect(result.current.syncSnapshot?.status).not.toBe('enable-sync');
        expect(inspectRemoteSyncPresenceMock).not.toHaveBeenCalled();
    });

    it('pauses an owned device on confirmed sign-out while preserving its opt-in and pending work', () => {
        const workout = createSavedWorkout('Private workout', workoutConfig, '2026-10-05T00:00:00.000Z');
        const recoveryBackup = {
            createdAt: '2026-10-05T00:00:00.000Z',
            expiresAt: '2099-01-01T00:00:00.000Z',
            workouts: [],
            sessions: [],
        };
        seedQueuedWorkout('account-a', workout);
        act(() => {
            useSyncStore.setState({ lastSyncedAt: '2026-10-04T00:00:00.000Z' });
            useSyncStore.getState().beginEnableSync(recoveryBackup, false);
        });
        const { rerender } = renderHook(
            ({ account }) => useSyncController({ account, savedWorkouts: [workout], savedSessions: [] }),
            { initialProps: { account: { ...buildAccount('account-a'), bootstrapStatus: 'bootstrapping' as AccountSnapshot['bootstrapStatus'] } } },
        );
        const beforeSignOut = useSyncStore.getState();

        rerender({ account: buildGuestAccount() });

        const signedOut = useSyncStore.getState();
        expect(signedOut).toMatchObject({
            syncEnabled: true,
            currentUserId: 'account-a',
            lastSyncedAt: '2026-10-04T00:00:00.000Z',
            firstSyncState: 'pending-choice',
            queueStatus: 'paused-auth',
            authExpired: true,
        });
        expect(signedOut.authGeneration).not.toBe(beforeSignOut.authGeneration);
        expect(signedOut.queuedOperations).toEqual([
            expect.objectContaining({
                operationId: beforeSignOut.queuedOperations[0].operationId,
                authGeneration: signedOut.authGeneration,
            }),
        ]);
        expect(signedOut.recoveryBackup).toEqual(beforeSignOut.recoveryBackup);
        expect(useWorkoutStore.getState().savedWorkouts).toEqual([workout]);
        expect(pushWorkoutMutationMock).not.toHaveBeenCalled();
    });

    it('resumes the preserved owner automatically when the same account signs back in', async () => {
        const workout = createSavedWorkout('Resumed workout', workoutConfig, '2026-10-05T00:00:00.000Z');
        seedQueuedWorkout('account-a', workout);
        pushWorkoutMutationMock.mockResolvedValueOnce({
            status: 'applied',
            record: asAppliedWorkout(workout, 1),
            remoteRevision: 1,
        });

        const { result, rerender } = renderHook(
            ({ account }) => useSyncController({ account, savedWorkouts: [workout], savedSessions: [] }),
            { initialProps: { account: { ...buildAccount('account-a'), bootstrapStatus: 'bootstrapping' as AccountSnapshot['bootstrapStatus'] } } },
        );

        rerender({ account: buildGuestAccount() });
        const pausedGeneration = useSyncStore.getState().authGeneration;
        expect(useSyncStore.getState()).toMatchObject({ queueStatus: 'paused-auth', authExpired: true });
        expect(pushWorkoutMutationMock).not.toHaveBeenCalled();

        rerender({ account: buildAccount('account-a') });

        await waitFor(() => expect(useSyncStore.getState().queuedOperations).toEqual([]));
        expect(pushWorkoutMutationMock).toHaveBeenCalledTimes(1);
        expect(pushWorkoutMutationMock).toHaveBeenCalledWith(expect.anything(), 'account-a', workout, 0);
        expect(useSyncStore.getState()).toMatchObject({
            currentUserId: 'account-a',
            syncEnabled: true,
            firstSyncState: 'idle',
            authExpired: false,
            syncError: null,
        });
        expect(useSyncStore.getState().authGeneration).toBe(pausedGeneration);
        expect(inspectRemoteSyncPresenceMock).not.toHaveBeenCalled();
        expect(overwriteRemoteLibraryWithLocalMock).not.toHaveBeenCalled();
        expect(fetchRemoteLibrarySnapshotMock).not.toHaveBeenCalled();
        expect(useWorkoutStore.getState().savedWorkouts[0].sync).toMatchObject({
            dirty: false,
            baseRevision: 1,
        });
        await waitFor(() => expect(result.current.syncSnapshot?.status).toBe('last-synced'));
    });

    it('resets prior sync ownership only after a confirmed different-account resolution', () => {
        const workout = createSavedWorkout('Private workout', workoutConfig, '2026-10-05T00:00:00.000Z');
        seedQueuedWorkout('account-a', workout);
        const account = buildAccount('account-a');
        const { rerender } = renderHook(
            ({ account }) => useSyncController({ account, savedWorkouts: [workout], savedSessions: [] }),
            { initialProps: { account: { ...account, bootstrapStatus: 'bootstrapping' as AccountSnapshot['bootstrapStatus'] } } },
        );
        const previousGeneration = useSyncStore.getState().authGeneration;
        expect(useSyncStore.getState().syncEnabled).toBe(true);

        rerender({ account: buildAccount('account-b') });

        expect(useSyncStore.getState()).toMatchObject({
            syncEnabled: false,
            currentUserId: 'account-b',
            queuedOperations: [],
            authExpired: false,
            queueStatus: 'idle',
        });
        expect(useSyncStore.getState().authGeneration).not.toBe(previousGeneration);
        expect(useWorkoutStore.getState().savedWorkouts).toEqual([workout]);
        expect(pushWorkoutMutationMock).not.toHaveBeenCalled();
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

    it('ignores a stale queued response after rapid logout and same-account login', async () => {
        const workout = createSavedWorkout('Original', workoutConfig, '2026-04-01T00:00:00.000Z');
        seedQueuedWorkout('account-a', workout);
        const staleRequest = deferred<unknown>();
        const resumedRequest = deferred<unknown>();
        let callCount = 0;
        pushWorkoutMutationMock.mockImplementation(() => {
            callCount += 1;
            return callCount === 1 ? staleRequest.promise : resumedRequest.promise;
        });

        const { rerender } = renderHook(
            ({ account }) => useSyncController({ account, savedWorkouts: [workout], savedSessions: [] }),
            { initialProps: { account: buildAccount('account-a') } },
        );

        await waitFor(() => expect(pushWorkoutMutationMock).toHaveBeenCalledTimes(1));
        const staleOperationId = useSyncStore.getState().queuedOperations[0].operationId;

        rerender({ account: buildGuestAccount() });
        expect(useSyncStore.getState()).toMatchObject({
            currentUserId: 'account-a',
            syncEnabled: true,
            authExpired: true,
        });

        act(() => {
            useWorkoutStore.getState().renameWorkout(workout.id, 'Newest Local Name');
        });
        const currentOperation = useSyncStore.getState().queuedOperations[0];
        expect(currentOperation.operationId).not.toBe(staleOperationId);
        expect(useSyncStore.getState()).toMatchObject({
            authExpired: true,
            queueStatus: 'paused-auth',
        });

        rerender({ account: buildAccount('account-a') });
        await waitFor(() => expect(pushWorkoutMutationMock).toHaveBeenCalledTimes(2));
        expect(useSyncStore.getState().authExpired).toBe(false);

        await act(async () => {
            staleRequest.resolve({
                status: 'applied',
                record: asAppliedWorkout(workout, 1),
                remoteRevision: 1,
            });
            await staleRequest.promise;
        });

        expect(useWorkoutStore.getState().savedWorkouts[0].name).toBe('Newest Local Name');
        expect(useWorkoutStore.getState().savedWorkouts[0].sync).toMatchObject({ dirty: true });
        expect(useSyncStore.getState().queuedOperations).toEqual([
            expect.objectContaining({ operationId: currentOperation.operationId }),
        ]);
        expect(useSyncStore.getState().lastSyncedAt).toBeNull();

        await act(async () => {
            resumedRequest.resolve({
                status: 'applied',
                record: asAppliedWorkout(workout, 2),
                remoteRevision: 2,
            });
            await resumedRequest.promise;
        });

        await waitFor(() => expect(useSyncStore.getState().queuedOperations).toEqual([]));
        expect(pushWorkoutMutationMock).toHaveBeenCalledTimes(2);
        expect(useWorkoutStore.getState().savedWorkouts[0].name).toBe('Newest Local Name');
        expect(useWorkoutStore.getState().savedWorkouts[0].sync).toMatchObject({
            dirty: false,
            baseRevision: 2,
        });
        expect(useSyncStore.getState().lastSyncedAt).not.toBeNull();
    });

    it('resumes preserved processing without waiting for the cancelled in-flight request', async () => {
        const firstWorkout = createSavedWorkout('First Queued', workoutConfig, '2026-04-01T00:00:00.000Z');
        const secondWorkout = createSavedWorkout('Second Queued', workoutConfig, '2026-04-01T00:01:00.000Z');
        const staleRequest = deferred<unknown>();
        act(() => {
            useSyncStore.getState().setCurrentUser('account-a');
            useSyncStore.setState({ syncEnabled: true });
            useWorkoutStore.setState({ savedWorkouts: [firstWorkout, secondWorkout] });
            for (const workout of [firstWorkout, secondWorkout]) {
                useSyncStore.getState().enqueueEntityChange({
                    entityType: 'workout',
                    entityId: workout.id,
                    localId: workout.sync!.localId,
                    operation: 'upsert',
                    revision: workout.sync!.revision,
                    expectedRemoteRevision: workout.sync!.baseRevision,
                });
            }
        });
        let callCount = 0;
        pushWorkoutMutationMock.mockImplementation((_client: unknown, _userId: string, workout: SavedWorkout) => {
            callCount += 1;
            if (callCount === 1) {
                return staleRequest.promise;
            }
            return Promise.resolve({
                status: 'applied',
                record: asAppliedWorkout(workout, 1),
                remoteRevision: 1,
            });
        });

        const { rerender } = renderHook(
            ({ account }) => useSyncController({ account, savedWorkouts: [firstWorkout, secondWorkout], savedSessions: [] }),
            { initialProps: { account: buildAccount('account-a') } },
        );
        await waitFor(() => expect(pushWorkoutMutationMock).toHaveBeenCalledTimes(1));

        rerender({ account: buildGuestAccount() });
        rerender({ account: buildAccount('account-a') });

        await waitFor(() => expect(useSyncStore.getState().queuedOperations).toEqual([]));
        expect(pushWorkoutMutationMock).toHaveBeenCalledTimes(3);
        expect(useWorkoutStore.getState().savedWorkouts.map((workout) => workout.sync)).toEqual([
            expect.objectContaining({ dirty: false, baseRevision: 1 }),
            expect.objectContaining({ dirty: false, baseRevision: 1 }),
        ]);

        await act(async () => {
            staleRequest.resolve({
                status: 'applied',
                record: asAppliedWorkout(firstWorkout, 9),
                remoteRevision: 9,
            });
            await staleRequest.promise;
        });

        expect(useSyncStore.getState().queuedOperations).toEqual([]);
        expect(useWorkoutStore.getState().savedWorkouts[0].sync).toMatchObject({
            dirty: false,
            baseRevision: 1,
        });
    });

    it('does not let a stale manual sync snapshot replace the local library after logout', async () => {
        const localWorkout = createSavedWorkout('Local Only', workoutConfig, '2026-04-01T00:00:00.000Z');
        const remoteWorkout = asAppliedWorkout(createSavedWorkout('Remote Copy', workoutConfig, '2026-04-01T00:00:00.000Z'), 9);
        act(() => {
            useSyncStore.getState().setCurrentUser('account-a');
            useSyncStore.setState({ syncEnabled: true });
            useWorkoutStore.setState({ savedWorkouts: [localWorkout], selectedSavedWorkoutId: localWorkout.id });
        });
        const snapshotRequest = deferred<{ workouts: SavedWorkout[]; sessions: SavedSession[] }>();
        fetchRemoteLibrarySnapshotMock.mockReturnValueOnce(snapshotRequest.promise);

        const { result, rerender } = renderHook(
            ({ account }) => useSyncController({ account, savedWorkouts: [localWorkout], savedSessions: [] }),
            { initialProps: { account: buildAccount('account-a') } },
        );

        let pending: Promise<AccountActionResult | void> | undefined;
        act(() => {
            pending = Promise.resolve(result.current.syncActions?.onSyncNow?.());
        });
        expect(fetchRemoteLibrarySnapshotMock).toHaveBeenCalledTimes(1);

        rerender({ account: buildGuestAccount() });
        expect(useSyncStore.getState()).toMatchObject({
            syncEnabled: true,
            currentUserId: 'account-a',
            authExpired: true,
            queueStatus: 'paused-auth',
        });

        await act(async () => {
            snapshotRequest.resolve({ workouts: [remoteWorkout], sessions: [] });
            await pending;
        });

        await expect(pending).resolves.toEqual({
            ok: false,
            message: 'Your account session changed before sync completed.',
        });
        expect(useWorkoutStore.getState().savedWorkouts).toEqual([localWorkout]);
        expect(useSyncStore.getState()).toMatchObject({
            syncEnabled: true,
            currentUserId: 'account-a',
            lastSyncedAt: null,
            authExpired: true,
            queueStatus: 'paused-auth',
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
