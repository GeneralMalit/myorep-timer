import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    SavedWorkout,
    SavedWorkoutConfig,
    SavedWorkoutsExportV1,
    SavedWorkoutsImportSummary,
} from '@/types/savedWorkouts';
import {
    SavedSession,
    SessionNode,
    SessionStatus,
    WorkoutSessionNode,
    RestSessionNode,
} from '@/types/savedSessions';
import {
    createSavedWorkout,
    buildSavedWorkoutsExport,
    isValidWorkoutConfig,
    mergeSavedWorkoutsFromImport,
    normalizeSetsInput,
    pickConfigFromState,
    sanitizeSavedWorkoutConfig,
} from '@/utils/savedWorkouts';
import {
    cloneSavedSession,
    cloneSessionNode,
    createRestSessionNode,
    createWorkoutSessionNode,
    isValidSavedSession,
    moveNodeInArray,
    sanitizeRestNodeSeconds,
} from '@/utils/savedSessions';

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

const createEmptySessionDraft = (name: string, nowIso: string): SavedSession => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: name.trim() || 'Session',
    nodes: [],
    timesUsed: 0,
    lastUsedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
});

const isWorkoutSessionNode = (node: SessionNode | undefined): node is WorkoutSessionNode => {
    return node !== undefined && node.type === 'workout';
};

const isRestSessionNode = (node: SessionNode | undefined): node is RestSessionNode => {
    return node !== undefined && node.type === 'rest';
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
    savedSessions: SavedSession[];
    selectedSavedSessionId: string | null;
    setupMode: 'workout' | 'session';
    editingSessionId: string | null;
    editingSessionDraft: SavedSession | null;
    editingSessionNodeId: string | null;

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
    activeSessionId: string | null;
    activeSessionNodeIndex: number;
    sessionStatus: SessionStatus;
    isRunningSession: boolean;
    sessionNodeRuntimeType: 'workout' | 'rest' | null;
    sessionRestTimeLeft: number;
    sessionLastTickSecond: number;

    // UI State
    showSettings: boolean;
    isSidebarCollapsed: boolean;
    theme: string;

    // Actions
    setShowSettings: (show: boolean) => void;
    setIsSidebarCollapsed: (collapsed: boolean) => void;
    setTheme: (theme: string) => void;
    setSetupMode: (mode: 'workout' | 'session') => void;
    setSettings: (settings: Partial<WorkoutSettings>) => void;
    setWorkoutConfig: (config: Partial<Pick<WorkoutState, 'sets' | 'reps' | 'seconds' | 'rest' | 'myoReps' | 'myoWorkSecs'>>) => void;
    saveCurrentWorkout: (name: string) => { ok: boolean; error?: string; id?: string };
    saveCurrentWorkoutAs: (name: string) => { ok: boolean; error?: string; id?: string };
    saveWorkoutFromConfig: (name: string, config: SavedWorkoutConfig, targetWorkoutId?: string | null) => { ok: boolean; error?: string; id?: string };
    loadWorkout: (id: string) => { ok: boolean; error?: string };
    renameWorkout: (id: string, name: string) => { ok: boolean; error?: string };
    deleteWorkout: (id: string) => void;
    recordWorkoutUsed: (id: string) => void;
    exportSavedWorkouts: () => SavedWorkoutsExportV1;
    importSavedWorkouts: (payload: unknown) => SavedWorkoutsImportSummary;
    clearImportSummary: () => void;
    createSession: (name: string) => { ok: boolean; error?: string; id?: string };
    saveSessionDraft: (name?: string) => { ok: boolean; error?: string; id?: string };
    saveSessionDraftAs: (name: string) => { ok: boolean; error?: string; id?: string };
    loadSessionForEditing: (id: string) => { ok: boolean; error?: string };
    renameSession: (id: string, name: string) => { ok: boolean; error?: string };
    deleteSession: (id: string) => void;
    duplicateSession: (id: string, name: string) => { ok: boolean; error?: string; id?: string };
    addWorkoutNodeFromCurrentSetup: () => { ok: boolean; error?: string; id?: string };
    addWorkoutNodeFromSavedWorkout: (workoutId: string) => { ok: boolean; error?: string; id?: string };
    addRestNode: (seconds?: string) => { ok: boolean; error?: string; id?: string };
    updateWorkoutNode: (nodeId: string, config: SavedWorkoutConfig, name?: string) => { ok: boolean; error?: string };
    updateRestNode: (nodeId: string, seconds: string, name?: string) => { ok: boolean; error?: string };
    removeSessionNode: (nodeId: string) => void;
    moveSessionNode: (nodeId: string, direction: 'left' | 'right') => void;
    moveSessionNodeToIndex: (nodeId: string, targetIndex: number) => { ok: boolean; error?: string };
    insertSessionNodeAfter: (afterNodeId: string | null, node: SessionNode) => void;
    setEditingSessionNodeId: (nodeId: string | null) => void;
    replaceWorkoutNodeWithSavedWorkout: (nodeId: string, workoutId: string) => { ok: boolean; error?: string };
    startSession: (id: string) => { ok: boolean; error?: string };
    pauseSession: () => void;
    resumeSession: () => void;
    resetSession: () => void;
    advanceSessionNode: () => void;
    startSessionNode: (index: number) => void;
    completeSessionNode: () => void;
    setSessionRestTimeLeft: (time: number) => void;
    setSessionLastTickSecond: (sec: number) => void;
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
            lastTickSecond: -1,
            activeSessionId: null,
            activeSessionNodeIndex: 0,
            sessionStatus: 'idle',
            isRunningSession: false,
            sessionNodeRuntimeType: null,
            sessionRestTimeLeft: 0,
            sessionLastTickSecond: -1,
            showSettings: false,
            isSidebarCollapsed: false,
            theme: 'theme-default',

            setShowSettings: (show: boolean) => set({ showSettings: show }),
            setIsSidebarCollapsed: (collapsed: boolean) => set({ isSidebarCollapsed: collapsed }),
            setTheme: (theme: string) => set({ theme }),
            setSetupMode: (mode) => set({ setupMode: mode }),
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
                    settings: {
                        ...state.settings,
                        concentricSecond: clampConcentricSecond(state.settings.concentricSecond, limit),
                    },
                };
            }),
            saveWorkoutFromConfig: (name, config, targetWorkoutId = null) => {
                const normalizedName = name.trim();
                if (!normalizedName) {
                    return { ok: false, error: 'Workout name is required.' };
                }

                const sanitizedConfig = sanitizeSavedWorkoutConfig(config);
                if (!isValidWorkoutConfig(sanitizedConfig)) {
                    return { ok: false, error: 'Workout config is invalid.' };
                }

                const state = get();
                const nowIso = new Date().toISOString();
                const targetWorkout = targetWorkoutId
                    ? state.savedWorkouts.find((workout) => workout.id === targetWorkoutId)
                    : null;

                if (targetWorkoutId && !targetWorkout) {
                    return { ok: false, error: 'Workout not found.' };
                }

                if (targetWorkout) {
                    const duplicateName = state.savedWorkouts.some((workout) => (
                        workout.id !== targetWorkout.id
                        && workout.name.toLowerCase() === normalizedName.toLowerCase()
                    ));
                    if (duplicateName) {
                        return { ok: false, error: 'Workout name already exists.' };
                    }

                    set({
                        savedWorkouts: state.savedWorkouts.map((workout) => (
                            workout.id === targetWorkout.id
                                ? {
                                    ...workout,
                                    name: normalizedName,
                                    ...sanitizedConfig,
                                    updatedAt: nowIso,
                                }
                                : workout
                        )),
                        selectedSavedWorkoutId: targetWorkout.id,
                    });

                    return { ok: true, id: targetWorkout.id };
                }

                const duplicateName = state.savedWorkouts.some((workout) => workout.name.toLowerCase() === normalizedName.toLowerCase());
                if (duplicateName) {
                    return { ok: false, error: 'Workout name already exists.' };
                }

                const newWorkout = createSavedWorkout(normalizedName, sanitizedConfig, nowIso);
                set({
                    savedWorkouts: [...state.savedWorkouts, newWorkout],
                });

                return { ok: true, id: newWorkout.id };
            },
            saveCurrentWorkout: (name) => {
                const state = get();
                return state.saveWorkoutFromConfig(name, toWorkoutConfig(state), state.selectedSavedWorkoutId);
            },
            saveCurrentWorkoutAs: (name) => {
                const state = get();
                return state.saveWorkoutFromConfig(name, toWorkoutConfig(state), null);
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
                    setupMode: 'workout',
                    editingSessionId: null,
                    editingSessionDraft: null,
                    editingSessionNodeId: null,
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

            createSession: (name) => {
                const normalizedName = name.trim();
                if (!normalizedName) {
                    return { ok: false, error: 'Session name is required.' };
                }

                const nowIso = new Date().toISOString();
                const session = createEmptySessionDraft(normalizedName, nowIso);
                set({
                    setupMode: 'session',
                    editingSessionId: session.id,
                    editingSessionDraft: session,
                    editingSessionNodeId: null,
                    selectedSavedSessionId: session.id,
                });

                return { ok: true, id: session.id };
            },
            saveSessionDraft: (name) => {
                const state = get();
                const draft = state.editingSessionDraft;
                if (!draft) {
                    return { ok: false, error: 'No session draft is open.' };
                }

                const normalizedName = (name ?? draft.name).trim();
                if (!normalizedName) {
                    return { ok: false, error: 'Session name is required.' };
                }

                if (!isValidSavedSession({ ...draft, name: normalizedName })) {
                    return { ok: false, error: 'Session is invalid.' };
                }

                const nowIso = new Date().toISOString();
                const nextSession = {
                    ...draft,
                    name: normalizedName,
                    updatedAt: nowIso,
                };

                const exists = state.savedSessions.some((session) => session.id === nextSession.id);
                const savedSessions = exists
                    ? state.savedSessions.map((session) => (session.id === nextSession.id ? nextSession : session))
                    : [...state.savedSessions, nextSession];

                set({
                    savedSessions,
                    editingSessionDraft: nextSession,
                    editingSessionId: nextSession.id,
                    selectedSavedSessionId: nextSession.id,
                    setupMode: 'session',
                });

                return { ok: true, id: nextSession.id };
            },
            saveSessionDraftAs: (name) => {
                const state = get();
                const draft = state.editingSessionDraft;
                if (!draft) {
                    return { ok: false, error: 'No session draft is open.' };
                }

                const normalizedName = name.trim();
                if (!normalizedName) {
                    return { ok: false, error: 'Session name is required.' };
                }

                if (!isValidSavedSession({ ...draft, name: normalizedName })) {
                    return { ok: false, error: 'Session is invalid.' };
                }

                const nowIso = new Date().toISOString();
                const session = {
                    ...draft,
                    name: normalizedName,
                    updatedAt: nowIso,
                };

                set({
                    savedSessions: [...state.savedSessions, session],
                    editingSessionId: session.id,
                    editingSessionDraft: session,
                    selectedSavedSessionId: session.id,
                    setupMode: 'session',
                });

                return { ok: true, id: session.id };
            },
            loadSessionForEditing: (id) => {
                const session = get().savedSessions.find((item) => item.id === id);
                if (!session) {
                    return { ok: false, error: 'Session not found.' };
                }

                if (session.nodes.length === 0) {
                    return { ok: false, error: 'Session needs at least one node.' };
                }

                const draft = cloneSavedSession(session);
                set({
                    selectedSavedSessionId: session.id,
                    setupMode: 'session',
                    editingSessionId: session.id,
                    editingSessionDraft: draft,
                    editingSessionNodeId: null,
                });

                return { ok: true };
            },
            renameSession: (id, name) => {
                const normalizedName = name.trim();
                if (!normalizedName) {
                    return { ok: false, error: 'Session name is required.' };
                }

                const state = get();
                const exists = state.savedSessions.some((session) => session.id !== id && session.name.toLowerCase() === normalizedName.toLowerCase());
                if (exists) {
                    return { ok: false, error: 'Session name already exists.' };
                }

                const nowIso = new Date().toISOString();
                const savedSessions = state.savedSessions.map((session) => (
                    session.id === id
                        ? { ...session, name: normalizedName, updatedAt: nowIso }
                        : session
                ));
                const editingSessionDraft = state.editingSessionDraft?.id === id
                    ? { ...state.editingSessionDraft, name: normalizedName, updatedAt: nowIso }
                    : state.editingSessionDraft;

                set({
                    savedSessions,
                    editingSessionDraft,
                });

                return { ok: true };
            },
            deleteSession: (id) => set((state) => ({
                savedSessions: state.savedSessions.filter((session) => session.id !== id),
                selectedSavedSessionId: state.selectedSavedSessionId === id ? null : state.selectedSavedSessionId,
                editingSessionId: state.editingSessionId === id ? null : state.editingSessionId,
                editingSessionDraft: state.editingSessionDraft?.id === id ? null : state.editingSessionDraft,
                editingSessionNodeId: state.editingSessionDraft?.id === id ? null : state.editingSessionNodeId,
                activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
                activeSessionNodeIndex: state.activeSessionId === id ? 0 : state.activeSessionNodeIndex,
                sessionStatus: state.activeSessionId === id ? 'idle' : state.sessionStatus,
                isRunningSession: state.activeSessionId === id ? false : state.isRunningSession,
                sessionNodeRuntimeType: state.activeSessionId === id ? null : state.sessionNodeRuntimeType,
                sessionRestTimeLeft: state.activeSessionId === id ? 0 : state.sessionRestTimeLeft,
                sessionLastTickSecond: state.activeSessionId === id ? -1 : state.sessionLastTickSecond,
                isTimerRunning: state.activeSessionId === id ? false : state.isTimerRunning,
            })),
            duplicateSession: (id, name) => {
                const state = get();
                const session = state.savedSessions.find((item) => item.id === id);
                if (!session) {
                    return { ok: false, error: 'Session not found.' };
                }

                const normalizedName = name.trim();
                if (!normalizedName) {
                    return { ok: false, error: 'Session name is required.' };
                }

                const exists = state.savedSessions.some((item) => item.name.toLowerCase() === normalizedName.toLowerCase());
                if (exists) {
                    return { ok: false, error: 'Session name already exists.' };
                }

                const nowIso = new Date().toISOString();
                const clone = cloneSavedSession(session, nowIso);
                const duplicated = { ...clone, name: normalizedName, updatedAt: nowIso };
                set({
                    savedSessions: [...state.savedSessions, duplicated],
                    selectedSavedSessionId: duplicated.id,
                    editingSessionId: duplicated.id,
                    editingSessionDraft: duplicated,
                    setupMode: 'session',
                });

                return { ok: true, id: duplicated.id };
            },

            addWorkoutNodeFromCurrentSetup: () => {
                const state = get();
                const nowIso = new Date().toISOString();
                const draft = state.editingSessionDraft ?? createEmptySessionDraft('Session', nowIso);
                const node = createWorkoutSessionNode(
                    `Workout ${draft.nodes.filter((entry) => entry.type === 'workout').length + 1}`,
                    toWorkoutConfig(state),
                    nowIso,
                    state.selectedSavedWorkoutId,
                );
                const nextDraft = {
                    ...draft,
                    nodes: [...draft.nodes, node],
                    updatedAt: nowIso,
                };
                set({
                    setupMode: 'session',
                    editingSessionDraft: nextDraft,
                    editingSessionId: nextDraft.id,
                });
                return { ok: true, id: node.id };
            },
            addWorkoutNodeFromSavedWorkout: (workoutId) => {
                const state = get();
                const workout = state.savedWorkouts.find((item) => item.id === workoutId);
                if (!workout) {
                    return { ok: false, error: 'Workout not found.' };
                }

                const nowIso = new Date().toISOString();
                const draft = state.editingSessionDraft ?? createEmptySessionDraft('Session', nowIso);
                const node = createWorkoutSessionNode(
                    workout.name,
                    sanitizeSavedWorkoutConfig(workout),
                    nowIso,
                    workout.id,
                );
                const nextDraft = {
                    ...draft,
                    nodes: [...draft.nodes, node],
                    updatedAt: nowIso,
                };
                set({
                    setupMode: 'session',
                    editingSessionDraft: nextDraft,
                    editingSessionId: nextDraft.id,
                });
                return { ok: true, id: node.id };
            },
            addRestNode: (seconds = '') => {
                const state = get();
                const nowIso = new Date().toISOString();
                const draft = state.editingSessionDraft ?? createEmptySessionDraft('Session', nowIso);
                const node = createRestSessionNode(
                    `Rest ${draft.nodes.filter((entry) => entry.type === 'rest').length + 1}`,
                    seconds,
                    nowIso,
                );
                const nextDraft = {
                    ...draft,
                    nodes: [...draft.nodes, node],
                    updatedAt: nowIso,
                };
                set({
                    setupMode: 'session',
                    editingSessionDraft: nextDraft,
                    editingSessionId: nextDraft.id,
                });
                return { ok: true, id: node.id };
            },
            updateWorkoutNode: (nodeId, config, name) => {
                const state = get();
                const draft = state.editingSessionDraft;
                if (!draft) {
                    return { ok: false, error: 'No session draft is open.' };
                }

                const nowIso = new Date().toISOString();
                const nextNodes = draft.nodes.map((node) => (
                    node.id === nodeId && isWorkoutSessionNode(node)
                        ? {
                            ...node,
                            name: name ?? node.name,
                            config: sanitizeSavedWorkoutConfig(config),
                            updatedAt: nowIso,
                        }
                        : node
                ));

                set({
                    editingSessionDraft: {
                        ...draft,
                        nodes: nextNodes,
                        updatedAt: nowIso,
                    },
                });
                return { ok: true };
            },
            updateRestNode: (nodeId, seconds, name) => {
                const state = get();
                const draft = state.editingSessionDraft;
                if (!draft) {
                    return { ok: false, error: 'No session draft is open.' };
                }

                const nowIso = new Date().toISOString();
                const nextNodes = draft.nodes.map((node) => (
                    node.id === nodeId && isRestSessionNode(node)
                        ? {
                            ...node,
                            name: name ?? node.name,
                            seconds: sanitizeRestNodeSeconds(seconds),
                            updatedAt: nowIso,
                        }
                        : node
                ));

                set({
                    editingSessionDraft: {
                        ...draft,
                        nodes: nextNodes,
                        updatedAt: nowIso,
                    },
                });
                return { ok: true };
            },
            removeSessionNode: (nodeId) => set((state) => {
                if (!state.editingSessionDraft) {
                    return state;
                }

                return {
                    editingSessionDraft: {
                        ...state.editingSessionDraft,
                        nodes: state.editingSessionDraft.nodes.filter((node) => node.id !== nodeId),
                        updatedAt: new Date().toISOString(),
                    },
                    editingSessionNodeId: state.editingSessionNodeId === nodeId ? null : state.editingSessionNodeId,
                };
            }),
            moveSessionNode: (nodeId, direction) => set((state) => {
                if (!state.editingSessionDraft) {
                    return state;
                }

                const index = state.editingSessionDraft.nodes.findIndex((node) => node.id === nodeId);
                const nextNodes = moveNodeInArray(state.editingSessionDraft.nodes, index, direction);
                return {
                    editingSessionDraft: {
                        ...state.editingSessionDraft,
                        nodes: nextNodes,
                        updatedAt: new Date().toISOString(),
                    },
                };
            }),
            moveSessionNodeToIndex: (nodeId, targetIndex) => {
                const state = get();
                const draft = state.editingSessionDraft;
                if (!draft) {
                    return { ok: false, error: 'No session draft is open.' };
                }

                const currentIndex = draft.nodes.findIndex((node) => node.id === nodeId);
                if (currentIndex === -1) {
                    return { ok: false, error: 'Node not found.' };
                }

                const normalizedTargetIndex = Math.max(0, Math.min(targetIndex, draft.nodes.length));
                if (normalizedTargetIndex === currentIndex) {
                    return { ok: true };
                }

                const nextNodes = [...draft.nodes];
                const [movedNode] = nextNodes.splice(currentIndex, 1);
                const adjustedTargetIndex = normalizedTargetIndex > currentIndex
                    ? normalizedTargetIndex - 1
                    : normalizedTargetIndex;
                nextNodes.splice(adjustedTargetIndex, 0, movedNode);

                set({
                    editingSessionDraft: {
                        ...draft,
                        nodes: nextNodes,
                        updatedAt: new Date().toISOString(),
                    },
                });

                return { ok: true };
            },
            insertSessionNodeAfter: (afterNodeId, node) => set((state) => {
                if (!state.editingSessionDraft) {
                    const nowIso = new Date().toISOString();
                    const draft = createEmptySessionDraft('Session', nowIso);
                    return {
                        editingSessionDraft: {
                            ...draft,
                            nodes: [cloneSessionNode(node)],
                            updatedAt: nowIso,
                        },
                        editingSessionId: draft.id,
                        setupMode: 'session',
                    };
                }

                const nowIso = new Date().toISOString();
                const nodes = [...state.editingSessionDraft.nodes];
                if (afterNodeId === null) {
                    nodes.unshift(cloneSessionNode(node));
                } else {
                    const index = nodes.findIndex((entry) => entry.id === afterNodeId);
                    if (index === -1) {
                        nodes.push(cloneSessionNode(node));
                    } else {
                        nodes.splice(index + 1, 0, cloneSessionNode(node));
                    }
                }

                return {
                    editingSessionDraft: {
                        ...state.editingSessionDraft,
                        nodes,
                        updatedAt: nowIso,
                    },
                };
            }),
            setEditingSessionNodeId: (nodeId) => set({ editingSessionNodeId: nodeId }),
            replaceWorkoutNodeWithSavedWorkout: (nodeId, workoutId) => {
                const state = get();
                const draft = state.editingSessionDraft;
                if (!draft) {
                    return { ok: false, error: 'No session draft is open.' };
                }

                const workout = state.savedWorkouts.find((item) => item.id === workoutId);
                if (!workout) {
                    return { ok: false, error: 'Workout not found.' };
                }

                const nowIso = new Date().toISOString();
                const nextNodes = draft.nodes.map((node) => (
                    node.id === nodeId && isWorkoutSessionNode(node)
                        ? {
                            ...node,
                            name: workout.name,
                            config: sanitizeSavedWorkoutConfig(workout),
                            sourceWorkoutId: workout.id,
                            updatedAt: nowIso,
                        }
                        : node
                ));

                set({
                    editingSessionDraft: {
                        ...draft,
                        nodes: nextNodes,
                        updatedAt: nowIso,
                    },
                    selectedSavedWorkoutId: workout.id,
                });

                return { ok: true };
            },

            startSession: (id) => {
                const session = get().savedSessions.find((item) => item.id === id) ?? get().editingSessionDraft;
                if (!session) {
                    return { ok: false, error: 'Session not found.' };
                }

                if (!isValidSavedSession(session)) {
                    return { ok: false, error: 'Session is invalid.' };
                }

                const nowIso = new Date().toISOString();
                const nextSession = {
                    ...session,
                    timesUsed: session.timesUsed + 1,
                    lastUsedAt: nowIso,
                    updatedAt: nowIso,
                };
                const nextSessions = get().savedSessions.map((item) => (item.id === nextSession.id ? nextSession : item));
                if (!get().savedSessions.some((item) => item.id === nextSession.id)) {
                    nextSessions.push(nextSession);
                }

                set({
                    savedSessions: nextSessions,
                    selectedSavedSessionId: nextSession.id,
                    activeSessionId: nextSession.id,
                    activeSessionNodeIndex: 0,
                    sessionStatus: 'running',
                    isRunningSession: true,
                    setupMode: 'session',
                    editingSessionId: nextSession.id,
                    editingSessionDraft: nextSession,
                    editingSessionNodeId: null,
                });

                get().startSessionNode(0);
                return { ok: true };
            },
            pauseSession: () => set((state) => ({
                sessionStatus: state.sessionStatus === 'running' ? 'paused' : state.sessionStatus,
                isTimerRunning: false,
                isRunningSession: false,
            })),
            resumeSession: () => set((state) => ({
                sessionStatus: state.sessionStatus === 'paused' ? 'running' : state.sessionStatus,
                isTimerRunning: true,
                isRunningSession: state.activeSessionId ? true : state.isRunningSession,
            })),
            resetSession: () => set({
                activeSessionId: null,
                activeSessionNodeIndex: 0,
                sessionStatus: 'idle',
                isRunningSession: false,
                sessionNodeRuntimeType: null,
                sessionRestTimeLeft: 0,
                sessionLastTickSecond: -1,
                isTimerRunning: false,
                timeLeft: 0,
                setElapsedTime: 0,
                lastTickSecond: -1,
            }),
            advanceSessionNode: () => {
                const state = get();
                const session = state.savedSessions.find((item) => item.id === state.activeSessionId) ?? state.editingSessionDraft;
                if (!session) {
                    set({
                        sessionStatus: 'idle',
                        isRunningSession: false,
                        isTimerRunning: false,
                        timerStatus: 'Ready',
                        sessionNodeRuntimeType: null,
                        sessionRestTimeLeft: 0,
                        sessionLastTickSecond: -1,
                        activeSessionId: null,
                        activeSessionNodeIndex: 0,
                        timeLeft: 0,
                        setElapsedTime: 0,
                        lastTickSecond: -1,
                    });
                    return;
                }

                const nextIndex = state.activeSessionNodeIndex + 1;
                if (nextIndex >= session.nodes.length) {
                    set({
                        sessionStatus: 'finished',
                        isRunningSession: false,
                        isTimerRunning: false,
                        sessionNodeRuntimeType: null,
                        activeSessionNodeIndex: session.nodes.length,
                        timerStatus: 'Finished',
                        timeLeft: 0,
                        setElapsedTime: 0,
                        sessionRestTimeLeft: 0,
                    });
                    return;
                }

                get().startSessionNode(nextIndex);
            },
            startSessionNode: (index) => {
                const state = get();
                const session = state.savedSessions.find((item) => item.id === state.activeSessionId) ?? state.editingSessionDraft;
                if (!session || index < 0 || index >= session.nodes.length) {
                    set({ sessionStatus: 'finished', isRunningSession: false, sessionNodeRuntimeType: null });
                    return;
                }

                const node = session.nodes[index];
                if (node.type === 'workout') {
                    const workoutDuration = parseInt(node.config.reps, 10) * parseInt(node.config.seconds, 10);
                    set({
                        ...node.config,
                        currentSet: 1,
                        currentRep: 1,
                        isMainRep: true,
                        isWorking: true,
                        setTotalDuration: workoutDuration,
                        setElapsedTime: 0,
                        appPhase: 'timer',
                        timerStatus: 'Main Set',
                        timeLeft: parseInt(node.config.seconds, 10),
                        isTimerRunning: true,
                        setupMode: 'session',
                        lastTickSecond: -1,
                        activeSessionId: session.id,
                        activeSessionNodeIndex: index,
                        selectedSavedSessionId: session.id,
                        sessionStatus: 'running',
                        isRunningSession: true,
                        sessionNodeRuntimeType: 'workout',
                        sessionRestTimeLeft: 0,
                        sessionLastTickSecond: -1,
                    });
                    return;
                }

                const restSeconds = parseInt(node.seconds, 10);
                set({
                    appPhase: 'timer',
                    timerStatus: 'Resting',
                    isTimerRunning: true,
                    isWorking: false,
                    timeLeft: restSeconds,
                    setTotalDuration: restSeconds,
                    setElapsedTime: 0,
                    setupMode: 'session',
                    lastTickSecond: -1,
                    activeSessionId: session.id,
                    activeSessionNodeIndex: index,
                    selectedSavedSessionId: session.id,
                    sessionStatus: 'running',
                    isRunningSession: true,
                    sessionNodeRuntimeType: 'rest',
                    sessionRestTimeLeft: restSeconds,
                    sessionLastTickSecond: -1,
                });
            },
            completeSessionNode: () => {
                get().advanceSessionNode();
            },
            setSessionRestTimeLeft: (time) => set({ sessionRestTimeLeft: time }),
            setSessionLastTickSecond: (sec) => set({ sessionLastTickSecond: sec }),

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
                        setupMode: 'workout',
                        lastTickSecond: -1,
                        isRunningSession: false,
                        sessionStatus: 'idle',
                        sessionNodeRuntimeType: null,
                        activeSessionId: null,
                        activeSessionNodeIndex: 0,
                        sessionRestTimeLeft: 0,
                        sessionLastTickSecond: -1,
                    });
                }
            },

            resetWorkout: () => set({
                isTimerRunning: false,
                appPhase: 'setup',
                timerStatus: 'Ready',
                lastTickSecond: -1,
                isRunningSession: false,
                sessionStatus: 'idle',
                sessionNodeRuntimeType: null,
                activeSessionId: null,
                activeSessionNodeIndex: 0,
                sessionRestTimeLeft: 0,
                sessionLastTickSecond: -1,
            }),

            setIsTimerRunning: (running: boolean) => set((state) => ({
                isTimerRunning: running,
                sessionStatus: state.activeSessionId ? (running ? 'running' : 'paused') : state.sessionStatus,
                isRunningSession: state.activeSessionId ? running : state.isRunningSession,
            })),
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
                const isSessionRunning = Boolean(state.activeSessionId) && state.isRunningSession;

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
                        } else if (isSessionRunning) {
                            set({
                                isTimerRunning: false,
                                lastTickSecond: -1,
                                sessionNodeRuntimeType: null,
                            });
                            get().advanceSessionNode();
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
                    } else if (isSessionRunning) {
                        set({
                            isTimerRunning: false,
                            lastTickSecond: -1,
                            sessionNodeRuntimeType: null,
                        });
                        get().advanceSessionNode();
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
                savedSessions: state.savedSessions,
                selectedSavedSessionId: state.selectedSavedSessionId,
                setupMode: state.setupMode,
                editingSessionId: state.editingSessionId,
                editingSessionDraft: state.editingSessionDraft,
            }),
        },
    ),
);

