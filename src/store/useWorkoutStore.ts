import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppPhase = 'setup' | 'timer';
export type TimerStatus = 'Ready' | 'Preparing' | 'Main Set' | 'Resting' | 'Myo Reps' | 'Finished';

export interface WorkoutSettings {
    activeColor: string;
    restColor: string;
    concentricColor: string;
    concentricSecond: number;
    smoothAnimation: boolean;
    prepTime: number;
    fullScreenMode: boolean;
    metronomeEnabled: boolean;
    metronomeSound: string;
    floatingWindow: boolean;
    upDownMode: boolean;
    infoVisibility: 'always' | 'resting' | 'never';
    soundMode: 'metronome' | 'tts';
    ttsEnabled: boolean;
    pulseEffect: 'always' | 'resting' | 'never';
    finishedColor: string;
    pipShowInfo: boolean;
}

interface WorkoutState {
    // Config
    settings: WorkoutSettings;
    sets: string;
    reps: string;
    seconds: string;
    rest: string;
    myoReps: string;
    myoWorkSecs: string;

    // Timer State
    appPhase: AppPhase;
    timerStatus: TimerStatus;
    isTimerRunning: boolean;
    currentSet: number;
    currentRep: number;
    isMainRep: boolean;
    isWorking: boolean;
    timeLeft: number;
    setTotalDuration: number;
    setElapsedTime: number;
    lastTickSecond: number;

    // UI State
    showSettings: boolean;
    isSidebarCollapsed: boolean;
    theme: string;

    // Actions
    setShowSettings: (show: boolean) => void;
    setIsSidebarCollapsed: (collapsed: boolean) => void;
    setTheme: (theme: string) => void;
    setSettings: (settings: Partial<WorkoutSettings>) => void;
    setWorkoutConfig: (config: Partial<Pick<WorkoutState, 'sets' | 'reps' | 'seconds' | 'rest' | 'myoReps' | 'myoWorkSecs'>>) => void;
    startWorkout: () => void;
    resetWorkout: () => void;
    setIsTimerRunning: (running: boolean) => void;
    setTimeLeft: (time: number) => void;
    setSetElapsedTime: (time: number) => void;
    setLastTickSecond: (sec: number) => void;
    advanceCycle: () => void;
    updateTimerBaselines: (timeLeft: number, setElapsed: number) => void;
}

export const useWorkoutStore = create<WorkoutState>()(
    persist(
        (set, get) => ({
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
            showSettings: false,
            isSidebarCollapsed: false,
            theme: 'theme-default',

            setShowSettings: (show: boolean) => set({ showSettings: show }),
            setIsSidebarCollapsed: (collapsed: boolean) => set({ isSidebarCollapsed: collapsed }),
            setTheme: (theme: string) => set({ theme }),
            setSettings: (newSettings) => set((state) => ({ settings: { ...state.settings, ...newSettings } })),
            setWorkoutConfig: (config) => set((state) => ({ ...state, ...config })),

            startWorkout: () => {
                const { sets, reps, seconds, rest, myoReps, myoWorkSecs, settings } = get();
                const s = parseInt(sets, 10);
                const r = parseInt(reps, 10);
                const sec = parseInt(seconds, 10);
                const rst = parseInt(rest, 10);
                const mr = parseInt(myoReps, 10);
                const msec = parseInt(myoWorkSecs, 10);

                if (s > 0 && r > 0 && sec > 0 && rst > 0 && mr > 0 && msec > 0) {
                    set({
                        currentSet: 1,
                        currentRep: 1,
                        isMainRep: true,
                        isWorking: true,
                        setTotalDuration: r * sec,
                        setElapsedTime: 0,
                        appPhase: 'timer',
                        timerStatus: 'Preparing',
                        timeLeft: settings.prepTime,
                        isTimerRunning: true,
                        lastTickSecond: -1,
                    });
                }
            },

            resetWorkout: () => set({
                isTimerRunning: false,
                appPhase: 'setup',
                timerStatus: 'Ready',
                lastTickSecond: -1,
            }),

            setIsTimerRunning: (running: boolean) => set({ isTimerRunning: running }),
            setTimeLeft: (time: number) => set({ timeLeft: time }),
            setSetElapsedTime: (time: number) => set({ setElapsedTime: time }),
            setLastTickSecond: (sec: number) => set({ lastTickSecond: sec }),

            updateTimerBaselines: (timeLeft: number, setElapsed: number) => set({ timeLeft, setElapsedTime: setElapsed }),

            advanceCycle: () => {
                const state = get();
                const { sets, reps, myoReps, seconds, myoWorkSecs, rest } = state;

                const totalSets = parseInt(sets, 10);
                const mainRepsCount = parseInt(reps, 10);
                const myoRepsCount = parseInt(myoReps, 10);
                const mainSecs = parseInt(seconds, 10);
                const myoSecs = parseInt(myoWorkSecs, 10);
                const restSecs = parseInt(rest, 10);

                if (state.timerStatus === "Preparing") {
                    set({
                        timerStatus: "Main Set",
                        timeLeft: mainSecs,
                        isWorking: true,
                        isMainRep: true,
                        currentRep: 1,
                        setTotalDuration: mainRepsCount * mainSecs,
                        setElapsedTime: 0,
                        lastTickSecond: -1,
                    });
                    return;
                }

                if (state.isWorking) {
                    if (state.isMainRep) {
                        if (state.currentRep < mainRepsCount) {
                            set({
                                currentRep: state.currentRep + 1,
                                timeLeft: mainSecs,
                                lastTickSecond: -1,
                            });
                        } else {
                            if (state.currentSet < totalSets) {
                                set({
                                    isWorking: false,
                                    timeLeft: restSecs,
                                    timerStatus: "Resting",
                                    setTotalDuration: restSecs,
                                    setElapsedTime: 0,
                                    lastTickSecond: -1,
                                });
                            } else {
                                set({
                                    isTimerRunning: false,
                                    timerStatus: "Finished",
                                    timeLeft: 0,
                                    setElapsedTime: state.setTotalDuration,
                                    lastTickSecond: -1,
                                });
                            }
                        }
                    } else {
                        if (state.currentRep < myoRepsCount) {
                            set({
                                currentRep: state.currentRep + 1,
                                timeLeft: myoSecs,
                                lastTickSecond: -1,
                            });
                        } else {
                            if (state.currentSet < totalSets) {
                                set({
                                    isWorking: false,
                                    timeLeft: restSecs,
                                    timerStatus: "Resting",
                                    setTotalDuration: restSecs,
                                    setElapsedTime: 0,
                                    lastTickSecond: -1,
                                });
                            } else {
                                set({
                                    isTimerRunning: false,
                                    timerStatus: "Finished",
                                    timeLeft: 0,
                                    setElapsedTime: state.setTotalDuration,
                                    lastTickSecond: -1,
                                });
                            }
                        }
                    }
                } else {
                    set({
                        currentSet: state.currentSet + 1,
                        isMainRep: false,
                        currentRep: 1,
                        isWorking: true,
                        timeLeft: myoSecs,
                        setTotalDuration: myoRepsCount * myoSecs,
                        setElapsedTime: 0,
                        timerStatus: "Myo Reps",
                        lastTickSecond: -1,
                    });
                }
            }
        }),
        {
            name: 'myorep-workout-storage',
            partialize: (state) => ({
                settings: state.settings,
                sets: state.sets,
                reps: state.reps,
                seconds: state.seconds,
                rest: state.rest,
                myoReps: state.myoReps,
                myoWorkSecs: state.myoWorkSecs,
                theme: state.theme
            }),
        }
    )
);
