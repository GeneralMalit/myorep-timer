import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import SessionBuilder from '@/components/SessionBuilder';
import { useWorkoutStore } from '@/store/useWorkoutStore';

const baseWorkout = {
    id: 'w-1',
    name: 'Push Day',
    sets: '3',
    reps: '12',
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
        vi.restoreAllMocks();
    });

    it('covers empty builder actions, draft creation, and invalid save/start branches', () => {
        const promptSpy = vi.spyOn(window, 'prompt')
            .mockReturnValueOnce(null)
            .mockReturnValueOnce('Alpha Session');
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });

        render(<SessionBuilder />);

        expect(screen.getByText(/Create a session, then edit nodes directly in the canvas/i)).toBeInTheDocument();
        expect(screen.getByText(/Empty canvas/i)).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /start/i }));
        expect(alertSpy).toHaveBeenCalledWith('Create or load a session first.');

        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
        expect(alertSpy).toHaveBeenCalledWith('No session draft is open.');

        fireEvent.click(screen.getByRole('button', { name: /save as/i }));
        expect(promptSpy).toHaveBeenCalledWith('Save session as:', 'New Session');

        fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
        expect(promptSpy).toHaveBeenCalledWith('Session name:', 'New Session');
        expect(screen.getByText(/0 nodes in the chain/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
        expect(alertSpy).toHaveBeenCalledWith('Session is invalid.');

        fireEvent.click(screen.getByRole('button', { name: /start/i }));
        expect(alertSpy).toHaveBeenCalledWith('Session is invalid.');
    });

    it('builds, edits, saves, and starts a valid session', () => {
        const promptSpy = vi.spyOn(window, 'prompt')
            .mockReturnValueOnce('Leg Session')
            .mockReturnValueOnce('Leg Session Copy');
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });

        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
        fireEvent.click(screen.getByRole('button', { name: /^Workout$/i }));

        expect(screen.getByText(/1 node in the chain/i)).toBeInTheDocument();
        expect(screen.getByText('Workout 1')).toBeInTheDocument();
        expect(screen.getByText('10 @ 3s + (1 * 4 @ 2s)')).toBeInTheDocument();

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
        expect(within(workoutDialog).getByRole('status')).toHaveTextContent(/updated in your library/i);

        fireEvent.change(workoutTargetSelect, { target: { value: '__new__' } });
        fireEvent.change(workoutNameInput, { target: { value: 'Push Day Copy' } });
        fireEvent.click(within(workoutDialog).getByRole('button', { name: /save workout/i }));

        expect(useWorkoutStore.getState().savedWorkouts).toHaveLength(2);
        expect(useWorkoutStore.getState().savedWorkouts[1].name).toBe('Push Day Copy');
        expect(within(workoutDialog).getByRole('status')).toHaveTextContent(/saved to your library/i);

        fireEvent.click(workoutDialog);
        expect(screen.getByRole('dialog', { name: /workout node editor/i })).toBeInTheDocument();

        fireEvent.click(within(workoutDialog).getByRole('button', { name: /close node editor/i }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

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
        expect(promptSpy).toHaveBeenLastCalledWith('Save session as:', 'Leg Session');
        expect(useWorkoutStore.getState().savedSessions).toHaveLength(2);

        fireEvent.click(screen.getByRole('button', { name: /start/i }));
        expect(useWorkoutStore.getState().appPhase).toBe('timer');
        expect(useWorkoutStore.getState().timerStatus).toBe('Main Set');
        expect(useWorkoutStore.getState().timeLeft).toBe(3);
        expect(useWorkoutStore.getState().isRunningSession).toBe(true);
        expect(alertSpy).not.toHaveBeenCalled();
    });

    it('reorders nodes when dropping a dragged node onto a middle node', () => {
        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
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
});
