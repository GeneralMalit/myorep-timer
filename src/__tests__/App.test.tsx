import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '@/App';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { audioEngine } from '@/utils/audioEngine';

const concentricTimerMock = vi.fn(({ textMain, textSub }: { textMain: string; textSub: string }) => (
    <div>
        <div>{textMain}</div>
        <div>{textSub}</div>
    </div>
));

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
    default: (props: { textMain: string; textSub: string }) => concentricTimerMock(props),
}));

const resetStore = () => {
    useWorkoutStore.setState({
        appPhase: 'setup',
        timerStatus: 'Ready',
        isTimerRunning: false,
        settings: {
            activeColor: '#bb86fc',
            restColor: '#03dac6',
            concentricColor: '#cf6679',
            concentricSecond: 1,
            smoothAnimation: true,
            prepTime: 5,
            fullScreenMode: false,
            metronomeEnabled: true,
            metronomeSound: 'woodblock',
            floatingWindow: false,
            upDownMode: false,
            infoVisibility: 'always',
            soundMode: 'metronome',
            ttsEnabled: true,
            pulseEffect: 'always',
            finishedColor: '#4caf50',
            pipShowInfo: true,
        },
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
        vi.mocked(audioEngine.init).mockClear();
        vi.mocked(audioEngine.speak).mockClear();
        vi.mocked(audioEngine.playTick).mockClear();
        concentricTimerMock.mockClear();
    });

    it('renders setup mode with sets min constraint and semantic version footer', () => {
        render(<App />);

        expect(screen.getByRole('heading', { name: /system setup/i })).toBeInTheDocument();
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

        expect(screen.getByRole('heading', { name: /build a session/i })).toBeInTheDocument();
        expect(screen.getByText(/Session Canvas/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /workout setup/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /session builder/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^workout$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^rest$/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /add workout node/i })).not.toBeInTheDocument();
    });

    it('speaks the count of 1 during countdowns unless the active rep target is 1', () => {
        useWorkoutStore.setState({
            appPhase: 'timer',
            timerStatus: 'Main Set',
            isTimerRunning: true,
            isWorking: true,
            isMainRep: true,
            timeLeft: 1,
            lastTickSecond: -1,
            settings: {
                ...useWorkoutStore.getState().settings,
                ttsEnabled: true,
                metronomeEnabled: true,
            },
        });

        render(<App />);

        expect(audioEngine.speak).toHaveBeenCalledWith(1);
    });

    it('suppresses speaking 1 when the active rep target is 1', () => {
        useWorkoutStore.setState({
            appPhase: 'timer',
            timerStatus: 'Main Set',
            isTimerRunning: true,
            isWorking: true,
            isMainRep: true,
            reps: '1',
            timeLeft: 1,
            lastTickSecond: -1,
            settings: {
                ...useWorkoutStore.getState().settings,
                ttsEnabled: true,
                metronomeEnabled: true,
            },
        });

        render(<App />);

        expect(audioEngine.speak).not.toHaveBeenCalledWith(1);
    });

    it('suppresses speaking 1 during myo-rep countdowns when the active target is 1', () => {
        useWorkoutStore.setState({
            appPhase: 'timer',
            timerStatus: 'Myo Reps',
            isTimerRunning: true,
            isWorking: true,
            isMainRep: false,
            myoReps: '1',
            timeLeft: 1,
            lastTickSecond: -1,
            settings: {
                ...useWorkoutStore.getState().settings,
                ttsEnabled: true,
                metronomeEnabled: true,
            },
        });

        render(<App />);

        expect(audioEngine.speak).not.toHaveBeenCalledWith(1);
    });

    it('drives the prep ring from prepTime instead of rest time', () => {
        useWorkoutStore.setState({
            appPhase: 'timer',
            timerStatus: 'Preparing',
            isTimerRunning: true,
            isWorking: false,
            timeLeft: 5,
            rest: '20',
            settings: {
                ...useWorkoutStore.getState().settings,
                prepTime: 5,
            },
        });

        render(<App />);

        expect(concentricTimerMock).toHaveBeenCalled();
        const props = vi.mocked(concentricTimerMock).mock.calls[0]?.[0] as {
            outerValue: number;
            outerMax: number;
        };
        expect(props.outerValue).toBe(5);
        expect(props.outerMax).toBe(5);
    });

    it('drives the outer ring from remaining set time during active reps', () => {
        useWorkoutStore.setState({
            appPhase: 'timer',
            timerStatus: 'Main Set',
            isTimerRunning: true,
            isWorking: true,
            isMainRep: true,
            timeLeft: 3,
            setTotalDuration: 12,
            setElapsedTime: 4,
            settings: {
                ...useWorkoutStore.getState().settings,
            },
        });

        render(<App />);

        const props = vi.mocked(concentricTimerMock).mock.calls[0]?.[0] as {
            outerValue: number;
            outerMax: number;
        };
        expect(props.outerValue).toBe(8);
        expect(props.outerMax).toBe(12);
    });

    it('covers sidebar session handler cancellations and duplicate errors', () => {
        const promptSpy = vi.spyOn(window, 'prompt')
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(' ')
            .mockReturnValueOnce(null)
            .mockReturnValueOnce('Empty Session')
            .mockReturnValueOnce(null)
            .mockReturnValueOnce('Empty Session');
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });

        useWorkoutStore.setState({
            savedSessions: [
                {
                    id: 'session-1',
                    name: 'Empty Session',
                    nodes: [],
                    timesUsed: 0,
                    lastUsedAt: null,
                    createdAt: '2026-03-01T00:00:00.000Z',
                    updatedAt: '2026-03-01T00:00:00.000Z',
                },
            ],
        });

        render(<App />);

        const sessionNewButton = screen.getAllByRole('button', { name: /^new$/i })[0];
        fireEvent.click(sessionNewButton);
        fireEvent.click(sessionNewButton);
        fireEvent.click(screen.getByRole('button', { name: /load/i }));
        fireEvent.click(screen.getByTitle('Duplicate Session'));
        fireEvent.click(screen.getByTitle('Duplicate Session'));
        fireEvent.click(screen.getByTitle('Rename Session'));
        fireEvent.click(screen.getByTitle('Rename Session'));
        fireEvent.click(screen.getByTitle('Delete Session'));

        expect(promptSpy).toHaveBeenCalled();
        expect(confirmSpy).toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalled();
    });

    it('covers the successful rename and delete session branches', () => {
        const promptSpy = vi.spyOn(window, 'prompt')
            .mockReturnValueOnce('Renamed Session');
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });

        useWorkoutStore.setState({
            savedSessions: [
                {
                    id: 'session-1',
                    name: 'Original Session',
                    nodes: [
                        {
                            id: 'node-1',
                            type: 'rest',
                            name: 'Rest Node',
                            seconds: '30',
                            createdAt: '2026-03-01T00:00:00.000Z',
                            updatedAt: '2026-03-01T00:00:00.000Z',
                        },
                    ],
                    timesUsed: 0,
                    lastUsedAt: null,
                    createdAt: '2026-03-01T00:00:00.000Z',
                    updatedAt: '2026-03-01T00:00:00.000Z',
                },
            ],
        });

        render(<App />);

        fireEvent.click(screen.getByTitle('Rename Session'));
        expect(useWorkoutStore.getState().savedSessions[0].name).toBe('Renamed Session');

        fireEvent.click(screen.getByTitle('Delete Session'));
        expect(useWorkoutStore.getState().savedSessions).toHaveLength(0);
        expect(promptSpy).toHaveBeenCalledTimes(1);
        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(alertSpy).not.toHaveBeenCalled();
    });

    it('opens a node editor modal with legacy workout repair controls', () => {
        useWorkoutStore.setState({
            setupMode: 'session',
            editingSessionNodeId: 'node-1',
            editingSessionDraft: {
                id: 'session-1',
                name: 'Session One',
                nodes: [
                    {
                        id: 'node-1',
                        type: 'workout',
                        name: 'Workout Node',
                        config: {
                            sets: '3',
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
            savedWorkouts: [baseWorkout],
        });

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: /edit workout node/i }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText(/old node/i)).toBeInTheDocument();
        expect(screen.getByText(/Import or Save Workout/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /import workout/i })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /export workout/i }));
        expect(useWorkoutStore.getState().savedWorkouts).toHaveLength(2);
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes[0]).toMatchObject({
            type: 'workout',
        });
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes[0].type === 'workout'
            ? useWorkoutStore.getState().editingSessionDraft?.nodes[0].sourceWorkoutId
            : null).toBe(useWorkoutStore.getState().savedWorkouts[1].id);
        expect(screen.getByRole('status')).toHaveTextContent(/saved and linked/i);
    });

    it('shows the missing-link warning for orphaned workout nodes and closes from the backdrop', () => {
        useWorkoutStore.setState({
            setupMode: 'session',
            editingSessionNodeId: 'node-1',
            editingSessionDraft: {
                id: 'session-2',
                name: 'Broken Session',
                nodes: [
                    {
                        id: 'node-1',
                        type: 'workout',
                        name: 'Orphaned Workout',
                        config: {
                            sets: '2',
                            reps: '8',
                            seconds: '2',
                            rest: '15',
                            myoReps: '4',
                            myoWorkSecs: '2',
                        },
                        sourceWorkoutId: 'missing-workout',
                        createdAt: '2026-03-01T00:00:00.000Z',
                        updatedAt: '2026-03-01T00:00:00.000Z',
                    },
                ],
                timesUsed: 0,
                lastUsedAt: null,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
            },
            savedWorkouts: [],
        });

        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: /edit orphaned workout/i }));
        const dialog = screen.getByRole('dialog', { name: /workout node editor/i });
        expect(screen.getByText(/missing workout link/i)).toBeInTheDocument();

        fireEvent.pointerDown(dialog, { target: dialog });
        expect(screen.queryByRole('dialog', { name: /workout node editor/i })).not.toBeInTheDocument();
    });

    it('uses the session rest duration for rest-node outer max display', () => {
        useWorkoutStore.setState({
            appPhase: 'timer',
            timerStatus: 'Resting',
            isTimerRunning: true,
            currentSet: 1,
            currentRep: 1,
            isMainRep: true,
            isWorking: false,
            sets: '1',
            reps: '10',
            seconds: '3',
            rest: '20',
            myoReps: '4',
            myoWorkSecs: '2',
            timeLeft: 8,
            setTotalDuration: 8,
            savedSessions: [
                {
                    id: 'session-1',
                    name: 'Session One',
                    nodes: [
                        {
                            id: 'node-1',
                            type: 'rest',
                            name: 'Session Rest',
                            seconds: '8',
                            createdAt: '2026-03-01T00:00:00.000Z',
                            updatedAt: '2026-03-01T00:00:00.000Z',
                        },
                    ],
                    timesUsed: 0,
                    lastUsedAt: null,
                    createdAt: '2026-03-01T00:00:00.000Z',
                    updatedAt: '2026-03-01T00:00:00.000Z',
                },
            ],
            activeSessionId: 'session-1',
            activeSessionNodeIndex: 0,
            sessionStatus: 'running',
            isRunningSession: true,
            sessionNodeRuntimeType: 'rest',
            sessionRestTimeLeft: 8,
            selectedSavedSessionId: 'session-1',
        });

        render(<App />);

        const timerProps = concentricTimerMock.mock.calls[0]?.[0] as { outerMax: number };
        expect(timerProps.outerMax).toBe(8);
    });

    it('lets users toggle voice guidance and open myo-rep info from setup', () => {
        render(<App />);

        const voiceToggle = screen.getByRole('switch', { name: /voice guidance/i });
        expect(voiceToggle).toBeChecked();

        fireEvent.click(voiceToggle);
        expect(useWorkoutStore.getState().settings.ttsEnabled).toBe(false);

        fireEvent.click(screen.getByRole('button', { name: /what are "myo-reps"\?/i }));
        expect(screen.getByRole('dialog', { name: /protocol intel/i })).toBeInTheDocument();
        expect(screen.getByText(/what myo-reps actually are/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /close protocol intel/i }));
        expect(screen.queryByRole('dialog', { name: /protocol intel/i })).not.toBeInTheDocument();
    });

    it('grays out rest and myo inputs when the cycle count is one', () => {
        render(<App />);

        const inputs = screen.getAllByRole('spinbutton');
        fireEvent.change(inputs[0], { target: { value: '1' } });

        expect(inputs[3]).toBeDisabled();
        expect(inputs[4]).toBeDisabled();
        expect(inputs[5]).toBeDisabled();
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

    it('keeps the timer worker running without restarting it on every tick', async () => {
        vi.useFakeTimers();

        const originalWorker = global.Worker;

        class RepeatingWorker {
            static instances: RepeatingWorker[] = [];
            onmessage: ((event: MessageEvent) => void) | null = null;
            private timerId: ReturnType<typeof setInterval> | null = null;
            private startTime = 0;
            startMessages = 0;

            constructor() {
                RepeatingWorker.instances.push(this);
            }

            postMessage(data: unknown) {
                const message = data as { action?: string; interval?: number };
                if (message.action === 'start') {
                    this.startMessages += 1;
                    if (this.timerId) {
                        clearInterval(this.timerId);
                    }

                    const interval = message.interval ?? 1000;
                    this.startTime = performance.now();
                    this.timerId = setInterval(() => {
                        if (!this.onmessage) return;
                        const elapsed = performance.now() - this.startTime;
                        this.onmessage(new MessageEvent('message', { data: { action: 'tick', elapsed } }));
                    }, interval);
                    return;
                }

                if (message.action === 'stop' && this.timerId) {
                    clearInterval(this.timerId);
                    this.timerId = null;
                }
            }

            terminate() {
                if (this.timerId) {
                    clearInterval(this.timerId);
                    this.timerId = null;
                }
            }

            addEventListener() {}
            removeEventListener() {}
        }

        global.Worker = RepeatingWorker as unknown as typeof Worker;
        RepeatingWorker.instances = [];

        try {
            render(<App />);

            const inputs = screen.getAllByRole('spinbutton');
            fireEvent.change(inputs[0], { target: { value: '3' } });
            fireEvent.change(inputs[1], { target: { value: '12' } });
            fireEvent.change(inputs[2], { target: { value: '3' } });
            fireEvent.change(inputs[3], { target: { value: '20' } });
            fireEvent.change(inputs[4], { target: { value: '4' } });
            fireEvent.change(inputs[5], { target: { value: '2' } });

            fireEvent.click(screen.getByRole('button', { name: /initialize protocol/i }));

            await act(async () => {
                await vi.advanceTimersByTimeAsync(200);
            });

            expect(RepeatingWorker.instances[0].startMessages).toBe(1);
            expect(useWorkoutStore.getState().timeLeft).toBeLessThan(4.9);
        } finally {
            global.Worker = originalWorker;
            vi.useRealTimers();
        }
    });

    it('advances from Preparing to Main Set exactly once when the worker countdown completes', async () => {
        vi.useFakeTimers();

        const originalWorker = global.Worker;

        class FinishingWorker {
            static instances: FinishingWorker[] = [];
            onmessage: ((event: MessageEvent) => void) | null = null;
            private timerId: ReturnType<typeof setInterval> | null = null;
            private startTime = 0;
            startMessages = 0;
            stopMessages = 0;

            constructor() {
                FinishingWorker.instances.push(this);
            }

            postMessage(data: unknown) {
                const message = data as { action?: string; interval?: number };
                if (message.action === 'start') {
                    this.startMessages += 1;
                    if (this.timerId) {
                        clearInterval(this.timerId);
                    }

                    const interval = message.interval ?? 1000;
                    this.startTime = performance.now();
                    this.timerId = setInterval(() => {
                        if (!this.onmessage) return;
                        const elapsed = performance.now() - this.startTime;
                        this.onmessage(new MessageEvent('message', { data: { action: 'tick', elapsed } }));
                    }, interval);
                    return;
                }

                if (message.action === 'stop') {
                    this.stopMessages += 1;
                    if (this.timerId) {
                        clearInterval(this.timerId);
                        this.timerId = null;
                    }
                }
            }

            terminate() {
                if (this.timerId) {
                    clearInterval(this.timerId);
                    this.timerId = null;
                }
            }

            addEventListener() {}
            removeEventListener() {}
        }

        global.Worker = FinishingWorker as unknown as typeof Worker;
        FinishingWorker.instances = [];

        try {
            render(<App />);

            const inputs = screen.getAllByRole('spinbutton');
            fireEvent.change(inputs[0], { target: { value: '3' } });
            fireEvent.change(inputs[1], { target: { value: '12' } });
            fireEvent.change(inputs[2], { target: { value: '3' } });
            fireEvent.change(inputs[3], { target: { value: '20' } });
            fireEvent.change(inputs[4], { target: { value: '4' } });
            fireEvent.change(inputs[5], { target: { value: '2' } });

            fireEvent.click(screen.getByRole('button', { name: /initialize protocol/i }));

            await act(async () => {
                await vi.advanceTimersByTimeAsync(5100);
            });

            expect(FinishingWorker.instances[0].startMessages).toBe(2);
            expect(FinishingWorker.instances[0].stopMessages).toBeGreaterThanOrEqual(1);
            expect(useWorkoutStore.getState().timerStatus).toBe('Main Set');
            expect(useWorkoutStore.getState().timeLeft).toBeGreaterThan(2.5);
            expect(useWorkoutStore.getState().timeLeft).toBeLessThan(3);
        } finally {
            global.Worker = originalWorker;
            vi.useRealTimers();
        }
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

    it('opens and closes the myo-rep info modal from the sidebar link', () => {
        render(<App />);

        fireEvent.click(screen.getByRole('button', { name: /what are "myo-reps"\?/i }));
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
        expect(screen.queryByRole('button', { name: /launch pip/i })).not.toBeInTheDocument();
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

    it('speaks when the rep countdown is at 1 second', () => {
        useWorkoutStore.setState({
            appPhase: 'timer',
            timerStatus: 'Main Set',
            isTimerRunning: true,
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
            timeLeft: 1,
            lastTickSecond: -1,
            settings: {
                ...useWorkoutStore.getState().settings,
                ttsEnabled: true,
                metronomeEnabled: true,
            },
        });

        render(<App />);

        expect(audioEngine.speak).toHaveBeenCalledWith(1);
        expect(audioEngine.playTick).toHaveBeenCalledTimes(1);
    });

    it('suppresses speech during a main-set burnout block', () => {
        useWorkoutStore.setState({
            appPhase: 'timer',
            timerStatus: 'Main Set',
            isTimerRunning: true,
            currentSet: 1,
            currentRep: 1,
            isMainRep: true,
            isWorking: true,
            sets: '3',
            reps: '12',
            rest: '10',
            myoReps: '4',
            myoWorkSecs: '2',
            seconds: '1',
            timeLeft: 1,
            lastTickSecond: -1,
            settings: {
                ...useWorkoutStore.getState().settings,
                ttsEnabled: true,
                metronomeEnabled: true,
            },
        });

        render(<App />);

        expect(audioEngine.speak).not.toHaveBeenCalled();
        expect(audioEngine.playTick).toHaveBeenCalledTimes(1);
    });

    it('suppresses speech during a myo-rep burnout block', () => {
        useWorkoutStore.setState({
            appPhase: 'timer',
            timerStatus: 'Myo Reps',
            isTimerRunning: true,
            currentSet: 2,
            currentRep: 1,
            isMainRep: false,
            isWorking: true,
            sets: '3',
            reps: '12',
            rest: '10',
            myoReps: '5',
            myoWorkSecs: '1',
            seconds: '3',
            timeLeft: 1,
            lastTickSecond: -1,
            settings: {
                ...useWorkoutStore.getState().settings,
                ttsEnabled: true,
                metronomeEnabled: true,
            },
        });

        render(<App />);

        expect(audioEngine.speak).not.toHaveBeenCalled();
        expect(audioEngine.playTick).toHaveBeenCalledTimes(1);
    });

    it('suppresses speech for session workout burnout nodes', () => {
        useWorkoutStore.setState({
            appPhase: 'timer',
            timerStatus: 'Main Set',
            isTimerRunning: true,
            currentSet: 1,
            currentRep: 1,
            isMainRep: true,
            isWorking: true,
            seconds: '1',
            reps: '12',
            rest: '10',
            myoReps: '4',
            myoWorkSecs: '2',
            timeLeft: 1,
            activeSessionId: 'session-1',
            activeSessionNodeIndex: 0,
            sessionStatus: 'running',
            isRunningSession: true,
            sessionNodeRuntimeType: 'workout',
            settings: {
                ...useWorkoutStore.getState().settings,
                ttsEnabled: true,
                metronomeEnabled: true,
            },
            savedSessions: [
                {
                    id: 'session-1',
                    name: 'Burnout Session',
                    nodes: [
                        {
                            id: 'node-1',
                            type: 'workout',
                            name: 'Burnout Node',
                            config: {
                                sets: '2',
                                reps: '12',
                                seconds: '1',
                                rest: '10',
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
            ],
        });

        render(<App />);

        expect(audioEngine.speak).not.toHaveBeenCalled();
        expect(audioEngine.playTick).toHaveBeenCalledTimes(1);
    });

    it('does not render pip controls anymore', () => {
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
        render(<App />);
        expect(screen.queryByRole('button', { name: /launch pip/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /pip active/i })).not.toBeInTheDocument();
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

        fireEvent.click(screen.getByText('Close Settings'));
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

