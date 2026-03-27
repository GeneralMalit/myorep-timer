import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    SavedWorkout,
    SavedWorkoutConfig,
    SavedWorkoutsExportV1,
    SavedWorkoutsImportSummary,
} from '@/types/savedWorkouts';
import {
    buildSavedWorkoutsExport,
    createSavedWorkout,
    isValidWorkoutConfig,
    mergeSavedWorkoutsFromImport,
    normalizeSetsInput,
    pickConfigFromState,
    sanitizeSavedWorkoutConfig,
} from '@/utils/savedWorkouts';

export type AppPhase = 'setup' | 'timer';
export type TimerStatus = 'Ready' | 'Preparing' | 'Main Set' | 'Resting' | 'Myo Reps' | 'Finished';

const parsePositiveInt = (value: string | number): number | null => {
    const parsed = typeof value === 'number' ? value : parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
};

const getConcentricLimitFromPaces = (seconds: string, myoWorkSecs: string): number | null => {
    const candidates = [parsePositiveInt(seconds), parsePositiveInt(myoWorkSecs)].filter((value): value is number => value !== null);
    return candidates.length > 0 ? Math.min(...candidates) : null;
};

const clampConcentricSecond = (requested: number, limit: number | null): number => {
    const normalized = Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : 1;
    return limit === null ? normalized : Math.min(normalized, limit);
};

const toWorkoutConfig = (state: Pick<WorkoutState, 'sets' | 'reps' | 'seconds' | 'rest' | 'myoReps' | 'myoWorkSecs'>): SavedWorkoutConfig => {
    return pickConfigFromState(state);
};

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

    // Saved workouts
    savedWorkouts: SavedWorkout[];
    selectedSavedWorkoutId: string | null;
    lastImportSummary: SavedWorkoutsImportSummary | null;

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
    saveCurrentWorkout: (name: string) => { ok: boolean; error?: string; id?: string };
    loadWorkout: (id: string) => { ok: boolean; error?: string };
    renameWorkout: (id: string, name: string) => { ok: boolean; error?: string };
    deleteWorkout: (id: string) => void;
    recordWorkoutUsed: (id: string) => void;
    exportSavedWorkouts: () => SavedWorkoutsExportV1;
    importSavedWorkouts: (payload: unknown) => SavedWorkoutsImportSummary;
    clearImportSummary: () => void;
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

            savedWorkouts: [],
            selectedSavedWorkoutId: null,
            lastImportSummary: null,

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
            setSettings: (newSettings) => set((state) => {
                const limit = getConcentricLimitFromPaces(state.seconds, state.myoWorkSecs);
                const mergedSettings = { ...state.settings, ...newSettings };

                if (newSettings.concentricSecond !== undefined) {
                    mergedSettings.concentricSecond = clampConcentricSecond(newSettings.concentricSecond, limit);
                } else {
                    mergedSettings.concentricSecond = clampConcentricSecond(mergedSettings.concentricSecond, limit);
                }

                return { settings: mergedSettings };
            }),
            setWorkoutConfig: (config) => set((state) => {
                const nextConfig = { ...config };
                if (typeof config.sets === 'string') {
                    nextConfig.sets = normalizeSetsInput(config.sets);
                }

                const nextSeconds = nextConfig.seconds ?? state.seconds;
                const nextMyoWorkSecs = nextConfig.myoWorkSecs ?? state.myoWorkSecs;
                const limit = getConcentricLimitFromPaces(nextSeconds, nextMyoWorkSecs);

                return {
                    ...nextConfig,
                    selectedSavedWorkoutId: null,
                    settings: {
                        ...state.settings,
                        concentricSecond: clampConcentricSecond(state.settings.concentricSecond, limit),
                    },
                };
            }),
            saveCurrentWorkout: (name) => {
                const normalizedName = name.trim();
                if (!normalizedName) {
                    return { ok: false, error: 'Workout name is required.' };
                }

                const state = get();
                const config = sanitizeSavedWorkoutConfig(toWorkoutConfig(state));
                if (!isValidWorkoutConfig(config)) {
                    return { ok: false, error: 'Workout config is invalid.' };
                }

                const duplicateName = state.savedWorkouts.some((workout) => workout.name.toLowerCase() === normalizedName.toLowerCase());
                if (duplicateName) {
                    return { ok: false, error: 'Workout name already exists.' };
                }

                const nowIso = new Date().toISOString();
                const newWorkout = createSavedWorkout(normalizedName, config, nowIso);
                set({
                    savedWorkouts: [...state.savedWorkouts, newWorkout],
                    selectedSavedWorkoutId: newWorkout.id,
                });

                return { ok: true, id: newWorkout.id };
            },
            loadWorkout: (id) => {
                const workout = get().savedWorkouts.find((item) => item.id === id);
                if (!workout) {
                    return { ok: false, error: 'Workout not found.' };
                }

                const nextConfig = sanitizeSavedWorkoutConfig(workout);
                set({
                    ...nextConfig,
                    selectedSavedWorkoutId: workout.id,
                });

                return { ok: true };
            },
            renameWorkout: (id, name) => {
                const normalizedName = name.trim();
                if (!normalizedName) {
                    return { ok: false, error: 'Workout name is required.' };
                }

                const state = get();
                const exists = state.savedWorkouts.some((workout) => workout.id !== id && workout.name.toLowerCase() === normalizedName.toLowerCase());
                if (exists) {
                    return { ok: false, error: 'Workout name already exists.' };
                }

                const nowIso = new Date().toISOString();
                set({
                    savedWorkouts: state.savedWorkouts.map((workout) => (
                        workout.id === id
                            ? { ...workout, name: normalizedName, updatedAt: nowIso }
                            : workout
                    )),
                });

                return { ok: true };
            },
            deleteWorkout: (id) => set((state) => ({
                savedWorkouts: state.savedWorkouts.filter((workout) => workout.id !== id),
                selectedSavedWorkoutId: state.selectedSavedWorkoutId === id ? null : state.selectedSavedWorkoutId,
            })),
            recordWorkoutUsed: (id) => set((state) => {
                const nowIso = new Date().toISOString();
                return {
                    savedWorkouts: state.savedWorkouts.map((workout) => (
                        workout.id === id
                            ? {
                                ...workout,
                                timesUsed: workout.timesUsed + 1,
                                lastUsedAt: nowIso,
                                updatedAt: nowIso,
                            }
                            : workout
                    )),
                };
            }),
            exportSavedWorkouts: () => {
                return buildSavedWorkoutsExport(get().savedWorkouts, new Date().toISOString());
            },
            importSavedWorkouts: (payload) => {
                const state = get();
                const { workouts, summary } = mergeSavedWorkoutsFromImport(state.savedWorkouts, payload);
                set({ savedWorkouts: workouts, lastImportSummary: summary });
                return summary;
            },
            clearImportSummary: () => set({ lastImportSummary: null }),

            startWorkout: () => {
                const {
                    sets,
                    reps,
                    seconds,
                    rest,
                    myoReps,
                    myoWorkSecs,
                    settings,
                    selectedSavedWorkoutId,
                    recordWorkoutUsed,
                } = get();

                const sanitizedConfig = sanitizeSavedWorkoutConfig({
                    sets,
                    reps,
                    seconds,
                    rest,
                    myoReps,
                    myoWorkSecs,
                });

                const s = parseInt(sanitizedConfig.sets, 10);
                const r = parseInt(sanitizedConfig.reps, 10);
                const sec = parseInt(sanitizedConfig.seconds, 10);
                const rst = parseInt(sanitizedConfig.rest, 10);
                const mr = parseInt(sanitizedConfig.myoReps, 10);
                const msec = parseInt(sanitizedConfig.myoWorkSecs, 10);
                const isSingleSet = s === 1;

                const hasBaseConfig = s > 0 && r > 0 && sec > 0;
                const hasClusterConfig = rst > 0 && mr > 0 && msec > 0;

                if (hasBaseConfig && (isSingleSet || hasClusterConfig)) {
                    if (selectedSavedWorkoutId) {
                        recordWorkoutUsed(selectedSavedWorkoutId);
                    }

                    set({
                        ...sanitizedConfig,
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

                if (state.timerStatus === 'Preparing') {
                    set({
                        timerStatus: 'Main Set',
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
                        } else if (state.currentSet < totalSets) {
                            set({
                                isWorking: false,
                                timeLeft: restSecs,
                                timerStatus: 'Resting',
                                setTotalDuration: restSecs,
                                setElapsedTime: 0,
                                lastTickSecond: -1,
                            });
                        } else {
                            set({
                                isTimerRunning: false,
                                timerStatus: 'Finished',
                                timeLeft: 0,
                                setElapsedTime: state.setTotalDuration,
                                lastTickSecond: -1,
                            });
                        }
                    } else if (state.currentRep < myoRepsCount) {
                        set({
                            currentRep: state.currentRep + 1,
                            timeLeft: myoSecs,
                            lastTickSecond: -1,
                        });
                    } else if (state.currentSet < totalSets) {
                        set({
                            isWorking: false,
                            timeLeft: restSecs,
                            timerStatus: 'Resting',
                            setTotalDuration: restSecs,
                            setElapsedTime: 0,
                            lastTickSecond: -1,
                        });
                    } else {
                        set({
                            isTimerRunning: false,
                            timerStatus: 'Finished',
                            timeLeft: 0,
                            setElapsedTime: state.setTotalDuration,
                            lastTickSecond: -1,
                        });
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
                        timerStatus: 'Myo Reps',
                        lastTickSecond: -1,
                    });
                }
            },
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
                theme: state.theme,
                savedWorkouts: state.savedWorkouts,
            }),
        },
    ),
);

