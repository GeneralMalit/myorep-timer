import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSyncStore } from '@/store/useSyncStore';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import type { SavedSession, SessionNode } from '@/types/savedSessions';
import type { SavedWorkout, SavedWorkoutConfig } from '@/types/savedWorkouts';
import type { SyncMetadata } from '@/types/sync';

const timestamp = '2026-08-05T00:00:00.000Z';

const validConfig: SavedWorkoutConfig = {
    sets: '2',
    reps: '2',
    seconds: '2',
    rest: '3',
    myoReps: '2',
    myoWorkSecs: '1',
};

const defaultSettings = {
    activeColor: '#bb86fc',
    restColor: '#03dac6',
    concentricColor: '#cf6679',
    concentricSecond: 1,
    smoothAnimation: true,
    prepTime: 5,
    fullScreenMode: false,
    metronomeEnabled: true,
    metronomeSound: 'woodblock',
    upDownMode: false,
    infoVisibility: 'always' as const,
    soundMode: 'metronome' as const,
    ttsEnabled: true,
    pulseEffect: 'always' as const,
    finishedColor: '#4caf50',
};

const buildSync = (localId: string, overrides: Partial<SyncMetadata> = {}): SyncMetadata => ({
    localId,
    remoteId: null,
    revision: 1,
    baseRevision: null,
    updatedAt: timestamp,
    dirty: true,
    pendingDelete: false,
    deletedAt: null,
    lastSyncedAt: null,
    ...overrides,
});

const buildWorkout = (
    id: string,
    name = `Workout ${id}`,
    overrides: Partial<SavedWorkout> = {},
): SavedWorkout => ({
    id,
    name,
    ...validConfig,
    timesUsed: 0,
    lastUsedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
});

const buildWorkoutNode = (
    id: string,
    sourceWorkoutId: string | null = null,
    overrides: Partial<Extract<SessionNode, { type: 'workout' }>> = {},
): Extract<SessionNode, { type: 'workout' }> => ({
    id,
    type: 'workout',
    name: `Workout node ${id}`,
    config: { ...validConfig },
    sourceWorkoutId,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
});

const buildRestNode = (
    id: string,
    seconds = '3',
    overrides: Partial<Extract<SessionNode, { type: 'rest' }>> = {},
): Extract<SessionNode, { type: 'rest' }> => ({
    id,
    type: 'rest',
    name: `Rest node ${id}`,
    seconds,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
});

const buildSession = (
    id: string,
    nodes: SessionNode[] = [buildRestNode(`${id}-rest`)],
    overrides: Partial<SavedSession> = {},
): SavedSession => ({
    id,
    name: `Session ${id}`,
    nodes,
    timesUsed: 0,
    lastUsedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
});

const resetStores = () => {
    useWorkoutStore.setState({
        settings: { ...defaultSettings },
        sets: '',
        reps: '',
        seconds: '',
        rest: '',
        myoReps: '',
        myoWorkSecs: '',
        savedWorkouts: [],
        selectedSavedWorkoutId: null,
        lastImportSummary: null,
        savedSessions: [],
        selectedSavedSessionId: null,
        setupMode: 'workout',
        editingSessionId: null,
        editingSessionDraft: null,
        editingSessionNodeId: null,
        appPhase: 'setup',
        timerStatus: 'Ready',
        isTimerRunning: false,
        currentSet: 1,
        currentRep: 1,
        isMainRep: true,
        isWorking: true,
        timeLeft: 0,
        setTotalDuration: 0,
        setElapsedTime: 0,
        pendingElapsedSeconds: 0,
        lastTickSecond: -1,
        activeSessionId: null,
        activeSessionNodeIndex: 0,
        sessionStatus: 'idle',
        isRunningSession: false,
        sessionNodeRuntimeType: null,
        sessionRestTimeLeft: 0,
        sessionLastTickSecond: -1,
        completedSessionWorkoutNodeIds: [],
        showSettings: false,
        isSidebarCollapsed: false,
        isAccountCardCollapsed: false,
        theme: 'theme-default',
    });

    useSyncStore.setState({
        syncEnabled: false,
        firstSyncState: 'idle',
        currentUserId: null,
        authGeneration: 'coverage-auth-generation',
        onboardingRemoteHasData: false,
        recoveryBackup: null,
        pendingChoice: null,
        queuedOperations: [],
        lastSyncedAt: null,
        queueStatus: 'idle',
        syncError: null,
        authExpired: false,
        pendingCounts: { total: 0, workouts: 0, sessions: 0, deletes: 0 },
        hydrateComplete: true,
    });
};

type WorkoutPersistOptions = {
    version: number;
    migrate?: (persistedState: unknown, version: number) => unknown | Promise<unknown>;
    partialize: (state: ReturnType<typeof useWorkoutStore.getState>) => Record<string, unknown>;
    storage?: {
        getItem: (name: string) => unknown;
        setItem: (name: string, value: unknown) => unknown;
        removeItem: (name: string) => unknown;
    };
};

const getPersistOptions = () => (
    useWorkoutStore.persist.getOptions() as unknown as WorkoutPersistOptions
);

const seedRunningTimer = () => {
    useWorkoutStore.setState({
        ...validConfig,
        appPhase: 'timer',
        timerStatus: 'Main Set',
        isTimerRunning: true,
        currentSet: 1,
        currentRep: 1,
        isMainRep: true,
        isWorking: true,
        timeLeft: 2,
        setTotalDuration: 4,
        setElapsedTime: 0,
        pendingElapsedSeconds: 0,
        activeSessionId: null,
        isRunningSession: false,
        sessionNodeRuntimeType: null,
        sessionRestTimeLeft: 0,
    });
};

describe('useWorkoutStore coverage branches', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        resetStores();
    });

    it('migrates malformed and complete legacy snapshots and preserves current snapshots', async () => {
        const options = getPersistOptions();
        expect(options.migrate).toBeTypeOf('function');

        const defaults = await options.migrate!(null, 0) as ReturnType<typeof options.partialize>;
        expect(defaults).toMatchObject({
            sets: '',
            savedWorkouts: [],
            savedSessions: [],
            selectedSavedWorkoutId: null,
            selectedSavedSessionId: null,
            setupMode: 'workout',
            isAccountCardCollapsed: false,
            theme: 'theme-default',
        });

        const invalidLegacy = await options.migrate!({
            settings: null,
            sets: 4,
            reps: false,
            seconds: {},
            rest: [],
            myoReps: 2,
            myoWorkSecs: null,
            savedWorkouts: 'not-an-array',
            savedSessions: 123,
            selectedSavedWorkoutId: 'missing-workout',
            selectedSavedSessionId: 'missing-session',
            setupMode: 'other',
            isAccountCardCollapsed: 'yes',
            theme: '   ',
        }, 2) as ReturnType<typeof options.partialize>;
        expect(invalidLegacy).toMatchObject({
            sets: '',
            reps: '',
            seconds: '',
            rest: '',
            myoReps: '',
            myoWorkSecs: '',
            selectedSavedWorkoutId: null,
            selectedSavedSessionId: null,
            setupMode: 'workout',
            isAccountCardCollapsed: false,
            theme: 'theme-default',
        });

        const legacyWorkout = buildWorkout('legacy-workout');
        const legacySession = buildSession('legacy-session');
        const migrated = await options.migrate!({
            settings: {
                activeColor: '#111111',
                restColor: '#222222',
                concentricColor: '#333333',
                concentricSecond: 99,
                smoothAnimation: false,
                prepTime: -3.8,
                fullScreenMode: true,
                metronomeEnabled: false,
                metronomeSound: 'click',
                upDownMode: true,
                infoVisibility: 'never',
                soundMode: 'tts',
                ttsEnabled: false,
                pulseEffect: 'resting',
                finishedColor: '#444444',
            },
            sets: '0',
            reps: '8',
            seconds: '2',
            rest: '10',
            myoReps: '3',
            myoWorkSecs: '5',
            savedWorkouts: [legacyWorkout],
            savedSessions: [legacySession],
            selectedSavedWorkoutId: legacyWorkout.id,
            selectedSavedSessionId: legacySession.id,
            setupMode: 'session',
            isAccountCardCollapsed: true,
            theme: 'theme-ocean',
        }, 1) as ReturnType<typeof options.partialize>;

        expect(migrated).toMatchObject({
            sets: '1',
            reps: '8',
            seconds: '2',
            selectedSavedWorkoutId: legacyWorkout.id,
            selectedSavedSessionId: legacySession.id,
            setupMode: 'session',
            isAccountCardCollapsed: true,
            theme: 'theme-ocean',
        });
        expect((migrated.settings as typeof defaultSettings)).toMatchObject({
            activeColor: '#111111',
            concentricSecond: 2,
            smoothAnimation: false,
            prepTime: 0,
            infoVisibility: 'never',
            soundMode: 'tts',
            pulseEffect: 'resting',
        });
        expect((migrated.savedWorkouts as SavedWorkout[])[0].sync).toMatchObject({
            localId: legacyWorkout.id,
        });
        expect((migrated.savedSessions as SavedSession[])[0].sync).toMatchObject({
            localId: legacySession.id,
        });

        const currentSnapshot = { sentinel: 'current' };
        expect(await options.migrate!(currentSnapshot, options.version)).toBe(currentSnapshot);
    });

    it('handles persisted storage reads, parse failures, duplicate writes, and removal', () => {
        const options = getPersistOptions();
        const storage = options.storage!;
        const persistedState = options.partialize(useWorkoutStore.getState());
        const storageValue = { state: persistedState, version: options.version };
        const getItem = vi.spyOn(window.localStorage, 'getItem');

        getItem.mockReturnValueOnce(JSON.stringify(storageValue));
        expect(storage.getItem('coverage-storage')).toEqual(storageValue);

        getItem.mockReturnValueOnce('{broken json');
        expect(storage.getItem('coverage-storage')).toBeNull();

        getItem.mockReturnValueOnce(null);
        expect(storage.getItem('coverage-storage')).toBeNull();

        const setItem = vi.spyOn(window.localStorage, 'setItem');
        storage.setItem('coverage-storage', storageValue);
        expect(setItem).toHaveBeenCalledTimes(1);
        storage.setItem('coverage-storage', storageValue);
        expect(setItem).toHaveBeenCalledTimes(1);

        const changedValue = {
            ...storageValue,
            state: { ...persistedState, theme: 'theme-fire' },
        };
        storage.setItem('coverage-storage', changedValue);
        expect(setItem).toHaveBeenCalledTimes(2);

        const removeItem = vi.spyOn(window.localStorage, 'removeItem');
        storage.removeItem('coverage-storage');
        expect(removeItem).toHaveBeenCalledWith('coverage-storage');
    });

    it('covers UI setters, numeric normalization, and workout CRUD guard paths', () => {
        const store = useWorkoutStore.getState();

        store.setShowSettings(true);
        store.setIsSidebarCollapsed(true);
        store.setIsAccountCardCollapsed(true);
        store.setTheme('theme-forest');
        store.setSetupMode('session');
        store.setSessionRestTimeLeft(8);
        store.setSessionLastTickSecond(7);
        store.setSetElapsedTime(6);
        store.setLastTickSecond(5);

        expect(useWorkoutStore.getState()).toMatchObject({
            showSettings: true,
            isSidebarCollapsed: true,
            isAccountCardCollapsed: true,
            theme: 'theme-forest',
            setupMode: 'session',
            sessionRestTimeLeft: 8,
            sessionLastTickSecond: 7,
            setElapsedTime: 6,
            lastTickSecond: 5,
        });

        store.setSettings({ prepTime: Number.POSITIVE_INFINITY });
        expect(useWorkoutStore.getState().settings.prepTime).toBe(5);
        store.setSettings({ prepTime: -4.7, concentricSecond: Number.NaN });
        expect(useWorkoutStore.getState().settings).toMatchObject({ prepTime: 0, concentricSecond: 1 });
        store.setSettings({ activeColor: '#abcdef' });
        expect(useWorkoutStore.getState().settings.activeColor).toBe('#abcdef');

        store.setWorkoutConfig({ seconds: 2 as unknown as string, myoWorkSecs: '' });
        expect(useWorkoutStore.getState().seconds).toBe(2);
        store.setWorkoutConfig({ ...validConfig });

        expect(store.saveWorkoutFromConfig('Blank Config', { ...validConfig, reps: '' })).toEqual({
            ok: false,
            error: 'Workout config is invalid.',
        });
        expect(store.saveWorkoutFromConfig('Missing', validConfig, 'missing-id')).toEqual({
            ok: false,
            error: 'Workout not found.',
        });

        expect(store.saveCurrentWorkoutAs('Alpha')).toMatchObject({ ok: true });
        expect(store.saveCurrentWorkoutAs('Beta')).toMatchObject({ ok: true });
        const [alpha, beta] = useWorkoutStore.getState().savedWorkouts;

        expect(store.saveWorkoutFromConfig('Beta', validConfig, alpha.id)).toEqual({
            ok: false,
            error: 'Workout name already exists.',
        });
        expect(store.renameWorkout('missing-id', 'Ghost')).toEqual({
            ok: false,
            error: 'Workout not found.',
        });

        const beforeMissingMutations = useWorkoutStore.getState().savedWorkouts;
        store.deleteWorkout('missing-id');
        store.recordWorkoutUsed('missing-id');
        expect(useWorkoutStore.getState().savedWorkouts).toBe(beforeMissingMutations);

        useWorkoutStore.setState({
            editingSessionId: 'draft-id',
            editingSessionDraft: buildSession('draft-id'),
            editingSessionNodeId: 'draft-node',
        });
        expect(store.loadWorkout(beta.id)).toEqual({ ok: true });
        expect(useWorkoutStore.getState()).toMatchObject({
            selectedSavedWorkoutId: beta.id,
            setupMode: 'workout',
            editingSessionId: null,
            editingSessionDraft: null,
            editingSessionNodeId: null,
        });
    });

    it('covers session CRUD guards and concrete node editing operations', () => {
        const store = useWorkoutStore.getState();
        const originalSession = buildSession('session-a', [
            buildWorkoutNode('workout-a'),
            buildRestNode('rest-a'),
        ]);
        useWorkoutStore.setState({ savedSessions: [originalSession] });

        expect(store.createSession('SESSION SESSION-A')).toEqual({
            ok: false,
            error: 'Session name already exists.',
        });
        useWorkoutStore.setState({
            savedSessions: [originalSession],
            editingSessionDraft: { ...originalSession, name: '   ' },
        });
        expect(store.saveSessionDraft()).toEqual({ ok: false, error: 'Session name is required.' });

        useWorkoutStore.setState({ editingSessionDraft: null });
        const addedRest = store.addRestNode('12');
        expect(addedRest).toMatchObject({ ok: true });
        expect(useWorkoutStore.getState().editingSessionDraft?.name).toBe('Session');

        useWorkoutStore.setState({ editingSessionDraft: null });
        store.setWorkoutConfig(validConfig);
        const addedCurrentWorkout = store.addWorkoutNodeFromCurrentSetup();
        expect(addedCurrentWorkout).toMatchObject({ ok: true });

        const savedWorkout = buildWorkout('saved-workout');
        useWorkoutStore.setState({ savedWorkouts: [savedWorkout], editingSessionDraft: null });
        const addedSavedWorkout = store.addWorkoutNodeFromSavedWorkout(savedWorkout.id);
        expect(addedSavedWorkout).toMatchObject({ ok: true });
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes[0]).toMatchObject({
            type: 'workout',
            sourceWorkoutId: savedWorkout.id,
        });

        const draft = buildSession('editable', [
            buildWorkoutNode('workout-1'),
            buildRestNode('rest-1'),
            buildWorkoutNode('workout-2'),
        ]);
        useWorkoutStore.setState({
            editingSessionId: draft.id,
            editingSessionDraft: draft,
            editingSessionNodeId: 'rest-1',
        });

        const beforeWrongTypeUpdates = useWorkoutStore.getState().editingSessionDraft?.nodes;
        store.updateWorkoutNode('rest-1', validConfig, 'Not a workout');
        store.updateRestNode('workout-1', '99', 'Not a rest');
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes).toEqual(beforeWrongTypeUpdates);

        store.updateWorkoutNode('workout-1', validConfig, undefined, 'coverage notes');
        store.updateRestNode('rest-1', '18');
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'workout-1', notes: 'coverage notes' }),
            expect.objectContaining({ id: 'rest-1', seconds: '18' }),
        ]));

        expect(store.moveSessionNodeToIndex('missing-node', 1)).toEqual({ ok: false, error: 'Node not found.' });
        expect(store.moveSessionNodeToIndex('workout-1', 0)).toEqual({ ok: true });
        expect(store.moveSessionNodeToIndex('workout-1', 99)).toEqual({ ok: true });
        const reorderedNodes = useWorkoutStore.getState().editingSessionDraft?.nodes ?? [];
        expect(reorderedNodes[reorderedNodes.length - 1]?.id).toBe('workout-1');

        store.moveSessionNode('workout-1', 'left');
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes[1].id).toBe('workout-1');
        store.insertSessionNodeAfter(null, buildRestNode('first-rest'));
        store.insertSessionNodeAfter('rest-1', buildWorkoutNode('inserted-workout'));
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes[0].id).toBe('first-rest');
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes.some((node) => node.id === 'inserted-workout')).toBe(true);

        store.setEditingSessionNodeId('inserted-workout');
        store.removeSessionNode('inserted-workout');
        expect(useWorkoutStore.getState().editingSessionNodeId).toBeNull();
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes.some((node) => node.id === 'inserted-workout')).toBe(false);

        const nodesBeforeNoMatchReplace = useWorkoutStore.getState().editingSessionDraft?.nodes;
        expect(store.replaceWorkoutNodeWithSavedWorkout('rest-1', savedWorkout.id)).toEqual({ ok: true });
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes).toEqual(nodesBeforeNoMatchReplace);

        const sessionsBeforeMissingActions = useWorkoutStore.getState().savedSessions;
        expect(store.renameSession('missing-session', 'Ghost Session')).toEqual({
            ok: false,
            error: 'Session not found.',
        });
        store.deleteSession('missing-session');
        store.recordSessionUsed('missing-session');
        expect(useWorkoutStore.getState().savedSessions).toEqual(sessionsBeforeMissingActions);
    });

    it('tombstones synced sessions and enforces acknowledgement guards before purge', () => {
        const store = useWorkoutStore.getState();
        const session = buildSession('synced-session', [buildRestNode('rest', '9')], {
            sync: buildSync('local-session', { revision: 4, baseRevision: 3 }),
        });
        const unrelatedSession = buildSession('unrelated-session');
        useSyncStore.setState({ syncEnabled: true, currentUserId: 'coverage-user' });
        useWorkoutStore.setState({
            savedSessions: [session, unrelatedSession],
            selectedSavedSessionId: session.id,
            editingSessionId: session.id,
            editingSessionDraft: session,
            editingSessionNodeId: 'rest',
            activeSessionId: session.id,
            activeSessionNodeIndex: 0,
            sessionStatus: 'running',
            isRunningSession: true,
            sessionNodeRuntimeType: 'rest',
            sessionRestTimeLeft: 9,
            sessionLastTickSecond: 8,
            isTimerRunning: true,
        });

        store.deleteSession(session.id);
        const deleted = useWorkoutStore.getState().savedSessions[0];
        expect(deleted.sync).toMatchObject({ pendingDelete: true, revision: 5 });
        expect(useSyncStore.getState().queuedOperations[0]).toMatchObject({
            entityType: 'session',
            operation: 'delete',
            localId: session.id,
            revision: 5,
            expectedRemoteRevision: 3,
        });
        expect(useWorkoutStore.getState()).toMatchObject({
            selectedSavedSessionId: null,
            editingSessionId: null,
            activeSessionId: null,
            sessionStatus: 'idle',
            isRunningSession: false,
            isTimerRunning: false,
        });

        expect(store.purgeDeletedSession('missing-session')).toBe(false);
        expect(store.purgeDeletedSession(session.id, { localId: 'wrong-local', revision: 5 })).toBe(false);
        expect(store.purgeDeletedSession(session.id, { localId: session.id, revision: 99 })).toBe(false);

        useWorkoutStore.setState({
            selectedSavedSessionId: session.id,
            editingSessionId: session.id,
            editingSessionDraft: deleted,
            editingSessionNodeId: 'rest',
            activeSessionId: session.id,
            activeSessionNodeIndex: 7,
            sessionStatus: 'paused',
            isRunningSession: true,
            sessionNodeRuntimeType: 'rest',
            sessionRestTimeLeft: 4,
            sessionLastTickSecond: 3,
            isTimerRunning: true,
        });
        expect(store.purgeDeletedSession(session.id, { localId: session.id, revision: 5 })).toBe(true);
        expect(useWorkoutStore.getState()).toMatchObject({
            savedSessions: [unrelatedSession],
            selectedSavedSessionId: null,
            editingSessionId: null,
            editingSessionDraft: null,
            editingSessionNodeId: null,
            activeSessionId: null,
            activeSessionNodeIndex: 0,
            sessionStatus: 'idle',
            isRunningSession: false,
            sessionNodeRuntimeType: null,
            sessionRestTimeLeft: 0,
            sessionLastTickSecond: -1,
            isTimerRunning: false,
        });

        const secondTombstone = buildSession('second-tombstone', [buildRestNode('second-rest')], {
            sync: buildSync('second-tombstone', {
                revision: 2,
                pendingDelete: true,
                deletedAt: timestamp,
            }),
        });
        useWorkoutStore.setState({
            savedSessions: [secondTombstone, unrelatedSession],
            selectedSavedSessionId: unrelatedSession.id,
            editingSessionId: unrelatedSession.id,
            editingSessionDraft: unrelatedSession,
            editingSessionNodeId: unrelatedSession.nodes[0].id,
            activeSessionId: unrelatedSession.id,
            activeSessionNodeIndex: 0,
            sessionStatus: 'running',
            isRunningSession: true,
            sessionNodeRuntimeType: 'rest',
            sessionRestTimeLeft: 3,
            sessionLastTickSecond: 2,
            isTimerRunning: true,
        });
        expect(store.purgeDeletedSession(secondTombstone.id)).toBe(true);
        expect(useWorkoutStore.getState()).toMatchObject({
            savedSessions: [unrelatedSession],
            selectedSavedSessionId: unrelatedSession.id,
            editingSessionId: unrelatedSession.id,
            activeSessionId: unrelatedSession.id,
            sessionStatus: 'running',
            isRunningSession: true,
            sessionNodeRuntimeType: 'rest',
            sessionRestTimeLeft: 3,
            sessionLastTickSecond: 2,
            isTimerRunning: true,
        });
    });

    it('rejects stale sync acknowledgements and merges only matching workout and session revisions', () => {
        const store = useWorkoutStore.getState();
        const currentWorkout = buildWorkout('local-workout-id', 'Local workout', {
            sync: buildSync('stable-workout-local-id', { revision: 3, baseRevision: 2 }),
        });
        const remoteWorkout = buildWorkout('remote-workout-id', 'Remote workout', {
            updatedAt: '2026-08-06T00:00:00.000Z',
            sync: buildSync('stable-workout-local-id', {
                remoteId: 'remote-workout-id',
                revision: 6,
                baseRevision: 6,
                dirty: false,
                updatedAt: '2026-08-06T00:00:00.000Z',
                lastSyncedAt: '2026-08-06T00:00:00.000Z',
            }),
        });
        const unrelatedWorkout = buildWorkout('unrelated-workout');
        useWorkoutStore.setState({ savedWorkouts: [currentWorkout, unrelatedWorkout] });

        expect(store.acknowledgeSyncedWorkout(buildWorkout('missing'))).toBe(false);
        expect(store.acknowledgeSyncedWorkout(remoteWorkout, {
            localId: 'wrong-local-id',
            revision: 3,
            remoteRevision: 8,
        })).toBe(false);
        expect(store.acknowledgeSyncedWorkout(remoteWorkout, {
            localId: 'stable-workout-local-id',
            revision: 99,
            remoteRevision: 8,
        })).toBe(false);
        expect(store.acknowledgeSyncedWorkout(remoteWorkout, {
            localId: 'stable-workout-local-id',
            revision: 3,
            remoteRevision: 8,
        })).toBe(true);
        expect(useWorkoutStore.getState().savedWorkouts[0].sync).toMatchObject({
            remoteId: 'remote-workout-id',
            revision: 8,
            baseRevision: 8,
            dirty: false,
            pendingDelete: false,
            deletedAt: null,
            lastSyncedAt: '2026-08-06T00:00:00.000Z',
        });

        const currentSession = buildSession('local-session-id', [buildRestNode('rest')], {
            sync: buildSync('stable-session-local-id', { revision: 2, baseRevision: 1 }),
        });
        const divergentDraft = {
            ...currentSession,
            sync: buildSync('stable-session-local-id', { revision: 3, baseRevision: 1 }),
        };
        const remoteSession = buildSession('remote-session-id', [buildRestNode('remote-rest')], {
            updatedAt: '2026-08-07T00:00:00.000Z',
            sync: buildSync('stable-session-local-id', {
                remoteId: 'remote-session-id',
                revision: 7,
                baseRevision: 7,
                dirty: false,
                updatedAt: '2026-08-07T00:00:00.000Z',
            }),
        });
        const unrelatedSession = buildSession('unrelated-ack-session');
        useWorkoutStore.setState({
            savedSessions: [currentSession, unrelatedSession],
            editingSessionId: currentSession.id,
            editingSessionDraft: divergentDraft,
        });

        expect(store.acknowledgeSyncedSession(buildSession('missing-session'))).toBe(false);
        expect(store.acknowledgeSyncedSession(remoteSession, {
            localId: 'wrong-session-local-id',
            revision: 2,
            remoteRevision: 7,
        })).toBe(false);
        expect(store.acknowledgeSyncedSession(remoteSession, {
            localId: 'stable-session-local-id',
            revision: 99,
            remoteRevision: 7,
        })).toBe(false);
        expect(store.acknowledgeSyncedSession(remoteSession, {
            localId: 'stable-session-local-id',
            revision: 2,
            remoteRevision: 7,
        })).toBe(true);
        expect(useWorkoutStore.getState().savedSessions[0].sync).toMatchObject({
            revision: 7,
            baseRevision: 7,
            dirty: false,
        });
        expect(useWorkoutStore.getState().editingSessionDraft?.sync).toMatchObject({
            revision: 3,
            dirty: true,
        });
        expect(useWorkoutStore.getState().savedSessions[1]).toBe(unrelatedSession);
    });

    it('guards workout purges by local id and revision', () => {
        const store = useWorkoutStore.getState();
        const workout = buildWorkout('deleted-workout', 'Deleted workout', {
            sync: buildSync('deleted-workout-local', {
                revision: 5,
                pendingDelete: true,
                deletedAt: timestamp,
            }),
        });
        useWorkoutStore.setState({ savedWorkouts: [workout], selectedSavedWorkoutId: workout.id });

        expect(store.purgeDeletedWorkout('missing')).toBe(false);
        expect(store.purgeDeletedWorkout(workout.id, { localId: 'wrong', revision: 5 })).toBe(false);
        expect(store.purgeDeletedWorkout(workout.id, { localId: 'deleted-workout-local', revision: 6 })).toBe(false);
        expect(store.purgeDeletedWorkout(workout.id, { localId: 'deleted-workout-local', revision: 5 })).toBe(true);
        expect(useWorkoutStore.getState()).toMatchObject({ savedWorkouts: [], selectedSavedWorkoutId: null });

        const unrelated = buildWorkout('unrelated-purge-workout');
        useWorkoutStore.setState({ savedWorkouts: [workout, unrelated], selectedSavedWorkoutId: unrelated.id });
        expect(store.purgeDeletedWorkout(workout.id)).toBe(true);
        expect(useWorkoutStore.getState()).toMatchObject({
            savedWorkouts: [unrelated],
            selectedSavedWorkoutId: unrelated.id,
        });
    });

    it('normalizes sync replacements, preserves valid selections, clamps indices, and resets removed runtime', () => {
        const store = useWorkoutStore.getState();
        const workout = buildWorkout('replacement-workout', 'Replacement workout', { sync: undefined });
        const session = buildSession('replacement-session', [buildRestNode('kept-node')], { sync: undefined });
        const draft = buildSession('replacement-session', [buildRestNode('stale-node')]);
        useWorkoutStore.setState({
            selectedSavedWorkoutId: workout.id,
            selectedSavedSessionId: session.id,
            editingSessionId: session.id,
            editingSessionDraft: draft,
            editingSessionNodeId: 'kept-node',
            activeSessionId: session.id,
            activeSessionNodeIndex: 99,
            appPhase: 'timer',
            timerStatus: 'Resting',
            isTimerRunning: true,
            isRunningSession: true,
            sessionStatus: 'running',
            sessionNodeRuntimeType: 'rest',
            timeLeft: 3,
            setElapsedTime: 1,
            sessionRestTimeLeft: 3,
        });

        store.replaceLibrariesFromSync({ workouts: [workout], sessions: [session] });
        expect(useWorkoutStore.getState()).toMatchObject({
            selectedSavedWorkoutId: workout.id,
            selectedSavedSessionId: session.id,
            editingSessionId: session.id,
            editingSessionNodeId: 'kept-node',
            activeSessionId: session.id,
            activeSessionNodeIndex: 0,
            timerStatus: 'Resting',
        });
        expect(useWorkoutStore.getState().savedWorkouts[0].sync).toMatchObject({ localId: workout.id });
        expect(useWorkoutStore.getState().savedSessions[0].sync).toMatchObject({ localId: session.id });
        expect(useWorkoutStore.getState().editingSessionDraft).not.toBe(useWorkoutStore.getState().savedSessions[0]);

        useWorkoutStore.setState({ editingSessionDraft: null, editingSessionId: session.id });
        store.replaceLibrariesFromSync({ workouts: [workout], sessions: [session] });
        expect(useWorkoutStore.getState().editingSessionId).toBe(session.id);
        expect(useWorkoutStore.getState().editingSessionDraft).toBeNull();

        useWorkoutStore.setState({
            selectedSavedWorkoutId: 'missing-workout',
            selectedSavedSessionId: 'missing-session',
            editingSessionId: 'missing-session',
            editingSessionDraft: draft,
            editingSessionNodeId: 'stale-node',
            activeSessionId: session.id,
            activeSessionNodeIndex: 0,
            completedSessionWorkoutNodeIds: ['completed-node'],
        });
        store.replaceLibrariesFromSync({ workouts: [], sessions: [] });
        expect(useWorkoutStore.getState()).toMatchObject({
            savedWorkouts: [],
            savedSessions: [],
            selectedSavedWorkoutId: null,
            selectedSavedSessionId: null,
            editingSessionId: null,
            editingSessionDraft: null,
            editingSessionNodeId: null,
            activeSessionId: null,
            activeSessionNodeIndex: 0,
            appPhase: 'setup',
            timerStatus: 'Ready',
            isTimerRunning: false,
            isRunningSession: false,
            sessionStatus: 'idle',
            sessionNodeRuntimeType: null,
            timeLeft: 0,
            setElapsedTime: 0,
            sessionRestTimeLeft: 0,
            completedSessionWorkoutNodeIds: [],
        });
    });

    it('ignores invalid elapsed deltas, applies epsilon boundaries, and is chunk-equivalent', () => {
        const store = useWorkoutStore.getState();
        seedRunningTimer();
        const initial = useWorkoutStore.getState();

        store.applyTimerElapsed(Number.NaN);
        store.applyTimerElapsed(Number.POSITIVE_INFINITY);
        store.applyTimerElapsed(-10);
        store.applyTimerElapsed(0.001);
        expect(useWorkoutStore.getState()).toMatchObject({
            timerStatus: initial.timerStatus,
            currentSet: initial.currentSet,
            currentRep: initial.currentRep,
            timeLeft: initial.timeLeft,
            setElapsedTime: initial.setElapsedTime,
            pendingElapsedSeconds: 0,
        });

        useWorkoutStore.setState({ timeLeft: 1, setElapsedTime: 0 });
        store.applyTimerElapsed(0.998);
        expect(useWorkoutStore.getState().currentRep).toBe(1);
        expect(useWorkoutStore.getState().timeLeft).toBeCloseTo(0.002, 8);

        seedRunningTimer();
        useWorkoutStore.setState({ timeLeft: 1, pendingElapsedSeconds: -4 });
        store.applyTimerElapsed(0.999);
        expect(useWorkoutStore.getState()).toMatchObject({
            currentRep: 2,
            timeLeft: 2,
            pendingElapsedSeconds: 0,
        });

        seedRunningTimer();
        store.applyTimerElapsed(4.5);
        const aggregate = useWorkoutStore.getState();
        const aggregateSnapshot = {
            timerStatus: aggregate.timerStatus,
            currentSet: aggregate.currentSet,
            currentRep: aggregate.currentRep,
            isMainRep: aggregate.isMainRep,
            isWorking: aggregate.isWorking,
            timeLeft: aggregate.timeLeft,
            setElapsedTime: aggregate.setElapsedTime,
            pendingElapsedSeconds: aggregate.pendingElapsedSeconds,
        };

        seedRunningTimer();
        [0.25, 1.25, 0.75, 2.25].forEach((delta) => store.applyTimerElapsed(delta));
        const chunked = useWorkoutStore.getState();
        expect(chunked).toMatchObject({
            timerStatus: aggregateSnapshot.timerStatus,
            currentSet: aggregateSnapshot.currentSet,
            currentRep: aggregateSnapshot.currentRep,
            isMainRep: aggregateSnapshot.isMainRep,
            isWorking: aggregateSnapshot.isWorking,
            pendingElapsedSeconds: aggregateSnapshot.pendingElapsedSeconds,
        });
        expect(chunked.timeLeft).toBeCloseTo(aggregateSnapshot.timeLeft, 8);
        expect(chunked.setElapsedTime).toBeCloseTo(aggregateSnapshot.setElapsedTime, 8);

        useWorkoutStore.setState({ isTimerRunning: false, pendingElapsedSeconds: 2 });
        store.applyTimerElapsed(0);
        expect(useWorkoutStore.getState().pendingElapsedSeconds).toBe(0);
    });

    it('catches up from session rest into the next workout and exercises resume and completion guards', () => {
        const store = useWorkoutStore.getState();
        const session = buildSession('progression', [
            buildRestNode('first-rest', '1'),
            buildWorkoutNode('next-workout', null, {
                config: { ...validConfig, sets: '1', reps: '2', seconds: '2', rest: '', myoReps: '', myoWorkSecs: '' },
            }),
        ]);
        useWorkoutStore.setState({
            savedSessions: [session, buildSession('other-progression-session')],
            editingSessionDraft: session,
        });
        expect(store.startSession(session.id)).toEqual({ ok: true });
        store.advanceCycle();
        expect(useWorkoutStore.getState()).toMatchObject({
            timerStatus: 'Resting',
            sessionNodeRuntimeType: 'rest',
            activeSessionNodeIndex: 0,
        });

        store.applyTimerElapsed(1.5);
        expect(useWorkoutStore.getState()).toMatchObject({
            timerStatus: 'Main Set',
            sessionNodeRuntimeType: 'workout',
            activeSessionNodeIndex: 1,
            currentRep: 1,
            timeLeft: 1.5,
            setElapsedTime: 0.5,
        });

        store.pauseSession();
        useWorkoutStore.setState({ activeSessionNodeIndex: 99 });
        store.resumeSession();
        expect(useWorkoutStore.getState()).toMatchObject({ sessionStatus: 'paused', isTimerRunning: false });

        useWorkoutStore.setState({ activeSessionNodeIndex: 1, timerStatus: 'Finished' });
        store.resumeSession();
        expect(useWorkoutStore.getState()).toMatchObject({ sessionStatus: 'paused', isTimerRunning: false });

        useWorkoutStore.setState({
            savedSessions: [],
            editingSessionDraft: session,
            timerStatus: 'Main Set',
        });
        store.resumeSession();
        expect(useWorkoutStore.getState()).toMatchObject({ sessionStatus: 'running', isTimerRunning: true });

        store.clearCompletedSessionWorkoutNodeIds();
        store.recordCompletedSessionWorkoutNode('missing-node');
        store.recordCompletedSessionWorkoutNode('first-rest');
        store.recordCompletedSessionWorkoutNode('next-workout');
        store.recordCompletedSessionWorkoutNode('next-workout');
        expect(useWorkoutStore.getState().completedSessionWorkoutNodeIds).toEqual(['next-workout']);
    });

    it('covers rare session and standalone advanceCycle completion paths', () => {
        const store = useWorkoutStore.getState();
        const linkedWorkout = buildWorkout('linked-workout');
        const workoutNode = buildWorkoutNode('session-workout', linkedWorkout.id, {
            config: { ...validConfig, sets: '1', reps: '1', seconds: '1', rest: '', myoReps: '', myoWorkSecs: '' },
        });
        const restNode = buildRestNode('after-workout', '4');
        const draftOnlySession = buildSession('draft-only-session', [workoutNode, restNode]);
        useWorkoutStore.setState({
            savedWorkouts: [linkedWorkout],
            savedSessions: [],
            editingSessionDraft: draftOnlySession,
            activeSessionId: draftOnlySession.id,
            activeSessionNodeIndex: 0,
            isRunningSession: true,
            sessionStatus: 'running',
            sessionNodeRuntimeType: 'workout',
            timerStatus: 'Main Set',
            isTimerRunning: true,
            isWorking: true,
            isMainRep: true,
            currentSet: 1,
            currentRep: 1,
            sets: '1',
            reps: '1',
            seconds: '1',
            rest: '',
            myoReps: '',
            myoWorkSecs: '',
            setTotalDuration: 1,
        });
        store.advanceCycle();
        expect(useWorkoutStore.getState()).toMatchObject({
            activeSessionNodeIndex: 1,
            sessionNodeRuntimeType: 'rest',
            timerStatus: 'Resting',
        });
        expect(useWorkoutStore.getState().savedWorkouts[0].timesUsed).toBe(1);

        const selected = useWorkoutStore.getState().savedWorkouts[0];
        useWorkoutStore.setState({
            ...validConfig,
            savedWorkouts: [selected],
            selectedSavedWorkoutId: selected.id,
            activeSessionId: null,
            isRunningSession: false,
            timerStatus: 'Myo Reps',
            isTimerRunning: true,
            isWorking: true,
            isMainRep: false,
            currentSet: 2,
            currentRep: 2,
            setTotalDuration: 2,
            setElapsedTime: 2,
        });
        store.advanceCycle();
        expect(useWorkoutStore.getState()).toMatchObject({ timerStatus: 'Finished', isTimerRunning: false });
        expect(useWorkoutStore.getState().savedWorkouts[0].timesUsed).toBe(2);

        useWorkoutStore.setState({
            ...validConfig,
            timerStatus: 'Preparing',
            activeSessionId: draftOnlySession.id,
            activeSessionNodeIndex: 0,
            isRunningSession: false,
            isTimerRunning: true,
            isWorking: true,
            isMainRep: true,
            currentRep: 1,
        });
        store.advanceCycle();
        expect(useWorkoutStore.getState()).toMatchObject({
            timerStatus: 'Main Set',
            activeSessionId: draftOnlySession.id,
            sessionNodeRuntimeType: 'rest',
        });

        useWorkoutStore.setState({ timerStatus: 'Finished', isTimerRunning: false });
        const finishedBeforeSkip = useWorkoutStore.getState();
        store.skipSection();
        expect(useWorkoutStore.getState()).toBe(finishedBeforeSkip);

        useWorkoutStore.setState({
            ...validConfig,
            timerStatus: 'Preparing',
            activeSessionId: null,
            isRunningSession: false,
            isTimerRunning: false,
            isWorking: true,
            isMainRep: true,
            currentRep: 1,
        });
        store.skipSection();
        expect(useWorkoutStore.getState()).toMatchObject({
            timerStatus: 'Main Set',
            isTimerRunning: false,
            currentRep: 1,
        });
    });
});
