import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '@/App';
import { useWorkoutStore } from '@/store/useWorkoutStore';

vi.mock('@/utils/audioEngine', () => ({
    audioEngine: {
        init: vi.fn(),
        speak: vi.fn(),
        playTick: vi.fn(),
    },
}));

vi.mock('@/components/SettingsPanel', () => ({
    default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
        isOpen
            ? (
                <div>
                    <span>Settings Open</span>
                    <button type="button" onClick={onClose}>Close Settings</button>
                </div>
            )
            : null
    ),
}));

vi.mock('@/components/ConcentricTimer', () => ({
    default: ({ textMain, textSub }: { textMain: string; textSub: string }) => (
        <div>
            <div>{textMain}</div>
            <div>{textSub}</div>
        </div>
    ),
}));

const resetStore = () => {
    useWorkoutStore.setState({
        appPhase: 'setup',
        timerStatus: 'Ready',
        isTimerRunning: false,
        sets: '',
        reps: '',
        seconds: '',
        rest: '',
        myoReps: '',
        myoWorkSecs: '',
        showSettings: false,
        isSidebarCollapsed: false,
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
    });
};

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

describe('App', () => {
    beforeEach(() => {
        resetStore();
        vi.restoreAllMocks();
    });

    it('renders setup mode with sets min constraint and semantic version footer', () => {
        render(<App />);

        expect(screen.getByText('SYSTEM SETUP')).toBeInTheDocument();
        const cycleInput = screen.getAllByRole('spinbutton')[0] as HTMLInputElement;
        expect(cycleInput.min).toBe('1');
        expect(screen.getByText(/MYOREP v9.9.9-test/i)).toBeInTheDocument();
    });

    it('renders the session builder when setup mode is session', () => {
        useWorkoutStore.setState({
            setupMode: 'session',
            editingSessionDraft: {
                id: 'session-1',
                name: 'Session One',
                nodes: [],
                timesUsed: 0,
                lastUsedAt: null,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
            },
            savedSessions: [],
            selectedSavedSessionId: 'session-1',
        });

        render(<App />);

        expect(screen.getByText(/Build a Session/i)).toBeInTheDocument();
        expect(screen.getByText(/Saved Sessions/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /back to workout setup/i })).toBeInTheDocument();
    });

    it('lets users toggle voice guidance and open protocol intel from setup', () => {
        render(<App />);

        const voiceToggle = screen.getByRole('switch', { name: /voice guidance/i });
        expect(voiceToggle).toBeChecked();

        fireEvent.click(voiceToggle);
        expect(useWorkoutStore.getState().settings.ttsEnabled).toBe(false);

        fireEvent.click(screen.getByRole('button', { name: /protocol intel/i }));
        expect(screen.getByRole('dialog', { name: /protocol intel/i })).toBeInTheDocument();
        expect(screen.getByText(/what myo-reps actually are/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /close protocol intel/i }));
        expect(screen.queryByRole('dialog', { name: /protocol intel/i })).not.toBeInTheDocument();
    });

    it('starts workout when valid config is entered', () => {
        render(<App />);

        const inputs = screen.getAllByRole('spinbutton');
        fireEvent.change(inputs[0], { target: { value: '3' } });
        fireEvent.change(inputs[1], { target: { value: '12' } });
        fireEvent.change(inputs[2], { target: { value: '3' } });
        fireEvent.change(inputs[3], { target: { value: '20' } });
        fireEvent.change(inputs[4], { target: { value: '4' } });
        fireEvent.change(inputs[5], { target: { value: '2' } });

        fireEvent.click(screen.getByRole('button', { name: /initialize protocol/i }));

        expect(useWorkoutStore.getState().appPhase).toBe('timer');
        expect(useWorkoutStore.getState().timerStatus).toBe('Preparing');
    });

    it('renders timer branch with finished status controls', () => {
        useWorkoutStore.setState({
            appPhase: 'timer',
            timerStatus: 'Finished',
            isTimerRunning: false,
            currentSet: 1,
            currentRep: 1,
            isMainRep: true,
            isWorking: true,
            sets: '1',
            reps: '10',
            rest: '20',
            myoReps: '4',
            myoWorkSecs: '2',
            timeLeft: 0,
        });

        render(<App />);

        expect(screen.getByText(/Finished/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /new session/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /terminate/i })).toBeInTheDocument();
    });

    it('opens and closes the protocol intel modal from the sidebar link', () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: /protocol intel/i }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText(/what myo-reps actually are/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /close protocol intel/i }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('disables cluster inputs for single-cycle setup and supports save workflow errors', () => {
        vi.spyOn(window, 'prompt').mockReturnValue('Template A');
        vi.spyOn(window, 'alert').mockImplementation(() => { });

        render(<App />);

        const inputs = screen.getAllByRole('spinbutton');
        fireEvent.change(inputs[0], { target: { value: '1' } });
        fireEvent.change(inputs[1], { target: { value: '' } });

        // Rest input is disabled when set count is one.
        expect(inputs[3]).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
        expect(window.alert).toHaveBeenCalled();
    });

    it('preloads the loaded workout name when saving and updates its details', () => {
        vi.spyOn(window, 'prompt').mockReturnValue('Push Day');
        vi.spyOn(window, 'alert').mockImplementation(() => { });

        useWorkoutStore.setState({
            appPhase: 'setup',
            timerStatus: 'Ready',
            isTimerRunning: false,
            sets: '4',
            reps: '15',
            seconds: '4',
            rest: '25',
            myoReps: '5',
            myoWorkSecs: '3',
            savedWorkouts: [baseWorkout],
            selectedSavedWorkoutId: baseWorkout.id,
        });

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

        expect(window.prompt).toHaveBeenCalledWith('Name this workout template:', 'Push Day');
        expect(useWorkoutStore.getState().savedWorkouts).toHaveLength(1);
        expect(useWorkoutStore.getState().savedWorkouts[0].sets).toBe('4');
        expect(useWorkoutStore.getState().selectedSavedWorkoutId).toBe(baseWorkout.id);
    });

    it('creates a copy when using save as on a loaded workout', () => {
        vi.spyOn(window, 'prompt')
            .mockReturnValueOnce('Push Day Copy');
        vi.spyOn(window, 'alert').mockImplementation(() => { });

        useWorkoutStore.setState({
            appPhase: 'setup',
            timerStatus: 'Ready',
            isTimerRunning: false,
            sets: '4',
            reps: '15',
            seconds: '4',
            rest: '25',
            myoReps: '5',
            myoWorkSecs: '3',
            savedWorkouts: [baseWorkout],
            selectedSavedWorkoutId: baseWorkout.id,
        });

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: /^save as$/i }));

        expect(window.prompt).toHaveBeenCalledWith('Save as:', 'Push Day');
        expect(useWorkoutStore.getState().savedWorkouts).toHaveLength(2);
        expect(useWorkoutStore.getState().savedWorkouts.some((workout) => workout.name === 'Push Day Copy')).toBe(true);
        expect(useWorkoutStore.getState().selectedSavedWorkoutId).toBe(baseWorkout.id);
    });

    it('handles timer controls across pause/resume and full-screen branches', () => {
        useWorkoutStore.setState({
            appPhase: 'timer',
            timerStatus: 'Main Set',
            isTimerRunning: true,
            currentSet: 1,
            currentRep: 1,
            isMainRep: true,
            isWorking: true,
            sets: '2',
            reps: '10',
            rest: '10',
            myoReps: '4',
            myoWorkSecs: '2',
            seconds: '2',
            timeLeft: 2,
            settings: {
                ...useWorkoutStore.getState().settings,
                fullScreenMode: true,
                floatingWindow: true,
            },
        });
        Object.defineProperty(document, 'pictureInPictureElement', {
            configurable: true,
            value: null,
        });

        render(<App />);

        expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /pause/i }));
        expect(useWorkoutStore.getState().isTimerRunning).toBe(false);
        expect(screen.getByRole('button', { name: /launch pip/i })).toBeInTheDocument();
    });

    it('renders preparing, resting, and myo-rep branches', () => {
        useWorkoutStore.setState({
            appPhase: 'timer',
            timerStatus: 'Preparing',
            isTimerRunning: true,
            currentSet: 1,
            currentRep: 1,
            isMainRep: true,
            isWorking: true,
            sets: '2',
            reps: '10',
            rest: '10',
            myoReps: '4',
            myoWorkSecs: '2',
            seconds: '2',
            timeLeft: 4,
            showSettings: true,
        });
        const { rerender } = render(<App />);
        expect(screen.getByText('Get Ready')).toBeInTheDocument();
        expect(screen.getByText('Settings Open')).toBeInTheDocument();

        act(() => {
            useWorkoutStore.setState({
                timerStatus: 'Resting',
                isWorking: false,
                isTimerRunning: false,
                timeLeft: 8,
            });
        });
        rerender(<App />);
        expect(screen.getByText('Rest Period')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();

        act(() => {
            useWorkoutStore.setState({
                timerStatus: 'Myo Reps',
                isWorking: true,
                isMainRep: false,
                currentRep: 2,
                isTimerRunning: true,
                timeLeft: 2,
            });
        });
        rerender(<App />);
        expect(screen.getAllByText(/MYO REPS/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/Rep 2/i)).toBeInTheDocument();
    });

    it('shows PIP active state when picture-in-picture is already open', () => {
        useWorkoutStore.setState({
            appPhase: 'timer',
            timerStatus: 'Main Set',
            isTimerRunning: false,
            currentSet: 1,
            currentRep: 1,
            isMainRep: true,
            isWorking: true,
            sets: '1',
            reps: '10',
            rest: '10',
            myoReps: '4',
            myoWorkSecs: '2',
            seconds: '2',
            timeLeft: 3,
            settings: {
                ...useWorkoutStore.getState().settings,
                floatingWindow: true,
            },
        });
        Object.defineProperty(document, 'pictureInPictureElement', {
            configurable: true,
            value: {},
        });

        render(<App />);
        expect(screen.getByRole('button', { name: /pip active/i })).toBeInTheDocument();
    });

    it('exports and imports saved workouts through sidebar controls', async () => {
        const createUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
        const revokeUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => { });
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { });

        useWorkoutStore.setState({
            sets: '3',
            reps: '12',
            seconds: '3',
            rest: '20',
            myoReps: '4',
            myoWorkSecs: '2',
        });
        useWorkoutStore.getState().saveCurrentWorkout('Export Me');

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: /export/i }));
        expect(createUrlSpy).toHaveBeenCalled();
        expect(clickSpy).toHaveBeenCalled();
        expect(revokeUrlSpy).toHaveBeenCalled();

        const input = document.querySelector('input[type=\"file\"]') as HTMLInputElement;
        const file = new File([JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), workouts: [] })], 'backup.json', {
            type: 'application/json',
        });
        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => {
            expect(useWorkoutStore.getState().lastImportSummary).not.toBeNull();
        });
    });

    it('does not delete workout when delete confirmation is cancelled', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        useWorkoutStore.setState({
            sets: '3',
            reps: '12',
            seconds: '3',
            rest: '20',
            myoReps: '4',
            myoWorkSecs: '2',
        });
        useWorkoutStore.getState().saveCurrentWorkout('Keep Me');
        expect(useWorkoutStore.getState().savedWorkouts).toHaveLength(1);

        render(<App />);
        fireEvent.click(screen.getByTitle('Delete'));

        expect(useWorkoutStore.getState().savedWorkouts).toHaveLength(1);
    });

    it('covers save/rename cancellation and confirmed delete flow', () => {
        useWorkoutStore.setState({
            sets: '3',
            reps: '12',
            seconds: '3',
            rest: '20',
            myoReps: '4',
            myoWorkSecs: '2',
        });
        useWorkoutStore.getState().saveCurrentWorkout('Rename Me');

        const promptSpy = vi.spyOn(window, 'prompt')
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(null);
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
        fireEvent.click(screen.getByTitle('Rename'));
        fireEvent.click(screen.getByTitle('Delete'));

        expect(promptSpy).toHaveBeenCalledTimes(2);
        expect(useWorkoutStore.getState().savedWorkouts).toHaveLength(0);
    });

    it('covers rename error, sidebar toggle, and settings close callback branches', () => {
        useWorkoutStore.setState({
            sets: '3',
            reps: '12',
            seconds: '3',
            rest: '20',
            myoReps: '4',
            myoWorkSecs: '2',
            showSettings: true,
            isSidebarCollapsed: false,
        });
        useWorkoutStore.getState().saveCurrentWorkout('Workout A');
        useWorkoutStore.getState().saveCurrentWorkout('Workout B');

        vi.spyOn(window, 'prompt').mockReturnValue('Workout B');
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });

        render(<App />);

        fireEvent.click(screen.getAllByTitle('Rename')[0]);
        expect(alertSpy).toHaveBeenCalled();

        fireEvent.click(screen.getAllByRole('button')[0]); // Sidebar collapse toggle
        expect(useWorkoutStore.getState().isSidebarCollapsed).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: /close settings/i }));
        expect(useWorkoutStore.getState().showSettings).toBe(false);
    });

    it('shows alert when loading a workout fails', () => {
        useWorkoutStore.setState({
            savedWorkouts: [
                {
                    id: 'bad-load',
                    name: 'Broken',
                    sets: '3',
                    reps: '10',
                    seconds: '3',
                    rest: '20',
                    myoReps: '4',
                    myoWorkSecs: '2',
                    timesUsed: 0,
                    lastUsedAt: null,
                    createdAt: '2026-01-01T00:00:00.000Z',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                },
            ],
        });
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });
        useWorkoutStore.setState({
            loadWorkout: () => ({ ok: false, error: 'Load failed' }),
        } as unknown as Partial<ReturnType<typeof useWorkoutStore.getState>>);

        render(<App />);
        fireEvent.click(screen.getByTitle('Load'));

        expect(alertSpy).toHaveBeenCalled();
    });
});

