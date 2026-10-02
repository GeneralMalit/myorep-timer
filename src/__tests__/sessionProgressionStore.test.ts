import { beforeEach, describe, expect, it } from 'vitest';
import { useSyncStore } from '@/store/useSyncStore';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import type { SavedSession, WorkoutSessionNode } from '@/types/savedSessions';

const singleCycleConfig = {
    sets: '1',
    reps: '1',
    seconds: '1',
    rest: '1',
    myoReps: '1',
    myoWorkSecs: '1',
};

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

const createSharedWorkout = (name = 'Shared Workout', notes = 'Previous 60kg'): string => {
    const result = useWorkoutStore.getState().saveWorkoutFromConfig(
        name,
        singleCycleConfig,
        null,
        notes,
    );
    expect(result.ok).toBe(true);
    return result.id!;
};

const createSessionWithLinkedBlocks = (
    name: string,
    workoutId: string,
    linkedBlockCount: number,
    includeUnlinkedBlock = false,
): string => {
    const store = useWorkoutStore.getState();
    const result = store.createSession(name);
    for (let index = 0; index < linkedBlockCount; index += 1) {
        useWorkoutStore.getState().addWorkoutNodeFromSavedWorkout(workoutId);
    }
    if (includeUnlinkedBlock) {
        useWorkoutStore.getState().addDefaultWorkoutNode();
    }
    useWorkoutStore.getState().saveSessionDraft();
    return result.id!;
};

const setSharedProgressionCount = (workoutId: string, count: number): void => {
    useWorkoutStore.setState((state) => {
        const updateNode = (node: SavedSession['nodes'][number]) => (
            node.type === 'workout' && node.sourceWorkoutId === workoutId
                ? { ...node, completedSessionsSinceProgression: count }
                : node
        );
        return {
            savedWorkouts: state.savedWorkouts.map((workout) => (
                workout.id === workoutId
                    ? { ...workout, completedSessionsSinceProgression: count }
                    : workout
            )),
            savedSessions: state.savedSessions.map((session) => ({
                ...session,
                nodes: session.nodes.map(updateNode),
            })),
            editingSessionDraft: state.editingSessionDraft
                ? {
                    ...state.editingSessionDraft,
                    nodes: state.editingSessionDraft.nodes.map(updateNode),
                }
                : null,
        };
    });
};

describe('session workout progression tracking', () => {
    beforeEach(() => {
        localStorage.clear();
        useSyncStore.getState().setCurrentUser(null);
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
        expect(useWorkoutStore.getState().activeSessionRunSnapshot).toBeNull();
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

    it('commits linked edits on Save and queues the source plus every affected saved session', () => {
        const workoutId = createSharedWorkout();
        const firstSessionId = createSessionWithLinkedBlocks('Linked first', workoutId, 2);
        const secondSessionId = createSessionWithLinkedBlocks('Linked second', workoutId, 1, true);
        const secondSession = useWorkoutStore.getState().savedSessions.find((session) => session.id === secondSessionId)!;
        const unlinkedNode = secondSession.nodes.find(
            (node): node is WorkoutSessionNode => node.type === 'workout' && node.sourceWorkoutId === null,
        )!;
        useWorkoutStore.getState().loadSessionForEditing(secondSessionId);
        useWorkoutStore.getState().updateWorkoutNode(
            unlinkedNode.id,
            { ...unlinkedNode.config, reps: '21' },
            unlinkedNode.name,
            'Session-only note',
        );
        useWorkoutStore.getState().saveSessionDraft();
        setSharedProgressionCount(workoutId, 4);

        const before = useWorkoutStore.getState();
        const originalFirstSession = before.savedSessions.find((session) => session.id === firstSessionId)!;
        const originalFirstNodes = originalFirstSession.nodes.filter(
            (node): node is WorkoutSessionNode => node.type === 'workout',
        );
        const originalSecondSession = before.savedSessions.find((session) => session.id === secondSessionId)!;
        const originalSecondLinked = originalSecondSession.nodes.find(
            (node): node is WorkoutSessionNode => node.type === 'workout' && node.sourceWorkoutId === workoutId,
        )!;
        const originalUnlinked = originalSecondSession.nodes.find(
            (node): node is WorkoutSessionNode => node.type === 'workout' && node.sourceWorkoutId === null,
        )!;
        const linkedWorkout = before.savedWorkouts.find((workout) => workout.id === workoutId)!;

        useSyncStore.getState().setCurrentUser('linked-workout-sync-test');
        useSyncStore.setState({ syncEnabled: true, queuedOperations: [] });
        useWorkoutStore.getState().loadSessionForEditing(firstSessionId);
        const editedNode = workoutNodes()[0];
        useWorkoutStore.getState().updateWorkoutNode(
            editedNode.id,
            { ...editedNode.config, reps: '2' },
            'Shared Renamed',
            'Updated reminder',
        );

        expect(useWorkoutStore.getState().savedWorkouts.find((workout) => workout.id === workoutId)).toMatchObject({
            reps: linkedWorkout.reps,
            notes: linkedWorkout.notes,
            completedSessionsSinceProgression: 4,
        });
        expect(useWorkoutStore.getState().savedSessions.find((session) => session.id === secondSessionId)!.nodes).toEqual(
            originalSecondSession.nodes,
        );

        useWorkoutStore.getState().saveSessionDraft();

        const saved = useWorkoutStore.getState();
        const updatedWorkout = saved.savedWorkouts.find((workout) => workout.id === workoutId)!;
        expect(updatedWorkout).toMatchObject({
            name: 'Shared Renamed',
            reps: '2',
            notes: 'Updated reminder',
            completedSessionsSinceProgression: 0,
        });
        for (const session of saved.savedSessions) {
            const linkedNodes = session.nodes.filter(
                (node): node is WorkoutSessionNode => node.type === 'workout' && node.sourceWorkoutId === workoutId,
            );
            for (const node of linkedNodes) {
                expect(node).toMatchObject({
                    name: 'Shared Renamed',
                    config: { reps: '2' },
                    notes: 'Updated reminder',
                    completedSessionsSinceProgression: 0,
                });
            }
        }
        const savedFirstNodes = saved.savedSessions.find((session) => session.id === firstSessionId)!.nodes
            .filter((node): node is WorkoutSessionNode => node.type === 'workout');
        expect(savedFirstNodes.map((node) => node.id)).toEqual(originalFirstNodes.map((node) => node.id));
        expect(savedFirstNodes.map((node) => node.createdAt)).toEqual(originalFirstNodes.map((node) => node.createdAt));
        const savedSecondLinked = saved.savedSessions.find((session) => session.id === secondSessionId)!.nodes.find(
            (node): node is WorkoutSessionNode => node.type === 'workout' && node.sourceWorkoutId === workoutId,
        )!;
        expect(savedSecondLinked.id).toBe(originalSecondLinked.id);
        expect(savedSecondLinked).toMatchObject({
            name: 'Shared Renamed',
            config: { reps: '2' },
            notes: 'Updated reminder',
            completedSessionsSinceProgression: 0,
        });
        const savedUnlinked = saved.savedSessions.find((session) => session.id === secondSessionId)!.nodes.find(
            (node): node is WorkoutSessionNode => node.type === 'workout' && node.sourceWorkoutId === null,
        )!;
        expect(savedUnlinked).toMatchObject({
            id: originalUnlinked.id,
            config: originalUnlinked.config,
            notes: 'Session-only note',
        });

        const queuedEntities = new Set(
            useSyncStore.getState().queuedOperations.map((item) => `${item.entityType}:${item.localId}`),
        );
        expect(queuedEntities).toEqual(new Set([
            `workout:${workoutId}`,
            `session:${firstSessionId}`,
            `session:${secondSessionId}`,
        ]));
    });

    it('commits linked edits on Save As while retaining unlinked history only in the original', () => {
        const workoutId = createSharedWorkout();
        const originalSessionId = createSessionWithLinkedBlocks('Save As source', workoutId, 1, true);
        setSharedProgressionCount(workoutId, 5);
        useWorkoutStore.setState((state) => ({
            savedSessions: state.savedSessions.map((session) => session.id === originalSessionId
                ? {
                    ...session,
                    nodes: session.nodes.map((node) => node.type === 'workout' && node.sourceWorkoutId === null
                        ? { ...node, completedSessionsSinceProgression: 3 }
                        : node),
                }
                : session),
            editingSessionDraft: state.editingSessionDraft?.id === originalSessionId
                ? {
                    ...state.editingSessionDraft,
                    nodes: state.editingSessionDraft.nodes.map((node) => node.type === 'workout' && node.sourceWorkoutId === null
                        ? { ...node, completedSessionsSinceProgression: 3 }
                        : node),
                }
                : state.editingSessionDraft,
        }));
        const original = useWorkoutStore.getState().savedSessions.find((session) => session.id === originalSessionId)!;
        const originalLinkedNode = original.nodes.find(
            (node): node is WorkoutSessionNode => node.type === 'workout' && node.sourceWorkoutId === workoutId,
        )!;
        const originalUnlinkedNode = original.nodes.find(
            (node): node is WorkoutSessionNode => node.type === 'workout' && node.sourceWorkoutId === null,
        )!;

        useWorkoutStore.getState().loadSessionForEditing(originalSessionId);
        useWorkoutStore.getState().updateWorkoutNode(
            originalLinkedNode.id,
            { ...originalLinkedNode.config, reps: '2' },
            originalLinkedNode.name,
            'Copied note',
        );
        const saveAs = useWorkoutStore.getState().saveSessionDraftAs('Save As copy');
        const saved = useWorkoutStore.getState();
        const source = saved.savedWorkouts.find((workout) => workout.id === workoutId)!;
        const copy = saved.savedSessions.find((session) => session.id === saveAs.id)!;
        const originalAfterSave = saved.savedSessions.find((session) => session.id === originalSessionId)!;
        const copiedLinked = copy.nodes.find(
            (node): node is WorkoutSessionNode => node.type === 'workout' && node.sourceWorkoutId === workoutId,
        )!;
        const copiedUnlinked = copy.nodes.find(
            (node): node is WorkoutSessionNode => node.type === 'workout' && node.sourceWorkoutId === null,
        )!;
        const originalUnlinkedAfterSave = originalAfterSave.nodes.find(
            (node): node is WorkoutSessionNode => node.type === 'workout' && node.sourceWorkoutId === null,
        )!;

        expect(source).toMatchObject({
            reps: '2',
            notes: 'Copied note',
            completedSessionsSinceProgression: 0,
        });
        expect(originalAfterSave.nodes.find((node) => node.id === originalLinkedNode.id)).toMatchObject({
            config: { reps: '2' },
            notes: 'Copied note',
            completedSessionsSinceProgression: 0,
        });
        expect(copiedLinked).toMatchObject({
            config: { reps: '2' },
            notes: 'Copied note',
            completedSessionsSinceProgression: 0,
        });
        expect(copiedLinked.id).not.toBe(originalLinkedNode.id);
        expect(copy.id).toBe(saved.editingSessionDraft?.id);
        expect(originalUnlinkedAfterSave).toMatchObject({
            id: originalUnlinkedNode.id,
            completedSessionsSinceProgression: 3,
        });
        expect(copiedUnlinked.completedSessionsSinceProgression).toBe(0);
    });

    it('increments a shared linked source once for duplicate blocks and projects it without touching unlinked history', () => {
        const workoutId = createSharedWorkout('Shared Workout', '');
        const completedSessionId = createSessionWithLinkedBlocks('Duplicate linked blocks', workoutId, 2);
        const otherSessionId = createSessionWithLinkedBlocks('Other linked session', workoutId, 1, true);
        useWorkoutStore.setState((state) => ({
            savedSessions: state.savedSessions.map((session) => session.id === otherSessionId
                ? {
                    ...session,
                    nodes: session.nodes.map((node) => node.type === 'workout' && node.sourceWorkoutId === null
                        ? { ...node, completedSessionsSinceProgression: 4 }
                        : node),
                }
                : session),
            editingSessionDraft: state.editingSessionDraft?.id === otherSessionId
                ? {
                    ...state.editingSessionDraft,
                    nodes: state.editingSessionDraft.nodes.map((node) => node.type === 'workout' && node.sourceWorkoutId === null
                        ? { ...node, completedSessionsSinceProgression: 4 }
                        : node),
                }
                : state.editingSessionDraft,
        }));

        useWorkoutStore.getState().startSession(completedSessionId);
        useWorkoutStore.getState().skipSection();
        completeCurrentWorkoutNaturally();
        completeCurrentWorkoutNaturally();

        const finished = useWorkoutStore.getState();
        expect(finished.savedWorkouts.find((workout) => workout.id === workoutId)?.completedSessionsSinceProgression).toBe(1);
        const completedLinkedCounts = finished.savedSessions.find((session) => session.id === completedSessionId)!.nodes
            .filter((node): node is WorkoutSessionNode => node.type === 'workout')
            .map((node) => node.completedSessionsSinceProgression);
        expect(completedLinkedCounts).toEqual([1, 1]);
        for (const session of finished.savedSessions) {
            const linkedNodes = session.nodes.filter(
                (node): node is WorkoutSessionNode => node.type === 'workout' && node.sourceWorkoutId === workoutId,
            );
            expect(linkedNodes.every((node) => node.completedSessionsSinceProgression === 1)).toBe(true);
        }
        const otherLinked = finished.savedSessions.find((session) => session.id === otherSessionId)!.nodes.find(
            (node): node is WorkoutSessionNode => node.type === 'workout' && node.sourceWorkoutId === workoutId,
        )!;
        expect(otherLinked.completedSessionsSinceProgression).toBe(1);
        const untouchedUnlinked = finished.savedSessions.find((session) => session.id === otherSessionId)!.nodes.find(
            (node): node is WorkoutSessionNode => node.type === 'workout' && node.sourceWorkoutId === null,
        )!;
        expect(untouchedUnlinked.completedSessionsSinceProgression).toBe(4);
    });

    it('keeps the running session snapshot intact and rejects progression after a saved linked edit', () => {
        const workoutId = createSharedWorkout();
        const sessionId = createSessionWithLinkedBlocks('In-flight linked edit', workoutId, 2);
        setSharedProgressionCount(workoutId, 3);
        useWorkoutStore.getState().startSession(sessionId);
        useWorkoutStore.getState().skipSection();
        const firstNode = workoutNodes()[0];
        const originalConfig = { ...firstNode.config };

        useWorkoutStore.getState().updateWorkoutNode(
            firstNode.id,
            { ...firstNode.config, reps: '2' },
            firstNode.name,
            'Changed while running',
        );
        useWorkoutStore.getState().saveSessionDraft();
        expect(useWorkoutStore.getState().activeSessionRunSnapshot?.nodes[0]).toMatchObject({
            type: 'workout',
            config: originalConfig,
        });

        completeCurrentWorkoutNaturally();
        expect(useWorkoutStore.getState().reps).toBe(originalConfig.reps);
        completeCurrentWorkoutNaturally();

        expect(useWorkoutStore.getState().savedWorkouts.find((workout) => workout.id === workoutId)?.completedSessionsSinceProgression).toBe(0);
        expect(useWorkoutStore.getState().sessionStatus).toBe('finished');
    });
});
