import { act, renderHook, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSyncController } from '@/hooks/useSyncController';
import { useAccountStore } from '@/store/useAccountStore';
import { migratePersistedSyncState, useSyncStore } from '@/store/useSyncStore';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import type { AccountActionResult, AccountSnapshot } from '@/types/account';
import type { SavedSession } from '@/types/savedSessions';
import type { SavedWorkout } from '@/types/savedWorkouts';
import type { SyncQueueItem, SyncRecoveryBackup } from '@/types/sync';
import { createSavedSession } from '@/utils/savedSessions';
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

const NOW = '2026-08-05T00:00:00.000Z';
const workoutConfig = {
    sets: '3',
    reps: '12',
    seconds: '3',
    rest: '20',
    myoReps: '4',
    myoWorkSecs: '2',
};

const buildAccount = (userId: string, hasCloudAccess = true): AccountSnapshot => ({
    bootstrapStatus: 'ready',
    mode: hasCloudAccess ? 'signed-in-plus' : 'signed-in-free',
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
            created_at: NOW,
        },
    } as Session,
    profile: null,
    entitlement: {
        userId,
        plan: hasCloudAccess ? 'plus' : 'free',
        cloudSyncEnabled: hasCloudAccess,
        updatedAt: NOW,
        source: 'supabase',
    },
    syncStatus: 'idle',
    error: null,
    requiresPasswordReset: false,
});

const guestAccount: AccountSnapshot = {
    bootstrapStatus: 'ready',
    mode: 'guest',
    session: null,
    profile: null,
    entitlement: null,
    syncStatus: 'disabled',
    error: null,
    requiresPasswordReset: false,
};

const resetStores = () => {
    useAccountStore.setState({ syncStatus: 'disabled' });
    useSyncStore.setState({
        syncEnabled: false,
        firstSyncState: 'idle',
        currentUserId: null,
        authGeneration: 'coverage-auth',
        onboardingRemoteHasData: false,
        recoveryBackup: null,
        pendingChoice: null,
        queuedOperations: [],
        lastSyncedAt: null,
        queueStatus: 'idle',
        syncError: null,
        authExpired: false,
        pendingCounts: {
            total: 0,
            workouts: 0,
            sessions: 0,
            deletes: 0,
            upserts: 0,
            deadLetters: 0,
        },
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

const createWorkout = (name = 'Coverage Workout'): SavedWorkout => (
    createSavedWorkout(name, workoutConfig, NOW)
);

const createSession = (name = 'Coverage Session'): SavedSession => (
    createSavedSession(name, [], NOW)
);

const asAppliedWorkout = (workout: SavedWorkout, remoteRevision: number): SavedWorkout => ({
    ...workout,
    sync: {
        ...workout.sync!,
        remoteId: `remote-${workout.id}`,
        revision: remoteRevision,
        baseRevision: remoteRevision,
        dirty: false,
        pendingDelete: false,
        deletedAt: null,
        lastSyncedAt: NOW,
    },
});

const asAppliedSession = (session: SavedSession, remoteRevision: number): SavedSession => ({
    ...session,
    sync: {
        ...session.sync!,
        remoteId: `remote-${session.id}`,
        revision: remoteRevision,
        baseRevision: remoteRevision,
        dirty: false,
        pendingDelete: false,
        deletedAt: null,
        lastSyncedAt: NOW,
    },
});

const setOwner = (userId: string, syncEnabled = false) => {
    useSyncStore.getState().setCurrentUser(userId);
    useSyncStore.setState({ syncEnabled });
};

const seedQueuedWorkout = (userId: string, workout: SavedWorkout) => {
    setOwner(userId, true);
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
};

const seedQueuedSession = (userId: string, session: SavedSession) => {
    setOwner(userId, true);
    useWorkoutStore.setState({
        savedSessions: [session],
        selectedSavedSessionId: session.id,
    });
    useSyncStore.getState().enqueueEntityChange({
        entityType: 'session',
        entityId: session.id,
        localId: session.sync!.localId,
        operation: session.sync?.pendingDelete ? 'delete' : 'upsert',
        revision: session.sync!.revision,
        expectedRemoteRevision: session.sync!.baseRevision,
        queuedAt: session.updatedAt,
    });
};

const queueItem = (overrides: Partial<SyncQueueItem> = {}): SyncQueueItem => ({
    id: 'workout:queued-local',
    operationId: 'operation-queued',
    ownerUserId: 'account-a',
    authGeneration: useSyncStore.getState().authGeneration,
    entityType: 'workout',
    entityId: 'queued-local',
    localId: 'queued-local',
    operation: 'upsert',
    revision: 1,
    expectedRemoteRevision: 0,
    queuedAt: NOW,
    attempts: 0,
    nextRetryAt: null,
    lastError: null,
    deadLetteredAt: null,
    ...overrides,
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

const renderController = (
    account: AccountSnapshot,
    savedWorkouts: SavedWorkout[] = [],
    savedSessions: SavedSession[] = [],
) => renderHook(() => useSyncController({ account, savedWorkouts, savedSessions }));

describe('useSyncController coverage contracts', () => {
    beforeEach(() => {
        resetStores();
        getSupabaseClientMock.mockReset().mockReturnValue({});
        fetchRemoteLibrarySnapshotMock.mockReset().mockResolvedValue({ workouts: [], sessions: [] });
        inspectRemoteSyncPresenceMock.mockReset().mockResolvedValue({
            hasData: false,
            workoutCount: 0,
            sessionCount: 0,
        });
        overwriteRemoteLibraryWithLocalMock.mockReset().mockResolvedValue({ workouts: [], sessions: [] });
        pushSessionMutationMock.mockReset();
        pushWorkoutMutationMock.mockReset();
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('filters tombstones and resets sync ownership for a signed-out account', async () => {
        const liveWorkout = createWorkout('Visible Workout');
        const deletedWorkout: SavedWorkout = {
            ...createWorkout('Deleted Workout'),
            sync: {
                ...createWorkout('Deleted Workout Sync').sync!,
                pendingDelete: true,
                deletedAt: NOW,
            },
        };
        const liveSession = createSession('Visible Session');
        const deletedSession: SavedSession = {
            ...createSession('Deleted Session'),
            sync: {
                ...createSession('Deleted Session Sync').sync!,
                pendingDelete: true,
                deletedAt: NOW,
            },
        };
        setOwner('old-owner', true);
        useSyncStore.setState({ queuedOperations: [queueItem({ ownerUserId: 'old-owner' })] });

        const { result } = renderController(
            guestAccount,
            [liveWorkout, deletedWorkout],
            [liveSession, deletedSession],
        );

        await waitFor(() => expect(useSyncStore.getState().currentUserId).toBeNull());
        expect(result.current.visibleWorkouts).toEqual([liveWorkout]);
        expect(result.current.visibleSessions).toEqual([liveSession]);
        expect(result.current.syncSnapshot).toBeUndefined();
        expect(result.current.syncActions).toBeUndefined();
        expect(useSyncStore.getState().queuedOperations).toEqual([]);
        expect(useAccountStore.getState().syncStatus).toBe('disabled');
    });

    it('returns guarded action results when the client is unavailable or sync is disabled', async () => {
        getSupabaseClientMock.mockReturnValue(null);
        setOwner('account-a');
        const { result } = renderController(buildAccount('account-a'));

        expect(result.current.syncSnapshot?.status).toBe('enable-sync');
        await expect(result.current.syncActions?.onEnableSync?.()).resolves.toMatchObject({
            ok: false,
            message: expect.stringContaining('signed-in Plus'),
        });
        await expect(result.current.syncActions?.onSyncNow?.()).resolves.toMatchObject({
            ok: false,
            message: expect.stringContaining('signed-in Plus'),
        });
        await expect(result.current.syncActions?.onRetrySync?.()).resolves.toMatchObject({
            ok: false,
            message: expect.stringContaining('Enable cloud sync'),
        });
        await expect(result.current.syncActions?.onResumeSync?.()).resolves.toMatchObject({
            ok: false,
            message: expect.stringContaining('Sign in'),
        });
        await expect(result.current.syncActions?.onDisableSync?.()).resolves.toEqual({
            ok: true,
            message: 'Cloud sync is already off on this device.',
        });
    });

    it('rejects every account-bound action after the store owner changes', async () => {
        setOwner('account-a', true);
        const { result } = renderController(buildAccount('account-a'));

        act(() => {
            useSyncStore.setState({ currentUserId: 'account-b' });
        });

        await expect(result.current.syncActions?.onEnableSync?.()).resolves.toMatchObject({
            ok: false,
            message: expect.stringContaining('session changed'),
        });
        await expect(result.current.syncActions?.onSyncNow?.()).resolves.toMatchObject({
            ok: false,
            message: expect.stringContaining('session changed'),
        });
        await expect(result.current.syncActions?.onRetrySync?.()).resolves.toMatchObject({
            ok: false,
            message: expect.stringContaining('session changed'),
        });
        await expect(result.current.syncActions?.onResumeSync?.()).resolves.toMatchObject({
            ok: false,
            message: expect.stringContaining('Sign in'),
        });
    });

    it.each([
        ['local workout and empty cloud', 'workout', false, 'upload-local'],
        ['local session and empty cloud', 'session', false, 'upload-local'],
        ['empty device and populated cloud', 'empty', true, 'replace-local'],
        ['empty device and empty cloud', 'empty', false, 'upload-local'],
    ] as const)(
        'automatically resolves first sync for %s',
        async (_label, localKind, remoteHasData, expectedChoice) => {
            const workout = localKind === 'workout' ? createWorkout() : null;
            const session = localKind === 'session' ? createSession() : null;
            const workouts = workout ? [workout] : [];
            const sessions = session ? [session] : [];
            setOwner('account-a');
            useWorkoutStore.setState({ savedWorkouts: workouts, savedSessions: sessions });
            inspectRemoteSyncPresenceMock.mockResolvedValue({
                hasData: remoteHasData,
                workoutCount: remoteHasData ? 1 : 0,
                sessionCount: 0,
            });
            const cloudWorkout = asAppliedWorkout(createWorkout('Cloud Workout'), 4);
            fetchRemoteLibrarySnapshotMock.mockResolvedValue({ workouts: [cloudWorkout], sessions: [] });
            overwriteRemoteLibraryWithLocalMock.mockResolvedValue({ workouts, sessions });

            const { result } = renderController(buildAccount('account-a'), workouts, sessions);
            let response: AccountActionResult | void = undefined;
            await act(async () => {
                response = await result.current.syncActions?.onEnableSync?.();
            });

            expect(response).toMatchObject({ ok: true });
            expect(useSyncStore.getState()).toMatchObject({
                syncEnabled: true,
                firstSyncState: 'idle',
                pendingChoice: null,
            });
            if (expectedChoice === 'replace-local') {
                expect(fetchRemoteLibrarySnapshotMock).toHaveBeenCalledTimes(1);
                expect(overwriteRemoteLibraryWithLocalMock).not.toHaveBeenCalled();
            } else {
                expect(overwriteRemoteLibraryWithLocalMock).toHaveBeenCalledWith(
                    expect.anything(),
                    'account-a',
                    workouts,
                    sessions,
                );
                expect(fetchRemoteLibrarySnapshotMock).not.toHaveBeenCalled();
            }
        },
    );

    it('requires an explicit first-sync choice when both libraries contain data', async () => {
        const localWorkout = createWorkout('Local Workout');
        const cloudWorkout = asAppliedWorkout(createWorkout('Cloud Workout'), 3);
        setOwner('account-a');
        useWorkoutStore.setState({ savedWorkouts: [localWorkout] });
        inspectRemoteSyncPresenceMock.mockResolvedValue({ hasData: true, workoutCount: 1, sessionCount: 0 });
        fetchRemoteLibrarySnapshotMock.mockResolvedValue({ workouts: [cloudWorkout], sessions: [] });

        const { result } = renderController(buildAccount('account-a'), [localWorkout]);
        let promptResult: AccountActionResult | void = undefined;
        await act(async () => {
            promptResult = await result.current.syncActions?.onEnableSync?.();
        });

        expect(promptResult).toMatchObject({ ok: false, requiresChoice: true });
        expect(result.current.syncSnapshot?.status).toBe('enable-sync');
        expect(useSyncStore.getState().firstSyncState).toBe('pending-choice');
        expect(useSyncStore.getState().recoveryBackup).not.toBeNull();

        let replaceResult: AccountActionResult | void = undefined;
        await act(async () => {
            replaceResult = await result.current.syncActions?.onEnableSync?.('replace-local');
        });

        expect(replaceResult).toEqual({
            ok: true,
            message: 'This device now matches your cloud library.',
        });
        expect(useWorkoutStore.getState().savedWorkouts).toEqual([cloudWorkout]);
    });

    it('rolls back onboarding and preserves string errors when first-sync inspection fails', async () => {
        setOwner('account-a');
        inspectRemoteSyncPresenceMock.mockRejectedValue('Presence service unavailable');
        const { result } = renderController(buildAccount('account-a'));

        let response: AccountActionResult | void = undefined;
        await act(async () => {
            response = await result.current.syncActions?.onEnableSync?.();
        });

        expect(response).toEqual({ ok: false, message: 'Presence service unavailable' });
        expect(useSyncStore.getState()).toMatchObject({
            firstSyncState: 'idle',
            recoveryBackup: null,
            queueStatus: 'error',
            syncError: 'Presence service unavailable',
        });
    });

    it('abandons first sync when authentication ownership changes during remote inspection', async () => {
        const request = deferred<{ hasData: boolean; workoutCount: number; sessionCount: number }>();
        setOwner('account-a');
        inspectRemoteSyncPresenceMock.mockReturnValue(request.promise);
        const { result } = renderController(buildAccount('account-a'));

        const pendingResult = result.current.syncActions?.onEnableSync?.() as Promise<AccountActionResult>;
        act(() => {
            useSyncStore.getState().setCurrentUser('account-b');
        });
        request.resolve({ hasData: false, workoutCount: 0, sessionCount: 0 });

        await expect(pendingResult).resolves.toEqual({
            ok: false,
            message: 'Your account session changed before sync setup completed.',
        });
        expect(overwriteRemoteLibraryWithLocalMock).not.toHaveBeenCalled();
    });

    it('handles offline and online browser transitions only when device sync is enabled', async () => {
        setOwner('account-a');
        const { result } = renderController(buildAccount('account-a'));

        act(() => window.dispatchEvent(new Event('offline')));
        expect(result.current.syncSnapshot).toMatchObject({ status: 'enable-sync', isOnline: false });
        expect(useSyncStore.getState().queueStatus).toBe('idle');

        act(() => {
            useSyncStore.setState({ syncEnabled: true });
        });
        await waitFor(() => expect(result.current.syncSnapshot?.status).toBe('offline'));
        await expect(result.current.syncActions?.onSyncNow?.()).resolves.toEqual({
            ok: false,
            message: 'You are offline. Sync will resume when you reconnect.',
        });
        expect(useSyncStore.getState().queueStatus).toBe('paused-offline');

        act(() => window.dispatchEvent(new Event('online')));
        await waitFor(() => expect(result.current.syncSnapshot?.status).toBe('last-synced'));
        expect(useSyncStore.getState().queueStatus).toBe('idle');
    });

    it('pulls a remote snapshot when sync-now has no local operations', async () => {
        const remoteWorkout = asAppliedWorkout(createWorkout('Remote Pull'), 7);
        const remoteSession = asAppliedSession(createSession('Remote Session'), 5);
        setOwner('account-a', true);
        fetchRemoteLibrarySnapshotMock.mockResolvedValue({
            workouts: [remoteWorkout],
            sessions: [remoteSession],
        });
        const { result } = renderController(buildAccount('account-a'));

        let response: AccountActionResult | void = undefined;
        await act(async () => {
            response = await result.current.syncActions?.onSyncNow?.();
        });

        expect(response).toEqual({ ok: true, message: 'Cloud sync completed.' });
        expect(useWorkoutStore.getState()).toMatchObject({
            savedWorkouts: [remoteWorkout],
            savedSessions: [remoteSession],
        });
        expect(useSyncStore.getState().lastSyncedAt).not.toBeNull();
    });

    it.each([
        ['auth-expired', new Error('JWT expired'), true, 'JWT expired'],
        ['sync-error', 503, false, 'Cloud sync failed.'],
    ] as const)(
        'maps an empty-queue sync-now failure to %s',
        async (expectedStatus, error, expectedAuthExpired, expectedMessage) => {
            setOwner('account-a', true);
            fetchRemoteLibrarySnapshotMock.mockRejectedValue(error);
            const { result } = renderController(buildAccount('account-a'));

            let response: AccountActionResult | void = undefined;
            await act(async () => {
                response = await result.current.syncActions?.onSyncNow?.();
            });

            expect(response).toEqual({ ok: false, message: expectedMessage });
            expect(useSyncStore.getState().authExpired).toBe(expectedAuthExpired);
            expect(useSyncStore.getState().syncError).toBe(expectedMessage);
            expect(result.current.syncSnapshot?.status).toBe(expectedStatus);
        },
    );

    it('reports queued singular and plural changes without forcing them before retry time', async () => {
        setOwner('account-a', true);
        const retryAt = new Date(Date.now() + 60_000).toISOString();
        useSyncStore.setState({
            queuedOperations: [queueItem({ nextRetryAt: retryAt })],
            queueStatus: 'pending',
        });
        const { result } = renderController(buildAccount('account-a'));

        await expect(result.current.syncActions?.onSyncNow?.()).resolves.toEqual({
            ok: true,
            message: 'Queued 1 local change for sync.',
        });

        act(() => {
            useSyncStore.setState({
                queuedOperations: [
                    queueItem({ nextRetryAt: retryAt }),
                    queueItem({
                        id: 'session:queued-session',
                        operationId: 'operation-session',
                        entityType: 'session',
                        entityId: 'queued-session',
                        localId: 'queued-session',
                        nextRetryAt: retryAt,
                    }),
                ],
            });
        });

        await expect(result.current.syncActions?.onSyncNow?.()).resolves.toEqual({
            ok: true,
            message: 'Queued 2 local changes for sync.',
        });
        expect(fetchRemoteLibrarySnapshotMock).not.toHaveBeenCalled();
    });

    it('retries, resumes, and disables an offline dead-letter queue through account actions', async () => {
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
        setOwner('account-a', true);
        useSyncStore.setState({
            queuedOperations: [queueItem({
                attempts: 2,
                lastError: 'Needs review',
                deadLetteredAt: NOW,
            })],
            queueStatus: 'dead-letter',
            syncError: 'Needs review',
        });
        const { result } = renderController(buildAccount('account-a'));

        await expect(result.current.syncActions?.onRetrySync?.()).resolves.toEqual({
            ok: true,
            message: 'Retrying cloud sync.',
        });
        expect(useSyncStore.getState().queuedOperations[0]).toMatchObject({
            attempts: 0,
            lastError: null,
            deadLetteredAt: null,
        });
        await expect(result.current.syncActions?.onResumeSync?.()).resolves.toEqual({
            ok: true,
            message: 'Cloud sync resumed.',
        });
        await expect(result.current.syncActions?.onDisableSync?.()).resolves.toEqual({
            ok: true,
            message: 'Cloud sync turned off for this device.',
        });
        expect(useSyncStore.getState()).toMatchObject({
            syncEnabled: false,
            queuedOperations: [],
        });
    });

    it('renders every sync snapshot status from public store state', async () => {
        getSupabaseClientMock.mockReturnValue(null);
        setOwner('account-a', true);
        const { result } = renderController(buildAccount('account-a'));

        act(() => useSyncStore.setState({ authExpired: true, syncError: null }));
        expect(result.current.syncSnapshot).toMatchObject({
            status: 'auth-expired',
            detail: expect.stringContaining('session expired'),
        });

        act(() => useSyncStore.setState({
            authExpired: false,
            queueStatus: 'paused-offline',
        }));
        expect(result.current.syncSnapshot).toMatchObject({ status: 'offline', isOnline: false });

        act(() => useSyncStore.setState({
            queueStatus: 'syncing',
            queuedOperations: [queueItem()],
        }));
        expect(result.current.syncSnapshot).toMatchObject({
            status: 'syncing',
            detail: expect.stringContaining('1 pending change'),
        });

        act(() => useSyncStore.setState({
            queueStatus: 'dead-letter',
            queuedOperations: [],
            syncError: null,
        }));
        expect(result.current.syncSnapshot).toMatchObject({
            status: 'sync-error',
            isPaused: true,
            detail: expect.stringContaining('1 local change'),
        });

        act(() => useSyncStore.setState({
            queueStatus: 'error',
            syncError: 'Ordinary sync failure',
        }));
        expect(result.current.syncSnapshot).toMatchObject({
            status: 'sync-error',
            detail: 'Ordinary sync failure',
        });

        act(() => useSyncStore.setState({
            queueStatus: 'idle',
            syncError: null,
            firstSyncState: 'processing',
        }));
        expect(result.current.syncSnapshot).toMatchObject({
            status: 'syncing',
            detail: expect.stringContaining('Setting up'),
        });

        act(() => useSyncStore.setState({
            firstSyncState: 'pending-choice',
            recoveryBackup: null,
        }));
        expect(result.current.syncSnapshot).toMatchObject({
            status: 'first-sync-required',
            detail: expect.stringContaining('Run the first sync'),
        });

        act(() => useSyncStore.setState({
            recoveryBackup: {
                createdAt: NOW,
                expiresAt: '2099-01-01T00:00:00.000Z',
                workouts: [],
                sessions: [],
            },
        }));
        expect(result.current.syncSnapshot?.detail).toContain('Pick whether');

        act(() => useSyncStore.setState({
            firstSyncState: 'idle',
            recoveryBackup: null,
            queuedOperations: [queueItem()],
        }));
        expect(result.current.syncSnapshot).toMatchObject({
            status: 'last-synced',
            detail: '1 local change waiting to sync.',
        });

        act(() => useSyncStore.setState({ queuedOperations: [] }));
        expect(result.current.syncSnapshot).toMatchObject({
            status: 'last-synced',
            detail: 'Cloud sync is on for this device.',
        });
        await waitFor(() => expect(useAccountStore.getState().syncStatus).toBe('idle'));
    });

    it.each(['workout', 'session'] as const)(
        'dead-letters a queued %s whose local snapshot is missing',
        async (entityType) => {
            setOwner('account-a', true);
            useSyncStore.getState().enqueueEntityChange({
                entityType,
                entityId: `missing-${entityType}`,
                localId: `missing-${entityType}`,
                operation: 'upsert',
                revision: 1,
                expectedRemoteRevision: 0,
            });

            renderController(buildAccount('account-a'));

            await waitFor(() => expect(useSyncStore.getState().queueStatus).toBe('dead-letter'));
            expect(useSyncStore.getState().queuedOperations[0].lastError).toContain(
                `queued ${entityType} snapshot is no longer available`,
            );
            expect(pushWorkoutMutationMock).not.toHaveBeenCalled();
            expect(pushSessionMutationMock).not.toHaveBeenCalled();
        },
    );

    it('dead-letters a session when the queued revision no longer matches local state', async () => {
        const session = createSession();
        setOwner('account-a', true);
        useWorkoutStore.setState({ savedSessions: [session] });
        useSyncStore.getState().enqueueEntityChange({
            entityType: 'session',
            entityId: session.id,
            localId: session.sync!.localId,
            operation: 'upsert',
            revision: session.sync!.revision + 1,
            expectedRemoteRevision: session.sync!.baseRevision,
        });

        renderController(buildAccount('account-a'), [], [session]);

        await waitFor(() => expect(useSyncStore.getState().queueStatus).toBe('dead-letter'));
        expect(useSyncStore.getState().syncError).toContain('revision no longer matches');
        expect(pushSessionMutationMock).not.toHaveBeenCalled();
    });

    it('acknowledges a legacy raw session upsert response', async () => {
        const session = createSession();
        const remoteSession = asAppliedSession(session, 4);
        seedQueuedSession('account-a', session);
        pushSessionMutationMock.mockResolvedValue(remoteSession);

        renderController(buildAccount('account-a'), [], [session]);

        await waitFor(() => expect(useSyncStore.getState().queuedOperations).toEqual([]));
        expect(pushSessionMutationMock).toHaveBeenCalledWith(expect.anything(), 'account-a', session, 0);
        expect(useWorkoutStore.getState().savedSessions[0].sync).toMatchObject({
            baseRevision: 4,
            dirty: false,
        });
    });

    it('normalizes a null session delete response and purges the tombstone', async () => {
        const base = createSession('Delete Session');
        const deletedSession: SavedSession = {
            ...base,
            sync: {
                ...base.sync!,
                remoteId: 'remote-session-delete',
                revision: 3,
                baseRevision: 2,
                pendingDelete: true,
                dirty: true,
                deletedAt: NOW,
            },
        };
        seedQueuedSession('account-a', deletedSession);
        pushSessionMutationMock.mockResolvedValue(null);

        renderController(buildAccount('account-a'), [], [deletedSession]);

        await waitFor(() => expect(useWorkoutStore.getState().savedSessions).toEqual([]));
        expect(useSyncStore.getState().queuedOperations).toEqual([]);
    });

    it('dead-letters a session conflict while keeping its local copy', async () => {
        const session = createSession('Local Session');
        seedQueuedSession('account-a', session);
        pushSessionMutationMock.mockResolvedValue({
            status: 'conflict',
            reason: '',
            expectedRevision: 0,
            remoteRevision: 8,
            remoteDeletedAt: null,
            remoteRecord: asAppliedSession(session, 8),
        });

        renderController(buildAccount('account-a'), [], [session]);

        await waitFor(() => expect(useSyncStore.getState().queueStatus).toBe('dead-letter'));
        expect(useSyncStore.getState().syncError).toContain('newer remote session revision exists');
        expect(useWorkoutStore.getState().savedSessions).toEqual([session]);
    });

    it.each([
        ['HTTP status', { status: 400 }],
        ['database code', { code: '23505' }],
    ] as const)('dead-letters permanent mutation failures identified by %s', async (_label, error) => {
        const workout = createWorkout();
        seedQueuedWorkout('account-a', workout);
        pushWorkoutMutationMock.mockRejectedValue(error);

        renderController(buildAccount('account-a'), [workout]);

        await waitFor(() => expect(useSyncStore.getState().queueStatus).toBe('dead-letter'));
        expect(useSyncStore.getState().queuedOperations[0]).toMatchObject({
            attempts: 1,
            nextRetryAt: null,
            lastError: expect.stringContaining('Manual retry is required'),
        });
    });

    it('schedules retryable status-code failures and dead-letters the fifth attempt', async () => {
        const workout = createWorkout();
        seedQueuedWorkout('account-a', workout);
        const nowMs = new Date(NOW).getTime();
        vi.spyOn(Date, 'now').mockReturnValue(nowMs);
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        pushWorkoutMutationMock.mockRejectedValueOnce({ statusCode: 408 });

        const { unmount } = renderController(buildAccount('account-a'), [workout]);

        await waitFor(() => expect(useSyncStore.getState().queuedOperations[0].attempts).toBe(1));
        expect(useSyncStore.getState().queuedOperations[0].nextRetryAt).toBe('2026-08-05T00:00:02.000Z');
        unmount();

        resetStores();
        seedQueuedWorkout('account-a', workout);
        useSyncStore.setState((state) => ({
            queuedOperations: state.queuedOperations.map((item) => ({ ...item, attempts: 4 })),
        }));
        pushWorkoutMutationMock.mockRejectedValueOnce(new TypeError('Still offline'));
        renderController(buildAccount('account-a'), [workout]);

        await waitFor(() => expect(useSyncStore.getState().queueStatus).toBe('dead-letter'));
        expect(useSyncStore.getState().queuedOperations[0]).toMatchObject({
            attempts: 5,
            nextRetryAt: null,
        });
    });

    it('pauses background processing when the mutation reports an expired session', async () => {
        const workout = createWorkout();
        seedQueuedWorkout('account-a', workout);
        pushWorkoutMutationMock.mockRejectedValue(new Error('Refresh token expired'));
        const { result } = renderController(buildAccount('account-a'), [workout]);

        await waitFor(() => expect(useSyncStore.getState().queueStatus).toBe('paused-auth'));
        expect(useSyncStore.getState()).toMatchObject({
            authExpired: true,
            syncError: 'Refresh token expired',
        });
        expect(result.current.syncSnapshot?.status).toBe('auth-expired');
        expect(useAccountStore.getState().syncStatus).toBe('error');
    });

    it('cancels an in-flight account A mutation after rerendering for account B', async () => {
        const workout = createWorkout('Account A In Flight');
        const request = deferred<unknown>();
        seedQueuedWorkout('account-a', workout);
        pushWorkoutMutationMock.mockReturnValue(request.promise);

        const { rerender } = renderHook(
            ({ userId }) => useSyncController({
                account: buildAccount(userId),
                savedWorkouts: [workout],
                savedSessions: [],
            }),
            { initialProps: { userId: 'account-a' } },
        );
        await waitFor(() => expect(pushWorkoutMutationMock).toHaveBeenCalledTimes(1));

        rerender({ userId: 'account-b' });
        await waitFor(() => expect(useSyncStore.getState().currentUserId).toBe('account-b'));
        request.resolve({
            status: 'applied',
            record: asAppliedWorkout(workout, 2),
            remoteRevision: 2,
        });
        await act(async () => request.promise);

        expect(useSyncStore.getState().queuedOperations).toEqual([]);
        expect(useWorkoutStore.getState().savedWorkouts[0].sync).toMatchObject({
            dirty: true,
            baseRevision: 0,
        });
    });
});

describe('useSyncStore coverage contracts', () => {
    beforeEach(() => {
        resetStores();
    });

    it('hydrates queue counts, preserves same-owner work, and resets on sign-out', () => {
        setOwner('account-a', true);
        const item = queueItem();
        const backup: SyncRecoveryBackup = {
            createdAt: NOW,
            expiresAt: '2099-01-01T00:00:00.000Z',
            workouts: [],
            sessions: [],
        };
        useSyncStore.setState({
            hydrateComplete: false,
            queuedOperations: [item],
            recoveryBackup: backup,
        });

        act(() => useSyncStore.getState().markHydrated());
        expect(useSyncStore.getState()).toMatchObject({
            hydrateComplete: true,
            queueStatus: 'pending',
            pendingCounts: { total: 1, workouts: 1, upserts: 1 },
            recoveryBackup: backup,
        });

        const generation = useSyncStore.getState().authGeneration;
        act(() => useSyncStore.getState().setCurrentUser('account-a'));
        expect(useSyncStore.getState().queuedOperations).toEqual([item]);
        expect(useSyncStore.getState().authGeneration).toBe(generation);

        act(() => useSyncStore.getState().setCurrentUser(null));
        expect(useSyncStore.getState()).toMatchObject({
            currentUserId: null,
            syncEnabled: false,
            queuedOperations: [],
            hydrateComplete: true,
        });
    });

    it('covers onboarding cancellation and ignores completion from the wrong owner', () => {
        setOwner('account-a');
        const backup: SyncRecoveryBackup = {
            createdAt: NOW,
            workouts: [],
            sessions: [],
        };
        act(() => {
            useSyncStore.getState().beginEnableSync(backup, true);
            useSyncStore.getState().markFirstSyncProcessing('upload-local');
            useSyncStore.getState().completeEnableSync('account-b', NOW);
        });
        expect(useSyncStore.getState()).toMatchObject({
            syncEnabled: false,
            firstSyncState: 'processing',
            pendingChoice: 'upload-local',
        });

        act(() => useSyncStore.getState().cancelEnableSync());
        expect(useSyncStore.getState()).toMatchObject({
            firstSyncState: 'idle',
            onboardingRemoteHasData: false,
            recoveryBackup: null,
            pendingChoice: null,
        });
    });

    it('ignores unowned enqueues and preserves syncing while replacing a queued entity', () => {
        act(() => {
            useSyncStore.getState().enqueueEntityChange({
                entityType: 'workout',
                entityId: 'ignored',
                localId: 'ignored',
                operation: 'upsert',
                revision: 1,
            });
        });
        expect(useSyncStore.getState().queuedOperations).toEqual([]);

        setOwner('account-a', true);
        act(() => {
            useSyncStore.getState().enqueueEntityChange({
                entityType: 'workout',
                entityId: 'owned',
                localId: 'owned',
                operation: 'upsert',
                revision: 1,
            });
            useSyncStore.getState().markQueueSyncing();
            useSyncStore.getState().enqueueEntityChange({
                entityType: 'workout',
                entityId: 'owned',
                localId: 'owned',
                operation: 'delete',
                revision: 2,
                expectedRemoteRevision: 1,
            });
        });

        expect(useSyncStore.getState()).toMatchObject({
            queueStatus: 'syncing',
            pendingCounts: { total: 1, deletes: 1, upserts: 0 },
        });
        expect(useSyncStore.getState().queuedOperations[0]).toMatchObject({
            operation: 'delete',
            revision: 2,
        });
    });

    it('exposes offline, auth, ordinary error, and clear-error transitions', () => {
        setOwner('account-a', true);
        act(() => useSyncStore.getState().markQueuePausedOffline());
        expect(useSyncStore.getState().queueStatus).toBe('paused-offline');

        act(() => useSyncStore.getState().markQueuePausedAuth('Session expired'));
        expect(useSyncStore.getState()).toMatchObject({
            queueStatus: 'paused-auth',
            syncError: 'Session expired',
            authExpired: true,
        });

        act(() => useSyncStore.getState().markQueueError('Network failed'));
        expect(useSyncStore.getState()).toMatchObject({
            queueStatus: 'error',
            syncError: 'Network failed',
            authExpired: false,
        });

        act(() => useSyncStore.getState().clearQueueError());
        expect(useSyncStore.getState()).toMatchObject({ syncError: null, authExpired: false });
    });

    it('acknowledges deletes exactly once and ignores stale retry tokens', () => {
        setOwner('account-a', true);
        act(() => useSyncStore.getState().enqueueEntityChange({
            entityType: 'session',
            entityId: 'session-delete',
            localId: 'session-delete',
            operation: 'delete',
            revision: 3,
            expectedRemoteRevision: 2,
        }));
        const operation = useSyncStore.getState().queuedOperations[0];

        expect(useSyncStore.getState().isOperationCurrent(operation)).toBe(true);
        let acknowledged = false;
        act(() => {
            acknowledged = useSyncStore.getState().acknowledgeDelete({ ...operation, syncedAt: NOW });
        });
        expect(acknowledged).toBe(true);
        expect(useSyncStore.getState()).toMatchObject({
            queuedOperations: [],
            lastSyncedAt: NOW,
            queueStatus: 'idle',
        });

        act(() => {
            acknowledged = useSyncStore.getState().acknowledgeDelete({ ...operation, syncedAt: NOW });
            useSyncStore.getState().incrementAttempt({
                ...operation,
                nextRetryAt: null,
                error: 'Stale error',
                deadLetter: true,
            });
        });
        expect(acknowledged).toBe(false);
        expect(useSyncStore.getState().queuedOperations).toEqual([]);
        expect(useSyncStore.getState().isOperationCurrent(operation)).toBe(false);
    });

    it('leaves clean queue entries unchanged during manual retry and resets a session explicitly', () => {
        setOwner('account-a', true);
        act(() => useSyncStore.getState().enqueueEntityChange({
            entityType: 'workout',
            entityId: 'clean-workout',
            localId: 'clean-workout',
            operation: 'upsert',
            revision: 1,
        }));
        const operation = useSyncStore.getState().queuedOperations[0];

        act(() => useSyncStore.getState().retryFailedOperations());
        expect(useSyncStore.getState().queuedOperations).toEqual([operation]);

        act(() => useSyncStore.getState().resetForNewSession());
        expect(useSyncStore.getState()).toMatchObject({
            currentUserId: null,
            syncEnabled: false,
            queuedOperations: [],
            hydrateComplete: true,
        });
    });

    it('sanitizes malformed persisted fields while retaining valid owned operations', () => {
        const migrated = migratePersistedSyncState({
            syncEnabled: true,
            firstSyncState: 'processing',
            currentUserId: 'account-a',
            authGeneration: '',
            onboardingRemoteHasData: true,
            recoveryBackup: {
                createdAt: 'not-a-date',
                workouts: [],
                sessions: [],
            },
            pendingChoice: 'replace-local',
            queuedOperations: [
                null,
                { entityType: 'invalid' },
                {
                    entityType: 'session',
                    entityId: 'session-valid',
                    localId: 'session-valid',
                    operation: 'delete',
                    revision: 4,
                    operationId: '',
                    expectedRemoteRevision: 3.9,
                    attempts: -2,
                    queuedAt: 123,
                    nextRetryAt: 123,
                    lastError: 123,
                    deadLetteredAt: 123,
                },
            ],
            lastSyncedAt: 123,
        });

        expect(migrated).toMatchObject({
            syncEnabled: true,
            firstSyncState: 'processing',
            currentUserId: 'account-a',
            onboardingRemoteHasData: true,
            recoveryBackup: null,
            pendingChoice: 'replace-local',
            lastSyncedAt: null,
        });
        expect(migrated.authGeneration).toBeTruthy();
        expect(migrated.queuedOperations).toHaveLength(1);
        expect(migrated.queuedOperations[0]).toMatchObject({
            entityType: 'session',
            operation: 'delete',
            expectedRemoteRevision: 3,
            attempts: 0,
            nextRetryAt: null,
            lastError: null,
            deadLetteredAt: null,
        });
        expect(migrated.queuedOperations[0].operationId).toBeTruthy();
    });

    it('returns safe defaults for non-object, unowned, and unsupported persisted data', () => {
        expect(migratePersistedSyncState(null)).toMatchObject({
            syncEnabled: false,
            firstSyncState: 'idle',
            currentUserId: null,
            queuedOperations: [],
        });
        expect(migratePersistedSyncState({
            syncEnabled: 'yes',
            firstSyncState: 'complete',
            currentUserId: '   ',
            authGeneration: 'generation-valid',
            recoveryBackup: null,
            pendingChoice: 'merge',
            queuedOperations: [queueItem()],
            lastSyncedAt: NOW,
        })).toMatchObject({
            syncEnabled: false,
            firstSyncState: 'idle',
            currentUserId: null,
            authGeneration: 'generation-valid',
            recoveryBackup: null,
            pendingChoice: null,
            queuedOperations: [],
            lastSyncedAt: NOW,
        });
    });
});
