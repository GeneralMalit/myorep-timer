import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import SessionBuilder from '@/components/SessionBuilder';
import { useWorkoutStore } from '@/store/useWorkoutStore';

const baseWorkout = {
    id: 'w-1',
    name: 'Push Day',
    sets: '2',
    reps: '10',
    seconds: '3',
    rest: '20',
    myoReps: '4',
    myoWorkSecs: '2',
    timesUsed: 2,
    lastUsedAt: '2026-03-01T00:00:00.000Z',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
};

const resetStore = () => {
    const store = useWorkoutStore.getState();

    useWorkoutStore.setState({
        settings: {
            ...store.settings,
            prepTime: 5,
        },
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
        savedWorkouts: [baseWorkout],
        selectedSavedWorkoutId: baseWorkout.id,
        savedSessions: [],
        selectedSavedSessionId: null,
        setupMode: 'session',
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
    });

    store.setWorkoutConfig({
        sets: '2',
        reps: '10',
        seconds: '3',
        rest: '20',
        myoReps: '4',
        myoWorkSecs: '2',
    });
};

describe('SessionBuilder', () => {
    beforeEach(() => {
        resetStore();
    });

    it('covers empty builder actions, draft creation, and invalid save/start branches', () => {
        render(<SessionBuilder />);

        expect(screen.getByText(/Create a session, then edit nodes directly in the canvas/i)).toBeInTheDocument();
        expect(screen.getByText(/Empty canvas/i)).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /start/i }));
        let dialog = screen.getByRole('dialog', { name: /no session is ready to start/i });
        expect(within(dialog).getByText(/Create or load a session first/i)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: /got it/i }));

        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
        dialog = screen.getByRole('dialog', { name: /could not save this session/i });
        expect(within(dialog).getByText(/No session draft is open/i)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: /got it/i }));

        fireEvent.click(screen.getByRole('button', { name: /save as/i }));
        dialog = screen.getByRole('dialog', { name: /nothing to save yet/i });
        expect(within(dialog).getByText(/Create or load a session before saving a copy/i)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: /got it/i }));

        fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
        dialog = screen.getByRole('dialog', { name: /create a new session/i });
        expect(within(dialog).getByDisplayValue('New Session')).toBeInTheDocument();
        fireEvent.change(within(dialog).getByLabelText(/session name/i), { target: { value: 'Alpha Session' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /create session/i }));
        expect(screen.getByText(/0 nodes in the chain/i)).toBeInTheDocument();
        expect(screen.getByText('0:00')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
        dialog = screen.getByRole('dialog', { name: /could not save this session/i });
        expect(within(dialog).getByText(/Session is invalid/i)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: /got it/i }));

        fireEvent.click(screen.getByRole('button', { name: /start/i }));
        dialog = screen.getByRole('dialog', { name: /could not start this session/i });
        expect(within(dialog).getByText(/Session is invalid/i)).toBeInTheDocument();
    });

    it('warns when a session contains legacy workout nodes', () => {
        useWorkoutStore.setState({
            editingSessionId: 'legacy-session',
            editingSessionDraft: {
                id: 'legacy-session',
                name: 'Legacy Session',
                nodes: [
                    {
                        id: 'legacy-node',
                        type: 'workout',
                        name: 'Workout 1',
                        config: {
                            sets: '2',
                            reps: '10',
                            seconds: '3',
                            rest: '20',
                            myoReps: '4',
                            myoWorkSecs: '2',
                        },
                        sourceWorkoutId: null,
                        createdAt: '2026-03-01T00:00:00.000Z',
                        updatedAt: '2026-03-01T00:00:00.000Z',
                    },
                ],
            },
        });

        render(<SessionBuilder />);

        expect(screen.getByRole('alert')).toHaveTextContent(/not linked to a saved workout/i);
    });

    it('shows a builder dialog error when creating a session without a name', () => {
        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
        const dialog = screen.getByRole('dialog', { name: /create a new session/i });
        fireEvent.change(within(dialog).getByLabelText(/session name/i), { target: { value: '' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /create session/i }));

        const messageDialog = screen.getByRole('dialog', { name: /could not create this session/i });
        expect(within(messageDialog).getByText(/session name is required/i)).toBeInTheDocument();
    });

    it('closes builder dialogs from the backdrop', () => {
        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
        const dialog = screen.getByRole('dialog', { name: /create a new session/i });

        fireEvent.pointerDown(dialog, { target: dialog });
        expect(screen.queryByRole('dialog', { name: /create a new session/i })).not.toBeInTheDocument();
    });

    it('auto-creates and links a saved workout when adding a workout node without one selected', () => {
        useWorkoutStore.setState({
            selectedSavedWorkoutId: null,
            savedWorkouts: [baseWorkout],
        });

        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
        const dialog = screen.getByRole('dialog', { name: /create a new session/i });
        fireEvent.change(within(dialog).getByLabelText(/session name/i), { target: { value: 'No Link Session' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /create session/i }));

        fireEvent.click(screen.getByRole('button', { name: /^workout$/i }));
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes).toHaveLength(1);
        expect(useWorkoutStore.getState().savedWorkouts).toHaveLength(2);
        const node = useWorkoutStore.getState().editingSessionDraft?.nodes[0];
        expect(node?.type).toBe('workout');
        if (node?.type === 'workout') {
            expect(node.sourceWorkoutId).toBe(useWorkoutStore.getState().savedWorkouts[1].id);
        }
    });

    it('shows an add-workout error when the current workout config is invalid', () => {
        useWorkoutStore.setState({
            selectedSavedWorkoutId: null,
            savedWorkouts: [],
            sets: '',
            reps: '',
            seconds: '',
            rest: '',
            myoReps: '',
            myoWorkSecs: '',
        });

        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
        const dialog = screen.getByRole('dialog', { name: /create a new session/i });
        fireEvent.change(within(dialog).getByLabelText(/session name/i), { target: { value: 'Broken Session' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /create session/i }));

        fireEvent.click(screen.getByRole('button', { name: /^workout$/i }));

        const errorDialog = screen.getByRole('dialog', { name: /could not add this workout node/i });
        expect(within(errorDialog).getByText(/needs a valid config before it can be added/i)).toBeInTheDocument();
    });

    it('shows a create-session error when the dialog is submitted without a valid name', () => {
        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
        const dialog = screen.getByRole('dialog', { name: /create a new session/i });
        fireEvent.change(within(dialog).getByLabelText(/session name/i), { target: { value: '' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /create session/i }));

        const errorDialog = screen.getByRole('dialog', { name: /could not create this session/i });
        expect(within(errorDialog).getByText(/session name is required/i)).toBeInTheDocument();
    });

    it('shows linked workout details when a node is already linked', () => {
        useWorkoutStore.setState({
            setupMode: 'session',
            editingSessionNodeId: 'linked-node',
            editingSessionDraft: {
                id: 'session-linked',
                name: 'Linked Session',
                nodes: [
                    {
                        id: 'linked-node',
                        type: 'workout',
                        name: 'Workout 1',
                        config: {
                            sets: '2',
                            reps: '10',
                            seconds: '3',
                            rest: '20',
                            myoReps: '4',
                            myoWorkSecs: '2',
                        },
                        sourceWorkoutId: baseWorkout.id,
                        createdAt: '2026-03-01T00:00:00.000Z',
                        updatedAt: '2026-03-01T00:00:00.000Z',
                    },
                ],
                timesUsed: 0,
                lastUsedAt: null,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
            },
        });

        render(<SessionBuilder />);

        const dialog = screen.getByRole('dialog', { name: /workout node editor/i });
        expect(within(dialog).getByText(/linked workout/i)).toBeInTheDocument();
        expect(within(dialog).getAllByText(baseWorkout.name).length).toBeGreaterThan(0);
        expect(within(dialog).getByRole('button', { name: /save workout/i })).toBeInTheDocument();
    });

    it('shows a missing-link warning when a node points to a deleted workout', () => {
        useWorkoutStore.setState({
            setupMode: 'session',
            editingSessionNodeId: 'missing-link-node',
            editingSessionDraft: {
                id: 'session-missing-link',
                name: 'Missing Link Session',
                nodes: [
                    {
                        id: 'missing-link-node',
                        type: 'workout',
                        name: 'Workout 1',
                        config: {
                            sets: '2',
                            reps: '10',
                            seconds: '3',
                            rest: '20',
                            myoReps: '4',
                            myoWorkSecs: '2',
                        },
                        sourceWorkoutId: 'deleted-workout',
                        createdAt: '2026-03-01T00:00:00.000Z',
                        updatedAt: '2026-03-01T00:00:00.000Z',
                    },
                ],
                timesUsed: 0,
                lastUsedAt: null,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
            },
        });

        render(<SessionBuilder />);

        expect(screen.getByText(/missing workout link/i)).toBeInTheDocument();
        expect(screen.getByText(/no longer in your library/i)).toBeInTheDocument();
    });

    it('shows a clear message when workout config is invalid for a new session node', () => {
        useWorkoutStore.setState({
            selectedSavedWorkoutId: null,
            savedWorkouts: [],
        });
        useWorkoutStore.getState().setWorkoutConfig({
            sets: '',
            reps: '',
            seconds: '',
            rest: '',
            myoReps: '',
            myoWorkSecs: '',
        });

        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
        const dialog = screen.getByRole('dialog', { name: /create a new session/i });
        fireEvent.change(within(dialog).getByLabelText(/session name/i), { target: { value: 'Broken Session' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /create session/i }));

        fireEvent.click(screen.getByRole('button', { name: /^workout$/i }));
        const messageDialog = screen.getByRole('dialog', { name: /could not add this workout node/i });
        expect(within(messageDialog).getByText(/workout needs a valid config/i)).toBeInTheDocument();
    });

    it('builds, edits, saves, and starts a valid session', () => {
        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
        const createDialog = screen.getByRole('dialog', { name: /create a new session/i });
        fireEvent.change(within(createDialog).getByLabelText(/session name/i), { target: { value: 'Leg Session' } });
        fireEvent.click(within(createDialog).getByRole('button', { name: /create session/i }));
        fireEvent.click(screen.getByRole('button', { name: /^Workout$/i }));

        expect(screen.getByText(/1 node in the chain/i)).toBeInTheDocument();
        expect(screen.getByText('Workout 1')).toBeInTheDocument();
        expect(screen.getByText('10 @ 3s + (1 * 4 @ 2s)')).toBeInTheDocument();
        expect(screen.getByText('1:03')).toBeInTheDocument();
        const initialWorkoutNode = useWorkoutStore.getState().editingSessionDraft?.nodes.find((node) => node.type === 'workout');
        if (initialWorkoutNode?.type === 'workout') {
            expect(initialWorkoutNode.sourceWorkoutId).toBe(baseWorkout.id);
        }

        fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
        expect(useWorkoutStore.getState().savedSessions).toHaveLength(1);

        fireEvent.click(screen.getByRole('button', { name: /edit workout 1/i }));

        const workoutDialog = screen.getByRole('dialog', { name: /workout node editor/i });
        const workoutNameInput = within(workoutDialog).getByLabelText(/^name$/i);
        fireEvent.change(workoutNameInput, { target: { value: '' } });
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes.find((node) => node.type === 'workout')?.name).toBe('');
        fireEvent.change(workoutNameInput, { target: { value: '  Push Day  ' } });
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes.find((node) => node.type === 'workout')?.name).toBe('  Push Day  ');

        const workoutInputs = within(workoutDialog).getAllByRole('spinbutton');
        fireEvent.change(workoutInputs[0], { target: { value: '0' } });

        const draftAfterWorkoutEdit = useWorkoutStore.getState().editingSessionDraft;
        const workoutNode = draftAfterWorkoutEdit?.nodes.find((node) => node.type === 'workout');
        if (workoutNode?.type === 'workout') {
            expect(workoutNode.config.sets).toBe('1');
        }
        expect(workoutInputs[3]).toBeDisabled();
        expect(workoutInputs[4]).toBeDisabled();
        expect(workoutInputs[5]).toBeDisabled();

        fireEvent.click(within(workoutDialog).getByRole('button', { name: /import workout/i }));

        const draftAfterImport = useWorkoutStore.getState().editingSessionDraft;
        const importedWorkoutNode = draftAfterImport?.nodes.find((node) => node.type === 'workout');
        if (importedWorkoutNode?.type === 'workout') {
            expect(importedWorkoutNode.config.sets).toBe(baseWorkout.sets);
            expect(importedWorkoutNode.config.reps).toBe(baseWorkout.reps);
            expect(importedWorkoutNode.sourceWorkoutId).toBe(baseWorkout.id);
        }

        const workoutTargetSelect = within(workoutDialog).getByLabelText(/workout target/i) as HTMLSelectElement;

        fireEvent.change(workoutNameInput, { target: { value: 'Push Day Updated' } });
        fireEvent.click(within(workoutDialog).getByRole('button', { name: /save workout/i }));

        expect(useWorkoutStore.getState().savedWorkouts).toHaveLength(1);
        expect(useWorkoutStore.getState().savedWorkouts[0].name).toBe('Push Day Updated');
        expect(within(workoutDialog).getByRole('status')).toHaveTextContent(/updated and linked/i);

        fireEvent.change(workoutTargetSelect, { target: { value: '__new__' } });
        fireEvent.change(workoutNameInput, { target: { value: 'Push Day Copy' } });
        fireEvent.click(within(workoutDialog).getByRole('button', { name: /save workout/i }));

        expect(useWorkoutStore.getState().savedWorkouts).toHaveLength(2);
        expect(useWorkoutStore.getState().savedWorkouts[1].name).toBe('Push Day Copy');
        expect(within(workoutDialog).getByRole('status')).toHaveTextContent(/saved and linked/i);

        fireEvent.click(workoutDialog);
        expect(screen.getByRole('dialog', { name: /workout node editor/i })).toBeInTheDocument();

        fireEvent.click(within(workoutDialog).getByRole('button', { name: /close node editor/i }));
        expect(screen.queryByRole('dialog', { name: /workout node editor/i })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^Rest$/i }));
        expect(screen.getByText(/2 nodes in the chain/i)).toBeInTheDocument();
        expect(screen.getByText('Rest 1')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /edit rest 1/i }));
        const restDialog = screen.getByRole('dialog', { name: /rest node editor/i });
        fireEvent.change(within(restDialog).getByRole('spinbutton'), { target: { value: '45' } });

        const restNode = useWorkoutStore.getState().editingSessionDraft?.nodes.find((node) => node.type === 'rest');
        if (restNode?.type === 'rest') {
            expect(restNode.seconds).toBe('45');
        }

        fireEvent.click(within(restDialog).getByRole('button', { name: /close node editor/i }));

        fireEvent.click(screen.getByRole('button', { name: /^Save As$/i }));
        const saveAsDialog = screen.getByRole('dialog', { name: /save this session as a copy/i });
        expect(within(saveAsDialog).getByDisplayValue('Leg Session')).toBeInTheDocument();
        fireEvent.change(within(saveAsDialog).getByLabelText(/session name/i), { target: { value: 'Leg Session Copy' } });
        fireEvent.click(within(saveAsDialog).getByRole('button', { name: /save copy/i }));
        expect(useWorkoutStore.getState().savedSessions).toHaveLength(2);

        fireEvent.click(screen.getByRole('button', { name: /start/i }));
        expect(useWorkoutStore.getState().appPhase).toBe('timer');
        expect(useWorkoutStore.getState().timerStatus).toBe('Preparing');
        expect(useWorkoutStore.getState().timeLeft).toBe(useWorkoutStore.getState().settings.prepTime);
        expect(useWorkoutStore.getState().isRunningSession).toBe(true);

        useWorkoutStore.getState().advanceCycle();
        expect(useWorkoutStore.getState().timerStatus).toBe('Main Set');
        expect(useWorkoutStore.getState().timeLeft).toBe(3);
    });

    it('warns about legacy workout nodes and relinks them when saved', () => {
        useWorkoutStore.setState({
            setupMode: 'session',
            editingSessionNodeId: 'legacy-node',
            editingSessionDraft: {
                id: 'session-legacy',
                name: 'Legacy Session',
                nodes: [
                    {
                        id: 'legacy-node',
                        type: 'workout',
                        name: 'Legacy Node',
                        config: {
                            sets: '2',
                            reps: '10',
                            seconds: '3',
                            rest: '20',
                            myoReps: '4',
                            myoWorkSecs: '2',
                        },
                        sourceWorkoutId: null,
                        createdAt: '2026-03-01T00:00:00.000Z',
                        updatedAt: '2026-03-01T00:00:00.000Z',
                    },
                ],
                timesUsed: 0,
                lastUsedAt: null,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
            },
        });

        render(<SessionBuilder />);

        expect(screen.getByText(/legacy workout node/i)).toBeInTheDocument();
        expect(screen.getByText(/old node/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /export workout/i })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /export workout/i }));

        const legacyNode = useWorkoutStore.getState().editingSessionDraft?.nodes[0];
        expect(legacyNode?.type).toBe('workout');
        if (legacyNode?.type === 'workout') {
            expect(legacyNode.sourceWorkoutId).toBeTruthy();
        }
        expect(screen.getByRole('status')).toHaveTextContent(/saved and linked/i);
    });

    it('reorders nodes when dropping a dragged node onto a middle node', () => {
        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
        fireEvent.change(screen.getByLabelText(/session name/i), { target: { value: 'Drag Session' } });
        fireEvent.click(screen.getByRole('button', { name: /create session/i }));
        fireEvent.click(screen.getByRole('button', { name: /^Workout$/i }));
        fireEvent.click(screen.getByRole('button', { name: /^Rest$/i }));
        fireEvent.click(screen.getByRole('button', { name: /^Workout$/i }));

        const workoutOne = screen.getByText('Workout 1').closest('[draggable="true"]') as HTMLElement;
        const workoutTwo = screen.getByText('Workout 2').closest('[draggable="true"]') as HTMLElement;
        expect(workoutOne).toBeTruthy();
        expect(workoutTwo).toBeTruthy();

        const dataTransfer = {
            data: {} as Record<string, string>,
            dropEffect: 'move',
            effectAllowed: 'move',
            files: [],
            items: [],
            types: [],
            setData(format: string, value: string) {
                this.data[format] = value;
            },
            getData(format: string) {
                return this.data[format] ?? '';
            },
            clearData() {
                this.data = {};
            },
            setDragImage() {},
        } as unknown as DataTransfer;

        fireEvent.dragStart(workoutOne, { dataTransfer });
        fireEvent.dragOver(workoutTwo, { dataTransfer });
        fireEvent.drop(workoutTwo, { dataTransfer });

        expect(useWorkoutStore.getState().editingSessionDraft?.nodes.map((node) => node.name)).toEqual([
            'Rest 1',
            'Workout 1',
            'Workout 2',
        ]);
    });

    it('supports touch-friendly node movement controls', () => {
        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
        fireEvent.change(screen.getByLabelText(/session name/i), { target: { value: 'Touch Session' } });
        fireEvent.click(screen.getByRole('button', { name: /create session/i }));
        fireEvent.click(screen.getByRole('button', { name: /^Workout$/i }));
        fireEvent.click(screen.getByRole('button', { name: /^Rest$/i }));
        fireEvent.click(screen.getByRole('button', { name: /^Workout$/i }));

        fireEvent.click(screen.getByRole('button', { name: /move rest 1 left/i }));
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes.map((node) => node.name)).toEqual([
            'Rest 1',
            'Workout 1',
            'Workout 2',
        ]);

        fireEvent.click(screen.getByRole('button', { name: /move rest 1 right/i }));
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes.map((node) => node.name)).toEqual([
            'Workout 1',
            'Rest 1',
            'Workout 2',
        ]);
    });
});
