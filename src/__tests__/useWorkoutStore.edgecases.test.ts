import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkoutStore } from '@/store/useWorkoutStore';

const validConfig = {
    sets: '3',
    reps: '12',
    seconds: '4',
    rest: '20',
    myoReps: '4',
    myoWorkSecs: '2',
};

const buildWorkout = (id: string, name: string, overrides: Partial<Record<string, string>> = {}) => ({
    id,
    name,
    sets: overrides.sets ?? '3',
    reps: overrides.reps ?? '12',
    seconds: overrides.seconds ?? '4',
    rest: overrides.rest ?? '20',
    myoReps: overrides.myoReps ?? '4',
    myoWorkSecs: overrides.myoWorkSecs ?? '2',
    timesUsed: overrides.timesUsed ? Number(overrides.timesUsed) : 0,
    lastUsedAt: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
});

const buildWorkoutNode = (id: string, name: string, sourceWorkoutId: string | null = null) => ({
    id,
    type: 'workout' as const,
    name,
    config: { ...validConfig },
    sourceWorkoutId,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
});

const buildRestNode = (id: string, name: string, seconds: string) => ({
    id,
    type: 'rest' as const,
    name,
    seconds,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
});

const resetStore = () => {
    const store = useWorkoutStore.getState();

    useWorkoutStore.setState({
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
        lastTickSecond: -1,
        savedWorkouts: [],
        selectedSavedWorkoutId: null,
        lastImportSummary: null,
        savedSessions: [],
        selectedSavedSessionId: null,
        setupMode: 'workout',
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
        completedSessionWorkoutNodeIds: [],
    });

    store.setWorkoutConfig({
        sets: '2',
        reps: '10',
        seconds: '3',
        rest: '20',
        myoReps: '4',
        myoWorkSecs: '2',
    });
}

describe('useWorkoutStore edge cases', () => {
    beforeEach(() => {
        resetStore();
    });

    it('covers workout persistence validation and selection branches', () => {
        const store = useWorkoutStore.getState();

        act(() => {
            store.setSettings({ prepTime: 7 });
            store.setSettings({ concentricSecond: 9 });
            store.setWorkoutConfig({
                sets: 3 as any,
                reps: '10',
                seconds: '3',
                rest: '15',
                myoReps: '4',
                myoWorkSecs: '2',
            } as any);
            store.setWorkoutConfig(validConfig);
        });

        expect(useWorkoutStore.getState().settings.concentricSecond).toBe(2);

        expect(store.saveCurrentWorkout('')).toMatchObject({ ok: false, error: 'Workout name is required.' });

        expect(store.saveCurrentWorkout('Alpha')).toMatchObject({ ok: true });
        expect(useWorkoutStore.getState().savedWorkouts).toHaveLength(1);

        expect(store.saveCurrentWorkout('alpha')).toMatchObject({ ok: false, error: 'Workout name already exists.' });

        useWorkoutStore.setState({
            savedWorkouts: [
                buildWorkout('w-1', 'Alpha', { timesUsed: '1' }),
                buildWorkout('w-2', 'Beta'),
            ],
            selectedSavedWorkoutId: 'w-1',
        });

        expect(store.saveCurrentWorkout('Alpha Prime')).toMatchObject({ ok: true, id: 'w-1' });
        expect(useWorkoutStore.getState().savedWorkouts[0].name).toBe('Alpha Prime');

        expect(store.saveCurrentWorkoutAs('Alpha Prime')).toMatchObject({ ok: false, error: 'Workout name already exists.' });
        expect(store.saveWorkoutFromConfig('Beta Prime', validConfig, 'w-2')).toMatchObject({ ok: true, id: 'w-2' });
        expect(useWorkoutStore.getState().savedWorkouts.find((workout) => workout.id === 'w-2')?.name).toBe('Beta Prime');
        expect(store.saveWorkoutFromConfig('Gamma Prime', validConfig)).toMatchObject({ ok: true });
        expect(useWorkoutStore.getState().savedWorkouts).toHaveLength(3);
        expect(store.loadWorkout('missing')).toMatchObject({ ok: false, error: 'Workout not found.' });
        expect(store.renameWorkout('missing', '')).toMatchObject({ ok: false, error: 'Workout name is required.' });
        expect(store.renameWorkout('w-2', 'Alpha Prime')).toMatchObject({ ok: false, error: 'Workout name already exists.' });
        expect(store.renameWorkout('w-2', 'Beta Prime')).toMatchObject({ ok: true });

        act(() => {
            store.deleteWorkout('w-2');
        });
        expect(useWorkoutStore.getState().selectedSavedWorkoutId).toBeNull();

        act(() => {
            store.recordWorkoutUsed('w-1');
        });
        expect(useWorkoutStore.getState().savedWorkouts.find((workout) => workout.id === 'w-1')?.timesUsed).toBe(2);
    });

    it('covers session draft and node editor validation branches', () => {
        const store = useWorkoutStore.getState();

        expect(store.createSession('')).toMatchObject({ ok: false, error: 'Session name is required.' });

        const created = store.createSession('Branch Session');
        expect(created.ok).toBe(true);

        expect(store.saveSessionDraft()).toMatchObject({ ok: false, error: 'Session is invalid.' });
        expect(store.saveSessionDraftAs('')).toMatchObject({ ok: false, error: 'Session name is required.' });
        expect(store.saveSessionDraftAs('Branch Session')).toMatchObject({ ok: false, error: 'Session is invalid.' });

        useWorkoutStore.setState({ editingSessionDraft: null });
        expect(store.saveSessionDraft()).toMatchObject({ ok: false, error: 'No session draft is open.' });
        expect(store.saveSessionDraftAs('Copy')).toMatchObject({ ok: false, error: 'No session draft is open.' });

        expect(store.addWorkoutNodeFromSavedWorkout('missing')).toMatchObject({ ok: false, error: 'Workout not found.' });

        expect(store.loadSessionForEditing('missing')).toMatchObject({ ok: false, error: 'Session not found.' });

        useWorkoutStore.setState({
            savedSessions: [
                {
                    id: 'empty-session',
                    name: 'Empty Session',
                    nodes: [],
                    timesUsed: 0,
                    lastUsedAt: null,
                    createdAt: '2026-03-01T00:00:00.000Z',
                    updatedAt: '2026-03-01T00:00:00.000Z',
                },
            ],
        });
        expect(store.loadSessionForEditing('empty-session')).toMatchObject({ ok: false, error: 'Session needs at least one node.' });

        const validSession = {
            id: 'session-1',
            name: 'Session One',
            nodes: [buildWorkoutNode('node-1', 'Workout 1'), buildRestNode('node-2', 'Rest 1', '30')],
            timesUsed: 0,
            lastUsedAt: null,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
        };

        useWorkoutStore.setState({
            savedSessions: [validSession, { ...validSession, id: 'session-2', name: 'Session Two' }],
        });

        expect(store.loadSessionForEditing('session-1')).toMatchObject({ ok: true });
        expect(useWorkoutStore.getState().editingSessionDraft).not.toBe(useWorkoutStore.getState().savedSessions[0]);

        expect(store.renameSession('session-1', '')).toMatchObject({ ok: false, error: 'Session name is required.' });
        expect(store.renameSession('session-1', 'Session Two')).toMatchObject({ ok: false, error: 'Session name already exists.' });
        expect(store.renameSession('session-1', 'Session One Prime')).toMatchObject({ ok: true });

        expect(store.duplicateSession('missing-session', 'Copy')).toMatchObject({ ok: false, error: 'Session not found.' });
        expect(store.duplicateSession('session-1', '')).toMatchObject({ ok: false, error: 'Session name is required.' });
        expect(store.duplicateSession('session-1', 'Session Two')).toMatchObject({ ok: false, error: 'Session name already exists.' });
        expect(store.duplicateSession('session-1', 'Session One Copy')).toMatchObject({ ok: true });

        useWorkoutStore.setState({ editingSessionDraft: null, editingSessionNodeId: null });
        expect(store.updateWorkoutNode('node-1', validConfig)).toMatchObject({ ok: false, error: 'No session draft is open.' });
        expect(store.updateRestNode('node-2', '45')).toMatchObject({ ok: false, error: 'No session draft is open.' });
        act(() => {
            store.removeSessionNode('node-1');
            store.moveSessionNode('node-1', 'left');
        });
        expect(useWorkoutStore.getState().editingSessionDraft).toBeNull();
        expect(store.moveSessionNodeToIndex('node-1', 0)).toMatchObject({ ok: false, error: 'No session draft is open.' });
        expect(store.replaceWorkoutNodeWithSavedWorkout('node-1', 'saved-1')).toMatchObject({
            ok: false,
            error: 'No session draft is open.',
        });

        act(() => {
            store.insertSessionNodeAfter(null, buildWorkoutNode('node-3', 'Workout 3'));
        });
        expect(useWorkoutStore.getState().editingSessionDraft).not.toBeNull();
        expect(useWorkoutStore.getState().setupMode).toBe('session');

        useWorkoutStore.setState({
            editingSessionDraft: {
                ...validSession,
                nodes: [buildWorkoutNode('node-1', 'Workout 1'), buildRestNode('node-2', 'Rest 1', '30')],
            },
            editingSessionNodeId: 'node-1',
        });

        act(() => {
            store.updateWorkoutNode('node-1', validConfig, '');
            store.updateWorkoutNode('node-1', validConfig, '  Spacey Name  ');
        });
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes[0].name).toBe('  Spacey Name  ');
        act(() => {
            store.updateWorkoutNode('node-1', validConfig, '');
        });
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes[0].name).toBe('');
        expect(store.saveSessionDraft()).toMatchObject({ ok: false, error: 'Session is invalid.' });
        act(() => {
            store.updateWorkoutNode('node-1', validConfig, 'Workout 1');
        });

        act(() => {
            store.insertSessionNodeAfter('missing-node', buildWorkoutNode('node-4', 'Workout 4'));
        });
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes.some((node) => node.id === 'node-4')).toBe(true);

        expect(store.replaceWorkoutNodeWithSavedWorkout('node-1', 'missing-workout')).toMatchObject({
            ok: false,
            error: 'Workout not found.',
        });

        useWorkoutStore.setState({ savedWorkouts: [buildWorkout('saved-1', 'Saved Workout')] });
        expect(store.replaceWorkoutNodeWithSavedWorkout('node-1', 'saved-1')).toMatchObject({ ok: true });
    });

    it('keeps unsaved session drafts out of persisted storage', () => {
        const state = useWorkoutStore.getState();

        useWorkoutStore.setState({
            setupMode: 'session',
            selectedSavedSessionId: 'session-1',
            editingSessionId: 'session-1',
            editingSessionDraft: {
                id: 'session-1',
                name: 'Draft Session',
                nodes: [buildRestNode('draft-rest', 'Rest 1', '30')],
                timesUsed: 0,
                lastUsedAt: null,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
            },
        });

        const partialize = (useWorkoutStore as unknown as {
            persist: { getOptions: () => { partialize: (value: typeof state) => Record<string, unknown> } };
        }).persist.getOptions().partialize;
        const persistedState = partialize(useWorkoutStore.getState());

        expect(persistedState.selectedSavedSessionId).toBe('session-1');
        expect(persistedState.setupMode).toBe('session');
        expect(persistedState).not.toHaveProperty('editingSessionId');
        expect(persistedState).not.toHaveProperty('editingSessionDraft');
    });

    it('covers session runtime fallbacks and advanceCycle branches', () => {
        const store = useWorkoutStore.getState();

        expect(store.startSession('missing-session')).toMatchObject({ ok: false, error: 'Session not found.' });

        useWorkoutStore.setState({
            savedSessions: [
                {
                    id: 'invalid-session',
                    name: 'Invalid Session',
                    nodes: [],
                    timesUsed: 0,
                    lastUsedAt: null,
                    createdAt: '2026-03-01T00:00:00.000Z',
                    updatedAt: '2026-03-01T00:00:00.000Z',
                },
            ],
        });
        expect(store.startSession('invalid-session')).toMatchObject({ ok: false, error: 'Session is invalid.' });

        const legacySession = {
            id: 'legacy-session',
            name: 'Legacy Session',
            nodes: [buildWorkoutNode('legacy-workout', 'Workout 1')],
            timesUsed: 0,
            lastUsedAt: null,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
        };
        useWorkoutStore.setState({
            savedSessions: [legacySession],
            savedWorkouts: [],
            editingSessionDraft: legacySession,
        });
        expect(store.startSession('legacy-session')).toMatchObject({ ok: true });
        expect(useWorkoutStore.getState().sessionStatus).toBe('running');
        act(() => {
            store.resetSession();
        });

        const runtimeSession = {
            id: 'runtime-session',
            name: 'Runtime Session',
            nodes: [buildWorkoutNode('runtime-workout', 'Workout 1', 'w-runtime'), buildRestNode('runtime-rest', 'Rest 1', '8')],
            timesUsed: 0,
            lastUsedAt: null,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
        };

        useWorkoutStore.setState({
            savedWorkouts: [buildWorkout('w-runtime', 'Runtime Workout')],
            savedSessions: [],
            editingSessionDraft: runtimeSession,
        });

        expect(store.startSession('runtime-session')).toMatchObject({ ok: true });
        expect(useWorkoutStore.getState().sessionStatus).toBe('running');
        expect(useWorkoutStore.getState().timerStatus).toBe('Preparing');
        expect(useWorkoutStore.getState().timeLeft).toBe(useWorkoutStore.getState().settings.prepTime);
        expect(useWorkoutStore.getState().savedSessions).toHaveLength(1);

        act(() => {
            store.setIsTimerRunning(false);
        });
        expect(useWorkoutStore.getState().sessionStatus).toBe('paused');
        expect(useWorkoutStore.getState().isRunningSession).toBe(false);

        act(() => {
            store.setIsTimerRunning(true);
        });
        expect(useWorkoutStore.getState().sessionStatus).toBe('running');
        expect(useWorkoutStore.getState().isRunningSession).toBe(true);

        act(() => {
            store.pauseSession();
        });
        expect(useWorkoutStore.getState().sessionStatus).toBe('paused');
        expect(useWorkoutStore.getState().isTimerRunning).toBe(false);

        act(() => {
            store.resumeSession();
        });
        expect(useWorkoutStore.getState().sessionStatus).toBe('running');
        expect(useWorkoutStore.getState().isTimerRunning).toBe(true);

        useWorkoutStore.setState({
            activeSessionId: null,
            isRunningSession: false,
            sessionStatus: 'paused',
            isTimerRunning: false,
        });
        act(() => {
            store.resumeSession();
        });
        expect(useWorkoutStore.getState().isTimerRunning).toBe(true);
        expect(useWorkoutStore.getState().isRunningSession).toBe(false);

        act(() => {
            store.resetSession();
        });
        expect(useWorkoutStore.getState().sessionStatus).toBe('idle');
        expect(useWorkoutStore.getState().activeSessionId).toBeNull();

        useWorkoutStore.setState({
            activeSessionId: 'missing-session',
            activeSessionNodeIndex: 0,
            sessionStatus: 'running',
            isRunningSession: true,
            isTimerRunning: true,
            editingSessionDraft: null,
            savedSessions: [],
        });
        act(() => {
            store.advanceSessionNode();
        });
        expect(useWorkoutStore.getState().sessionStatus).toBe('idle');

        useWorkoutStore.setState({
            activeSessionId: 'runtime-session',
            activeSessionNodeIndex: 1,
            sessionStatus: 'running',
            isRunningSession: true,
            isTimerRunning: true,
            savedSessions: [runtimeSession],
        });
        act(() => {
            store.advanceSessionNode();
        });
        expect(useWorkoutStore.getState().sessionStatus).toBe('finished');

        useWorkoutStore.setState({
            activeSessionId: 'runtime-session',
            activeSessionNodeIndex: 99,
            sessionStatus: 'running',
            isRunningSession: true,
            isTimerRunning: true,
            savedSessions: [runtimeSession],
        });
        act(() => {
            store.startSessionNode(99);
        });
        expect(useWorkoutStore.getState().sessionStatus).toBe('finished');

        useWorkoutStore.setState({
            sets: '2',
            reps: '2',
            seconds: '3',
            rest: '5',
            myoReps: '2',
            myoWorkSecs: '2',
            timerStatus: 'Preparing',
            isWorking: true,
            isMainRep: true,
            currentSet: 1,
            currentRep: 1,
            setTotalDuration: 0,
            activeSessionId: null,
            isRunningSession: false,
        });
        act(() => {
            store.advanceCycle();
        });
        expect(useWorkoutStore.getState().timerStatus).toBe('Main Set');

        useWorkoutStore.setState({
            timerStatus: 'Main Set',
            isWorking: true,
            isMainRep: true,
            currentSet: 1,
            currentRep: 1,
            sets: '2',
            reps: '2',
            seconds: '3',
            rest: '5',
            myoReps: '2',
            myoWorkSecs: '2',
            activeSessionId: null,
            isRunningSession: false,
        });
        act(() => {
            store.advanceCycle();
        });
        expect(useWorkoutStore.getState().currentRep).toBe(2);

        useWorkoutStore.setState({
            timerStatus: 'Main Set',
            isWorking: true,
            isMainRep: true,
            currentSet: 1,
            currentRep: 2,
            sets: '2',
            reps: '2',
            seconds: '3',
            rest: '5',
            myoReps: '2',
            myoWorkSecs: '2',
            activeSessionId: null,
            isRunningSession: false,
        });
        act(() => {
            store.advanceCycle();
        });
        expect(useWorkoutStore.getState().timerStatus).toBe('Resting');
        expect(useWorkoutStore.getState().isWorking).toBe(false);

        useWorkoutStore.setState({
            timerStatus: 'Resting',
            isWorking: false,
            isMainRep: false,
            currentSet: 1,
            currentRep: 1,
            sets: '2',
            reps: '2',
            seconds: '3',
            rest: '5',
            myoReps: '2',
            myoWorkSecs: '2',
            activeSessionId: null,
            isRunningSession: false,
        });
        act(() => {
            store.advanceCycle();
        });
        expect(useWorkoutStore.getState().timerStatus).toBe('Myo Reps');
        expect(useWorkoutStore.getState().currentSet).toBe(2);
        expect(useWorkoutStore.getState().isMainRep).toBe(false);

        useWorkoutStore.setState({
            timerStatus: 'Myo Reps',
            isWorking: true,
            isMainRep: false,
            currentSet: 2,
            currentRep: 1,
            sets: '2',
            reps: '2',
            seconds: '3',
            rest: '5',
            myoReps: '2',
            myoWorkSecs: '2',
            activeSessionId: null,
            isRunningSession: false,
        });
        act(() => {
            store.advanceCycle();
        });
        expect(useWorkoutStore.getState().currentRep).toBe(2);

        useWorkoutStore.setState({
            timerStatus: 'Myo Reps',
            isWorking: true,
            isMainRep: false,
            currentSet: 2,
            currentRep: 2,
            sets: '2',
            reps: '2',
            seconds: '3',
            rest: '5',
            myoReps: '2',
            myoWorkSecs: '2',
            activeSessionId: 'runtime-session',
            isRunningSession: true,
            savedSessions: [runtimeSession],
            activeSessionNodeIndex: 0,
        });
        act(() => {
            store.advanceCycle();
        });
        expect(useWorkoutStore.getState().sessionNodeRuntimeType).toBe('rest');
        expect(useWorkoutStore.getState().activeSessionNodeIndex).toBe(1);

        useWorkoutStore.setState({
            timerStatus: 'Myo Reps',
            isWorking: true,
            isMainRep: false,
            currentSet: 2,
            currentRep: 2,
            sets: '2',
            reps: '2',
            seconds: '3',
            rest: '5',
            myoReps: '2',
            myoWorkSecs: '2',
            activeSessionId: null,
            isRunningSession: false,
        });
        act(() => {
            store.advanceCycle();
        });
        expect(useWorkoutStore.getState().timerStatus).toBe('Finished');
    });

    it('only counts completed workout nodes when a session is terminated early', () => {
        const store = useWorkoutStore.getState();
        const trackedWorkouts = [
            buildWorkout('w-1', 'Workout One'),
            buildWorkout('w-2', 'Workout Two'),
            buildWorkout('w-3', 'Workout Three'),
        ];
        const session = {
            id: 'session-partial',
            name: 'Partial Session',
            nodes: [
                { ...buildWorkoutNode('node-1', 'Workout One'), config: { ...validConfig, sets: '1', reps: '1', seconds: '1' }, sourceWorkoutId: 'w-1' },
                { ...buildWorkoutNode('node-2', 'Workout Two'), config: { ...validConfig, sets: '1', reps: '1', seconds: '1' }, sourceWorkoutId: 'w-2' },
                { ...buildWorkoutNode('node-3', 'Workout Three'), config: { ...validConfig, sets: '1', reps: '1', seconds: '1' }, sourceWorkoutId: 'w-3' },
            ],
            timesUsed: 0,
            lastUsedAt: null,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
        };

        useWorkoutStore.setState({
            savedWorkouts: trackedWorkouts,
            savedSessions: [session],
            editingSessionDraft: session,
        });

        act(() => {
            store.startSession(session.id);
            store.advanceCycle();
            store.advanceCycle();
            store.advanceCycle();
            store.resetWorkout();
        });

        const state = useWorkoutStore.getState();
        expect(state.savedWorkouts.find((workout) => workout.id === 'w-1')?.timesUsed).toBe(1);
        expect(state.savedWorkouts.find((workout) => workout.id === 'w-2')?.timesUsed).toBe(1);
        expect(state.savedWorkouts.find((workout) => workout.id === 'w-3')?.timesUsed).toBe(0);
        expect(state.savedSessions.find((entry) => entry.id === session.id)?.timesUsed).toBe(0);
        expect(state.completedSessionWorkoutNodeIds).toEqual([]);
    });

    it('increments session usage only after the entire session finishes and ignores rest-only nodes for workout usage', () => {
        const store = useWorkoutStore.getState();
        const trackedWorkout = buildWorkout('w-1', 'Tracked Workout');
        const session = {
            id: 'session-finish',
            name: 'Finish Session',
            nodes: [
                { ...buildWorkoutNode('node-1', 'Tracked Workout'), config: { ...validConfig, sets: '1', reps: '1', seconds: '1' }, sourceWorkoutId: 'w-1' },
                buildRestNode('node-2', 'Rest', '8'),
            ],
            timesUsed: 0,
            lastUsedAt: null,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
        };

        useWorkoutStore.setState({
            savedWorkouts: [trackedWorkout],
            savedSessions: [session],
            editingSessionDraft: session,
        });

        act(() => {
            store.startSession(session.id);
        });

        let state = useWorkoutStore.getState();
        expect(state.savedSessions[0].timesUsed).toBe(0);
        expect(state.savedWorkouts[0].timesUsed).toBe(0);

        act(() => {
            store.advanceCycle();
            store.advanceCycle();
        });

        state = useWorkoutStore.getState();
        expect(state.savedWorkouts[0].timesUsed).toBe(1);
        expect(state.savedSessions[0].timesUsed).toBe(0);
        expect(state.sessionNodeRuntimeType).toBe('rest');

        act(() => {
            store.completeSessionNode();
        });

        state = useWorkoutStore.getState();
        expect(state.savedWorkouts[0].timesUsed).toBe(1);
        expect(state.savedSessions[0].timesUsed).toBe(1);
        expect(state.savedSessions[0].lastUsedAt).not.toBeNull();
    });

    it('clears session completion bookkeeping between runs and ignores workout nodes without source ids', () => {
        const store = useWorkoutStore.getState();
        const trackedWorkout = buildWorkout('w-1', 'Tracked Workout');
        const session = {
            id: 'session-repeat',
            name: 'Repeat Session',
            nodes: [
                { ...buildWorkoutNode('node-1', 'Tracked Workout'), config: { ...validConfig, sets: '1', reps: '1', seconds: '1' }, sourceWorkoutId: 'w-1' },
                { ...buildWorkoutNode('node-2', 'Custom Workout'), config: { ...validConfig, sets: '1', reps: '1', seconds: '1' }, sourceWorkoutId: null },
            ],
            timesUsed: 0,
            lastUsedAt: null,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
        };

        useWorkoutStore.setState({
            savedWorkouts: [trackedWorkout],
            savedSessions: [session],
            editingSessionDraft: session,
        });

        act(() => {
            store.startSession(session.id);
            store.advanceCycle();
            store.advanceCycle();
            store.advanceCycle();
        });

        let state = useWorkoutStore.getState();
        expect(state.savedWorkouts[0].timesUsed).toBe(1);
        expect(state.savedSessions[0].timesUsed).toBe(1);
        expect(state.completedSessionWorkoutNodeIds).toEqual([]);

        act(() => {
            store.startSession(session.id);
        });

        expect(useWorkoutStore.getState().completedSessionWorkoutNodeIds).toEqual([]);

        act(() => {
            store.advanceCycle();
            store.advanceCycle();
            store.advanceCycle();
        });

        state = useWorkoutStore.getState();
        expect(state.savedWorkouts[0].timesUsed).toBe(2);
        expect(state.savedSessions[0].timesUsed).toBe(2);
    });
});
