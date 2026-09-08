import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import type { WorkoutSessionNode } from '@/types/savedSessions';

const workoutNodes = (): WorkoutSessionNode[] => (
    useWorkoutStore.getState().editingSessionDraft?.nodes.filter(
        (node): node is WorkoutSessionNode => node.type === 'workout',
    ) ?? []
);

const createTwoWorkoutSession = () => {
    const store = useWorkoutStore.getState();
    const result = store.createSession('Progression session');
    store.addDefaultWorkoutNode();
    store.addRestNode('60');
    store.addDefaultWorkoutNode();
    store.saveSessionDraft();
    return result.id!;
};

const completeCurrentWorkoutNaturally = () => {
    const state = useWorkoutStore.getState();
    const session = state.savedSessions.find((item) => item.id === state.activeSessionId)!;
    const node = session.nodes[state.activeSessionNodeIndex];
    expect(node.type).toBe('workout');
    state.recordCompletedSessionWorkoutNode(node.id);
    useWorkoutStore.getState().advanceSessionNode();
};

describe('session workout progression tracking', () => {
    beforeEach(() => {
        localStorage.clear();
        useWorkoutStore.setState(useWorkoutStore.getInitialState(), true);
    });

    it('adds a valid generic workout independent of the standalone setup', () => {
        const store = useWorkoutStore.getState();
        store.setWorkoutConfig({ sets: '', reps: '', seconds: '', rest: '', myoReps: '', myoWorkSecs: '' });
        store.createSession('Defaults');
        const result = store.addDefaultWorkoutNode();
        const node = workoutNodes()[0];

        expect(result.ok).toBe(true);
        expect(node.config).toEqual({
            sets: '3', reps: '15', seconds: '2', rest: '20', myoReps: '5', myoWorkSecs: '2',
        });
        expect(node.completedSessionsSinceProgression).toBe(0);
        expect(node.sourceWorkoutId).toBeNull();
        expect(useWorkoutStore.getState().editingSessionNodeId).toBe(node.id);
        store.addRestNode('60');
        const restNode = useWorkoutStore.getState().editingSessionDraft!.nodes.find((entry) => entry.type === 'rest');
        expect(restNode?.seconds).toBe('60');
    });

    it('increments every workout once only after all workout blocks complete', () => {
        const sessionId = createTwoWorkoutSession();
        expect(useWorkoutStore.getState().startSession(sessionId).ok).toBe(true);
        useWorkoutStore.getState().skipSection(); // prep is allowed
        completeCurrentWorkoutNaturally();
        useWorkoutStore.getState().advanceSessionNode(); // recovery may be skipped
        completeCurrentWorkoutNaturally();

        const finished = useWorkoutStore.getState();
        expect(finished.sessionStatus).toBe('finished');
        expect(workoutNodes().map((node) => node.completedSessionsSinceProgression)).toEqual([1, 1]);
        expect(finished.savedSessions[0].timesUsed).toBe(1);

        finished.advanceSessionNode();
        expect(workoutNodes().map((node) => node.completedSessionsSinceProgression)).toEqual([1, 1]);

        useWorkoutStore.getState().startSession(sessionId);
        useWorkoutStore.getState().skipSection();
        completeCurrentWorkoutNaturally();
        useWorkoutStore.getState().advanceSessionNode();
        completeCurrentWorkoutNaturally();
        expect(workoutNodes().map((node) => node.completedSessionsSinceProgression)).toEqual([2, 2]);
    });

    it('does not award any progression credit when one workout is skipped', () => {
        const sessionId = createTwoWorkoutSession();
        useWorkoutStore.getState().startSession(sessionId);
        useWorkoutStore.getState().skipSection();
        useWorkoutStore.getState().advanceSessionNode(); // skip first workout
        useWorkoutStore.getState().advanceSessionNode(); // skip recovery
        completeCurrentWorkoutNaturally();

        expect(workoutNodes().map((node) => node.completedSessionsSinceProgression)).toEqual([0, 0]);
        expect(useWorkoutStore.getState().savedSessions[0].timesUsed).toBe(1);
    });

    it('does not let a later workout be recorded as completed out of order', () => {
        const sessionId = createTwoWorkoutSession();
        const laterWorkoutId = workoutNodes()[1].id;
        useWorkoutStore.getState().startSession(sessionId);
        useWorkoutStore.getState().skipSection();
        useWorkoutStore.getState().recordCompletedSessionWorkoutNode(laterWorkoutId);
        expect(useWorkoutStore.getState().completedSessionWorkoutNodeIds).toEqual([]);
    });

    it('awards progression once when one elapsed update crosses the full session', () => {
        const sessionId = createTwoWorkoutSession();
        for (const node of workoutNodes()) {
            useWorkoutStore.getState().updateWorkoutNode(node.id, {
                sets: '1', reps: '1', seconds: '1', rest: '1', myoReps: '1', myoWorkSecs: '1',
            }, node.name, node.notes);
        }
        const rest = useWorkoutStore.getState().editingSessionDraft!.nodes.find((node) => node.type === 'rest')!;
        useWorkoutStore.getState().updateRestNode(rest.id, '1', rest.name);
        useWorkoutStore.getState().saveSessionDraft();
        useWorkoutStore.getState().startSession(sessionId);

        useWorkoutStore.getState().applyTimerElapsed(8);

        expect(useWorkoutStore.getState().sessionStatus).toBe('finished');
        expect(workoutNodes().map((node) => node.completedSessionsSinceProgression)).toEqual([1, 1]);
    });

    it('resets only progression-relevant edits while preserving name-only and no-op edits', () => {
        createTwoWorkoutSession();
        const [first, second] = workoutNodes();
        useWorkoutStore.setState((state) => ({
            editingSessionDraft: state.editingSessionDraft && {
                ...state.editingSessionDraft,
                nodes: state.editingSessionDraft.nodes.map((node) => node.type === 'workout'
                    ? { ...node, completedSessionsSinceProgression: 3 }
                    : node),
            },
        }));

        let store = useWorkoutStore.getState();
        store.updateWorkoutNode(first.id, first.config, 'Renamed only', first.notes);
        expect(workoutNodes().map((node) => node.completedSessionsSinceProgression)).toEqual([3, 3]);

        const currentFirst = workoutNodes()[0];
        store = useWorkoutStore.getState();
        store.updateWorkoutNode(currentFirst.id, { ...currentFirst.config, reps: '16' }, currentFirst.name, currentFirst.notes);
        expect(workoutNodes().map((node) => node.completedSessionsSinceProgression)).toEqual([0, 3]);

        const currentSecond = workoutNodes()[1];
        useWorkoutStore.getState().updateWorkoutNode(currentSecond.id, currentSecond.config, currentSecond.name, '70kg');
        expect(workoutNodes().map((node) => node.completedSessionsSinceProgression)).toEqual([0, 0]);
        expect(second.id).toBe(currentSecond.id);
    });

    it('creates duplicates with new identities and fresh counters', () => {
        const sessionId = createTwoWorkoutSession();
        useWorkoutStore.setState((state) => ({
            savedSessions: state.savedSessions.map((session) => ({
                ...session,
                nodes: session.nodes.map((node) => node.type === 'workout'
                    ? { ...node, completedSessionsSinceProgression: 4 }
                    : node),
            })),
        }));

        const result = useWorkoutStore.getState().duplicateSession(sessionId, 'Progression copy');
        const copy = useWorkoutStore.getState().savedSessions.find((session) => session.id === result.id)!;
        const original = useWorkoutStore.getState().savedSessions.find((session) => session.id === sessionId)!;
        expect(copy.id).not.toBe(original.id);
        expect(copy.nodes.map((node) => node.id)).not.toEqual(original.nodes.map((node) => node.id));
        expect(copy.nodes.filter((node) => node.type === 'workout').map((node) => node.completedSessionsSinceProgression)).toEqual([0, 0]);
    });

    it('invalidates run credit when the open draft workout changes and preserves its reset', () => {
        const sessionId = createTwoWorkoutSession();
        useWorkoutStore.setState((state) => ({
            savedSessions: state.savedSessions.map((session) => ({
                ...session,
                nodes: session.nodes.map((node) => node.type === 'workout'
                    ? { ...node, completedSessionsSinceProgression: 2 }
                    : node),
            })),
            editingSessionDraft: state.editingSessionDraft && {
                ...state.editingSessionDraft,
                nodes: state.editingSessionDraft.nodes.map((node) => node.type === 'workout'
                    ? { ...node, completedSessionsSinceProgression: 2 }
                    : node),
            },
        }));
        useWorkoutStore.getState().startSession(sessionId);
        useWorkoutStore.getState().skipSection();
        completeCurrentWorkoutNaturally();
        useWorkoutStore.getState().advanceSessionNode();

        const firstDraftWorkout = workoutNodes()[0];
        useWorkoutStore.getState().updateWorkoutNode(
            firstDraftWorkout.id,
            { ...firstDraftWorkout.config, reps: '20' },
            firstDraftWorkout.name,
            firstDraftWorkout.notes,
        );
        completeCurrentWorkoutNaturally();

        expect(workoutNodes().map((node) => node.completedSessionsSinceProgression)).toEqual([0, 2]);
        const savedCounts = useWorkoutStore.getState().savedSessions[0].nodes
            .filter((node): node is WorkoutSessionNode => node.type === 'workout')
            .map((node) => node.completedSessionsSinceProgression);
        expect(savedCounts).toEqual([2, 2]);
    });

    it('keeps run credit eligible when the draft is only reordered', () => {
        const sessionId = createTwoWorkoutSession();
        useWorkoutStore.getState().startSession(sessionId);
        useWorkoutStore.getState().skipSection();
        const secondWorkoutId = workoutNodes()[1].id;
        useWorkoutStore.getState().moveSessionNodeToIndex(secondWorkoutId, 0);
        completeCurrentWorkoutNaturally();
        useWorkoutStore.getState().advanceSessionNode();
        completeCurrentWorkoutNaturally();
        expect(workoutNodes().map((node) => node.completedSessionsSinceProgression)).toEqual([1, 1]);
    });

    it('saturates safe counters and clears transient completion state on deletion', () => {
        const sessionId = createTwoWorkoutSession();
        useWorkoutStore.setState((state) => ({
            savedSessions: state.savedSessions.map((session) => ({
                ...session,
                nodes: session.nodes.map((node) => node.type === 'workout'
                    ? { ...node, completedSessionsSinceProgression: Number.MAX_SAFE_INTEGER }
                    : node),
            })),
            editingSessionDraft: state.editingSessionDraft && {
                ...state.editingSessionDraft,
                nodes: state.editingSessionDraft.nodes.map((node) => node.type === 'workout'
                    ? { ...node, completedSessionsSinceProgression: Number.MAX_SAFE_INTEGER }
                    : node),
            },
        }));
        useWorkoutStore.getState().startSession(sessionId);
        useWorkoutStore.getState().skipSection();
        completeCurrentWorkoutNaturally();
        useWorkoutStore.getState().advanceSessionNode();
        completeCurrentWorkoutNaturally();
        expect(workoutNodes().every((node) => node.completedSessionsSinceProgression === Number.MAX_SAFE_INTEGER)).toBe(true);

        useWorkoutStore.getState().startSession(sessionId);
        useWorkoutStore.getState().skipSection();
        const activeNodeId = useWorkoutStore.getState().savedSessions[0].nodes[0].id;
        useWorkoutStore.getState().recordCompletedSessionWorkoutNode(activeNodeId);
        expect(useWorkoutStore.getState().completedSessionWorkoutNodeIds).toEqual([activeNodeId]);
        useWorkoutStore.getState().deleteSession(sessionId);
        expect(useWorkoutStore.getState().completedSessionWorkoutNodeIds).toEqual([]);
        expect(useWorkoutStore.getState().activeSessionProgressionSnapshot).toBeNull();
    });

    it('sanitizes the reminder threshold and resets Save As copies', () => {
        createTwoWorkoutSession();
        useWorkoutStore.getState().setSettings({ progressionReminderThreshold: 0.5 });
        expect(useWorkoutStore.getState().settings.progressionReminderThreshold).toBe(1);
        useWorkoutStore.getState().setSettings({ progressionReminderThreshold: 5.9 });
        expect(useWorkoutStore.getState().settings.progressionReminderThreshold).toBe(5);
        useWorkoutStore.getState().setSettings({ progressionReminderThreshold: 0 });
        expect(useWorkoutStore.getState().settings.progressionReminderThreshold).toBe(5);

        useWorkoutStore.setState((state) => ({
            editingSessionDraft: state.editingSessionDraft && {
                ...state.editingSessionDraft,
                nodes: state.editingSessionDraft.nodes.map((node) => node.type === 'workout'
                    ? { ...node, completedSessionsSinceProgression: 4 }
                    : node),
            },
        }));
        const originalId = useWorkoutStore.getState().editingSessionDraft!.id;
        const result = useWorkoutStore.getState().saveSessionDraftAs('Save as copy');
        const copy = useWorkoutStore.getState().savedSessions.find((session) => session.id === result.id)!;
        expect(copy.id).not.toBe(originalId);
        expect(copy.nodes.filter((node) => node.type === 'workout').map((node) => node.completedSessionsSinceProgression)).toEqual([0, 0]);
    });
});
