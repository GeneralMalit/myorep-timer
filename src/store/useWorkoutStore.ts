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
    createSavedSession,
    createWorkoutSessionNode,
    isValidSavedSession,
    moveNodeInArray,
    sanitizeRestNodeSeconds,
} from '@/utils/savedSessions';
import { markSyncDeleted, normalizeSyncMetadata, touchSyncMetadata } from '@/utils/sync';
import { useSyncStore } from '@/store/useSyncStore';

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

const createEmptySessionDraft = (name: string, nowIso: string): SavedSession => createSavedSession(name.trim() || 'Session', [], nowIso);

const isWorkoutSessionNode = (node: SessionNode | undefined): node is WorkoutSessionNode => {
    return node !== undefined && node.type === 'workout';
};

const isRestSessionNode = (node: SessionNode | undefined): node is RestSessionNode => {
    return node !== undefined && node.type === 'rest';
};

const enqueueSyncChangeIfEnabled = (params: {
    entityType: 'workout' | 'session';
    entityId: string;
    localId: string;
    operation: 'upsert' | 'delete';
    revision: number;
    queuedAt?: string;
}) => {
    const syncState = useSyncStore.getState();
    if (!syncState.syncEnabled) {
        return;
    }

    syncState.enqueueEntityChange(params);
};

const WORKOUT_STORE_PERSIST_VERSION = 2;

type PersistedWorkoutStoreState = {
    settings: WorkoutSettings;
    sets: string;
    reps: string;
    seconds: string;
    rest: string;
    myoReps: string;
    myoWorkSecs: string;
    savedWorkouts: SavedWorkout[];
    selectedSavedWorkoutId: string | null;
    savedSessions: SavedSession[];
    selectedSavedSessionId: string | null;
    setupMode: 'workout' | 'session';
    theme: string;
};

const createDefaultPersistedWorkoutState = (): PersistedWorkoutStoreState => ({
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
        upDownMode: false,
        infoVisibility: 'always',
        soundMode: 'metronome',
        ttsEnabled: true,
        pulseEffect: 'always',
        finishedColor: '#4caf50',
    },
    sets: '',
    reps: '',
    seconds: '',
    rest: '',
    myoReps: '',
    myoWorkSecs: '',
    savedWorkouts: [],
    selectedSavedWorkoutId: null,
    savedSessions: [],
    selectedSavedSessionId: null,
    setupMode: 'workout',
    theme: 'theme-default',
});

const normalizePersistedWorkout = (workout: SavedWorkout, nowIso: string): SavedWorkout => ({
    ...workout,
    sync: normalizeSyncMetadata(workout.sync, workout.id, nowIso),
});

const normalizePersistedSession = (session: SavedSession, nowIso: string): SavedSession => ({
    ...session,
    sync: normalizeSyncMetadata(session.sync, session.id, nowIso),
});

const persistWorkoutStoreState = (state: WorkoutState): PersistedWorkoutStoreState => ({
    settings: state.settings,
    sets: state.sets,
    reps: state.reps,
    seconds: state.seconds,
    rest: state.rest,
    myoReps: state.myoReps,
    myoWorkSecs: state.myoWorkSecs,
    savedWorkouts: state.savedWorkouts,
    selectedSavedWorkoutId: state.selectedSavedWorkoutId,
    savedSessions: state.savedSessions,
    selectedSavedSessionId: state.selectedSavedSessionId,
    setupMode: state.setupMode,
    theme: state.theme,
});

const migratePersistedWorkoutStoreState = (persistedState: unknown): PersistedWorkoutStoreState => {
    const defaults = createDefaultPersistedWorkoutState();
    if (!persistedState || typeof persistedState !== 'object') {
        return defaults;
    }

    const state = persistedState as Partial<PersistedWorkoutStoreState> & Record<string, unknown>;
    const persistedSettings = state.settings && typeof state.settings === 'object'
        ? state.settings as Partial<WorkoutSettings> & Record<string, unknown>
        : {};
    const settings = {
        ...defaults.settings,
        activeColor: typeof persistedSettings.activeColor === 'string' ? persistedSettings.activeColor : defaults.settings.activeColor,
        restColor: typeof persistedSettings.restColor === 'string' ? persistedSettings.restColor : defaults.settings.restColor,
        concentricColor: typeof persistedSettings.concentricColor === 'string' ? persistedSettings.concentricColor : defaults.settings.concentricColor,
        concentricSecond: typeof persistedSettings.concentricSecond === 'number' ? persistedSettings.concentricSecond : defaults.settings.concentricSecond,
        smoothAnimation: typeof persistedSettings.smoothAnimation === 'boolean' ? persistedSettings.smoothAnimation : defaults.settings.smoothAnimation,
        prepTime: typeof persistedSettings.prepTime === 'number' ? persistedSettings.prepTime : defaults.settings.prepTime,
        fullScreenMode: typeof persistedSettings.fullScreenMode === 'boolean' ? persistedSettings.fullScreenMode : defaults.settings.fullScreenMode,
        metronomeEnabled: typeof persistedSettings.metronomeEnabled === 'boolean' ? persistedSettings.metronomeEnabled : defaults.settings.metronomeEnabled,
        metronomeSound: typeof persistedSettings.metronomeSound === 'string' ? persistedSettings.metronomeSound : defaults.settings.metronomeSound,
        upDownMode: typeof persistedSettings.upDownMode === 'boolean' ? persistedSettings.upDownMode : defaults.settings.upDownMode,
        infoVisibility: persistedSettings.infoVisibility === 'resting' || persistedSettings.infoVisibility === 'never' || persistedSettings.infoVisibility === 'always'
            ? persistedSettings.infoVisibility
            : defaults.settings.infoVisibility,
        soundMode: persistedSettings.soundMode === 'tts' || persistedSettings.soundMode === 'metronome'
            ? persistedSettings.soundMode
            : defaults.settings.soundMode,
        ttsEnabled: typeof persistedSettings.ttsEnabled === 'boolean' ? persistedSettings.ttsEnabled : defaults.settings.ttsEnabled,
        pulseEffect: persistedSettings.pulseEffect === 'resting' || persistedSettings.pulseEffect === 'never' || persistedSettings.pulseEffect === 'always'
            ? persistedSettings.pulseEffect
            : defaults.settings.pulseEffect,
        finishedColor: typeof persistedSettings.finishedColor === 'string' ? persistedSettings.finishedColor : defaults.settings.finishedColor,
    };
    const sets = typeof state.sets === 'string' ? normalizeSetsInput(state.sets) : defaults.sets;
    const reps = typeof state.reps === 'string' ? state.reps : defaults.reps;
    const seconds = typeof state.seconds === 'string' ? state.seconds : defaults.seconds;
    const rest = typeof state.rest === 'string' ? state.rest : defaults.rest;
    const myoReps = typeof state.myoReps === 'string' ? state.myoReps : defaults.myoReps;
    const myoWorkSecs = typeof state.myoWorkSecs === 'string' ? state.myoWorkSecs : defaults.myoWorkSecs;
    const limit = getConcentricLimitFromPaces(seconds, myoWorkSecs);
    const nowIso = new Date().toISOString();
    const savedWorkouts = Array.isArray(state.savedWorkouts)
        ? (state.savedWorkouts as SavedWorkout[]).map((workout) => normalizePersistedWorkout(workout, nowIso))
        : defaults.savedWorkouts;
    const savedSessions = Array.isArray(state.savedSessions)
        ? (state.savedSessions as SavedSession[]).map((session) => normalizePersistedSession(session, nowIso))
        : defaults.savedSessions;
    const selectedSavedWorkoutId = typeof state.selectedSavedWorkoutId === 'string' && savedWorkouts.some((workout) => workout.id === state.selectedSavedWorkoutId)
        ? state.selectedSavedWorkoutId
        : defaults.selectedSavedWorkoutId;
    const selectedSavedSessionId = typeof state.selectedSavedSessionId === 'string' && savedSessions.some((session) => session.id === state.selectedSavedSessionId)
        ? state.selectedSavedSessionId
        : defaults.selectedSavedSessionId;

    return {
        settings: {
            ...settings,
            concentricSecond: clampConcentricSecond(settings.concentricSecond, limit),
        },
        sets,
        reps,
        seconds,
        rest,
        myoReps,
        myoWorkSecs,
        savedWorkouts,
        selectedSavedWorkoutId,
        savedSessions,
        selectedSavedSessionId,
        setupMode: state.setupMode === 'session' ? 'session' : defaults.setupMode,
        theme: typeof state.theme === 'string' && state.theme.trim() ? state.theme : defaults.theme,
    };
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
    upDownMode: boolean;
    infoVisibility: 'always' | 'resting' | 'never';
    soundMode: 'metronome' | 'tts';
    ttsEnabled: boolean;
    pulseEffect: 'always' | 'resting' | 'never';
    finishedColor: string;
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
    completedSessionWorkoutNodeIds: string[];

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
    recordSessionUsed: (id: string) => void;
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
    updateWorkoutNode: (nodeId: string, config: SavedWorkoutConfig, name?: string, notes?: string) => { ok: boolean; error?: string };
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
    clearCompletedSessionWorkoutNodeIds: () => void;
    recordCompletedSessionWorkoutNode: (nodeId: string) => void;
    startWorkout: () => void;
    resetWorkout: () => void;
    setIsTimerRunning: (running: boolean) => void;
    setTimeLeft: (time: number) => void;
    setSetElapsedTime: (time: number) => void;
    setLastTickSecond: (sec: number) => void;
    advanceCycle: () => void;
    updateTimerBaselines: (timeLeft: number, setElapsed: number) => void;
    replaceLibrariesFromSync: (params: { workouts: SavedWorkout[]; sessions: SavedSession[] }) => void;
    acknowledgeSyncedWorkout: (workout: SavedWorkout) => void;
    acknowledgeSyncedSession: (session: SavedSession) => void;
    purgeDeletedWorkout: (id: string) => void;
    purgeDeletedSession: (id: string) => void;
}

export const useWorkoutStore = create<WorkoutState>()(
    persist(
        (set, get) => ({
            ...createDefaultPersistedWorkoutState(),
            lastImportSummary: null,
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
            completedSessionWorkoutNodeIds: [],
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
                    const nextWorkout = {
                        ...targetWorkout,
                        name: normalizedName,
                        ...sanitizedConfig,
                        updatedAt: nowIso,
                        sync: touchSyncMetadata(targetWorkout.sync, targetWorkout.id, nowIso),
                    };
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
                                ? nextWorkout
                                : workout
                        )),
                        selectedSavedWorkoutId: targetWorkout.id,
                    });
                    enqueueSyncChangeIfEnabled({
                        entityType: 'workout',
                        entityId: targetWorkout.id,
                        localId: nextWorkout.sync.localId,
                        operation: 'upsert',
                        revision: nextWorkout.sync.revision,
                        queuedAt: nowIso,
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
                enqueueSyncChangeIfEnabled({
                    entityType: 'workout',
                    entityId: newWorkout.id,
                    localId: newWorkout.sync.localId,
                    operation: 'upsert',
                    revision: newWorkout.sync.revision,
                    queuedAt: nowIso,
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
                const nextWorkout = state.savedWorkouts.find((workout) => workout.id === id);
                if (!nextWorkout) {
                    return { ok: false, error: 'Workout not found.' };
                }
                const updatedWorkout = {
                    ...nextWorkout,
                    name: normalizedName,
                    updatedAt: nowIso,
                    sync: touchSyncMetadata(nextWorkout.sync, nextWorkout.id, nowIso),
                };
                set({
                    savedWorkouts: state.savedWorkouts.map((workout) => (
                        workout.id === id
                            ? updatedWorkout
                            : workout
                    )),
                });
                enqueueSyncChangeIfEnabled({
                    entityType: 'workout',
                    entityId: id,
                    localId: updatedWorkout.sync.localId,
                    operation: 'upsert',
                    revision: updatedWorkout.sync.revision,
                    queuedAt: nowIso,
                });

                return { ok: true };
            },
            deleteWorkout: (id) => set((state) => {
                const workout = state.savedWorkouts.find((entry) => entry.id === id);
                if (!workout) {
                    return state;
                }

                if (!useSyncStore.getState().syncEnabled) {
                    return {
                        savedWorkouts: state.savedWorkouts.filter((entry) => entry.id !== id),
                        selectedSavedWorkoutId: state.selectedSavedWorkoutId === id ? null : state.selectedSavedWorkoutId,
                    };
                }

                const nowIso = new Date().toISOString();
                const deletedWorkout = {
                    ...workout,
                    updatedAt: nowIso,
                    sync: markSyncDeleted(workout.sync, workout.id, nowIso),
                };
                enqueueSyncChangeIfEnabled({
                    entityType: 'workout',
                    entityId: id,
                    localId: deletedWorkout.sync.localId,
                    operation: 'delete',
                    revision: deletedWorkout.sync.revision,
                    queuedAt: nowIso,
                });

                return {
                    savedWorkouts: state.savedWorkouts.map((entry) => (
                        entry.id === id ? deletedWorkout : entry
                    )),
                    selectedSavedWorkoutId: state.selectedSavedWorkoutId === id ? null : state.selectedSavedWorkoutId,
                };
            }),
            recordWorkoutUsed: (id) => set((state) => {
                const nowIso = new Date().toISOString();
                let updatedWorkout: SavedWorkout | null = null;
                const savedWorkouts = state.savedWorkouts.map((workout) => {
                    if (workout.id !== id) {
                        return workout;
                    }

                    updatedWorkout = {
                        ...workout,
                        timesUsed: workout.timesUsed + 1,
                        lastUsedAt: nowIso,
                        updatedAt: nowIso,
                        sync: touchSyncMetadata(workout.sync, workout.id, nowIso),
                    };
                    return updatedWorkout;
                });
                if (updatedWorkout) {
                    enqueueSyncChangeIfEnabled({
                        entityType: 'workout',
                        entityId: id,
                        localId: updatedWorkout.sync.localId,
                        operation: 'upsert',
                        revision: updatedWorkout.sync.revision,
                        queuedAt: nowIso,
                    });
                }
                return {
                    savedWorkouts,
                };
            }),
            recordSessionUsed: (id) => set((state) => {
                const nowIso = new Date().toISOString();
                let updatedSession: SavedSession | null = null;
                const savedSessions = state.savedSessions.map((session) => {
                    if (session.id !== id) {
                        return session;
                    }

                    updatedSession = {
                        ...session,
                        timesUsed: session.timesUsed + 1,
                        lastUsedAt: nowIso,
                        updatedAt: nowIso,
                        sync: touchSyncMetadata(session.sync, session.id, nowIso),
                    };
                    return updatedSession;
                });
                const editingSessionDraft = state.editingSessionDraft?.id === id
                    ? {
                        ...state.editingSessionDraft,
                        timesUsed: state.editingSessionDraft.timesUsed + 1,
                        lastUsedAt: nowIso,
                        updatedAt: nowIso,
                        sync: touchSyncMetadata(state.editingSessionDraft.sync, state.editingSessionDraft.id, nowIso),
                    }
                    : state.editingSessionDraft;
                if (updatedSession) {
                    enqueueSyncChangeIfEnabled({
                        entityType: 'session',
                        entityId: id,
                        localId: updatedSession.sync.localId,
                        operation: 'upsert',
                        revision: updatedSession.sync.revision,
                        queuedAt: nowIso,
                    });
                }
                return {
                    savedSessions,
                    editingSessionDraft,
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

                const state = get();
                const exists = state.savedSessions.some((session) => session.name.toLowerCase() === normalizedName.toLowerCase());
                if (exists) {
                    return { ok: false, error: 'Session name already exists.' };
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
                    sync: touchSyncMetadata(draft.sync, draft.id, nowIso),
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
                enqueueSyncChangeIfEnabled({
                    entityType: 'session',
                    entityId: nextSession.id,
                    localId: nextSession.sync.localId,
                    operation: 'upsert',
                    revision: nextSession.sync.revision,
                    queuedAt: nowIso,
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
                    sync: touchSyncMetadata(draft.sync, draft.id, nowIso),
                };

                set({
                    savedSessions: [...state.savedSessions, session],
                    editingSessionId: session.id,
                    editingSessionDraft: session,
                    selectedSavedSessionId: session.id,
                    setupMode: 'session',
                });
                enqueueSyncChangeIfEnabled({
                    entityType: 'session',
                    entityId: session.id,
                    localId: session.sync.localId,
                    operation: 'upsert',
                    revision: session.sync.revision,
                    queuedAt: nowIso,
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
                        ? { ...session, name: normalizedName, updatedAt: nowIso, sync: touchSyncMetadata(session.sync, session.id, nowIso) }
                        : session
                ));
                const editingSessionDraft = state.editingSessionDraft?.id === id
                    ? {
                        ...state.editingSessionDraft,
                        name: normalizedName,
                        updatedAt: nowIso,
                        sync: touchSyncMetadata(state.editingSessionDraft.sync, state.editingSessionDraft.id, nowIso),
                    }
                    : state.editingSessionDraft;

                set({
                    savedSessions,
                    editingSessionDraft,
                });
                const updatedSession = savedSessions.find((session) => session.id === id);
                if (updatedSession) {
                    enqueueSyncChangeIfEnabled({
                        entityType: 'session',
                        entityId: id,
                        localId: updatedSession.sync.localId,
                        operation: 'upsert',
                        revision: updatedSession.sync.revision,
                        queuedAt: nowIso,
                    });
                }

                return { ok: true };
            },
            deleteSession: (id) => set((state) => {
                const session = state.savedSessions.find((entry) => entry.id === id);
                if (!session) {
                    return state;
                }

                const baseState = {
                    selectedSavedSessionId: state.selectedSavedSessionId === id ? null : state.selectedSavedSessionId,
                    editingSessionId: state.editingSessionId === id ? null : state.editingSessionId,
                    editingSessionDraft: state.editingSessionDraft?.id === id ? null : state.editingSessionDraft,
                    editingSessionNodeId: state.editingSessionDraft?.id === id ? null : state.editingSessionNodeId,
                    activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
                    activeSessionNodeIndex: state.activeSessionId === id ? 0 : state.activeSessionNodeIndex,
                    sessionStatus: state.activeSessionId === id ? 'idle' as SessionStatus : state.sessionStatus,
                    isRunningSession: state.activeSessionId === id ? false : state.isRunningSession,
                    sessionNodeRuntimeType: state.activeSessionId === id ? null : state.sessionNodeRuntimeType,
                    sessionRestTimeLeft: state.activeSessionId === id ? 0 : state.sessionRestTimeLeft,
                    sessionLastTickSecond: state.activeSessionId === id ? -1 : state.sessionLastTickSecond,
                    isTimerRunning: state.activeSessionId === id ? false : state.isTimerRunning,
                };

                if (!useSyncStore.getState().syncEnabled) {
                    return {
                        ...baseState,
                        savedSessions: state.savedSessions.filter((entry) => entry.id !== id),
                    };
                }

                const nowIso = new Date().toISOString();
                const deletedSession = {
                    ...session,
                    updatedAt: nowIso,
                    sync: markSyncDeleted(session.sync, session.id, nowIso),
                };
                enqueueSyncChangeIfEnabled({
                    entityType: 'session',
                    entityId: id,
                    localId: deletedSession.sync.localId,
                    operation: 'delete',
                    revision: deletedSession.sync.revision,
                    queuedAt: nowIso,
                });

                return {
                    ...baseState,
                    savedSessions: state.savedSessions.map((entry) => (
                        entry.id === id ? deletedSession : entry
                    )),
                };
            }),
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
                const duplicated = {
                    ...clone,
                    name: normalizedName,
                    updatedAt: nowIso,
                    sync: touchSyncMetadata(clone.sync, clone.id, nowIso),
                };
                set({
                    savedSessions: [...state.savedSessions, duplicated],
                    selectedSavedSessionId: duplicated.id,
                    editingSessionId: duplicated.id,
                    editingSessionDraft: duplicated,
                    setupMode: 'session',
                });
                enqueueSyncChangeIfEnabled({
                    entityType: 'session',
                    entityId: duplicated.id,
                    localId: duplicated.sync.localId,
                    operation: 'upsert',
                    revision: duplicated.sync.revision,
                    queuedAt: nowIso,
                });

                return { ok: true, id: duplicated.id };
            },

            addWorkoutNodeFromCurrentSetup: () => {
                const state = get();
                const nowIso = new Date().toISOString();
                const draft = state.editingSessionDraft ?? createEmptySessionDraft('Session', nowIso);
                const nodeName = `Workout ${draft.nodes.filter((entry) => entry.type === 'workout').length + 1}`;
                const currentConfig = sanitizeSavedWorkoutConfig(toWorkoutConfig(state));

                const node = createWorkoutSessionNode(
                    nodeName,
                    currentConfig,
                    nowIso,
                    null,
                );
                const nextDraft = {
                    ...draft,
                    nodes: [...draft.nodes, node],
                    updatedAt: nowIso,
                    sync: touchSyncMetadata(draft.sync, draft.id, nowIso),
                };
                set({
                    setupMode: 'session',
                    editingSessionDraft: nextDraft,
                    editingSessionId: nextDraft.id,
                });
                enqueueSyncChangeIfEnabled({
                    entityType: 'session',
                    entityId: nextDraft.id,
                    localId: nextDraft.sync.localId,
                    operation: 'upsert',
                    revision: nextDraft.sync.revision,
                    queuedAt: nowIso,
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
                    sync: touchSyncMetadata(draft.sync, draft.id, nowIso),
                };
                set({
                    setupMode: 'session',
                    editingSessionDraft: nextDraft,
                    editingSessionId: nextDraft.id,
                });
                enqueueSyncChangeIfEnabled({
                    entityType: 'session',
                    entityId: nextDraft.id,
                    localId: nextDraft.sync.localId,
                    operation: 'upsert',
                    revision: nextDraft.sync.revision,
                    queuedAt: nowIso,
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
                    sync: touchSyncMetadata(draft.sync, draft.id, nowIso),
                };
                set({
                    setupMode: 'session',
                    editingSessionDraft: nextDraft,
                    editingSessionId: nextDraft.id,
                });
                enqueueSyncChangeIfEnabled({
                    entityType: 'session',
                    entityId: nextDraft.id,
                    localId: nextDraft.sync.localId,
                    operation: 'upsert',
                    revision: nextDraft.sync.revision,
                    queuedAt: nowIso,
                });
                return { ok: true, id: node.id };
            },
            updateWorkoutNode: (nodeId, config, name, notes) => {
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
                            notes: notes ?? node.notes ?? '',
                            config: sanitizeSavedWorkoutConfig(config),
                            updatedAt: nowIso,
                        }
                        : node
                ));

                const nextDraft = {
                    ...draft,
                    nodes: nextNodes,
                    updatedAt: nowIso,
                    sync: touchSyncMetadata(draft.sync, draft.id, nowIso),
                };
                set({
                    editingSessionDraft: nextDraft,
                });
                enqueueSyncChangeIfEnabled({
                    entityType: 'session',
                    entityId: nextDraft.id,
                    localId: nextDraft.sync.localId,
                    operation: 'upsert',
                    revision: nextDraft.sync.revision,
                    queuedAt: nowIso,
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

                const nextDraft = {
                    ...draft,
                    nodes: nextNodes,
                    updatedAt: nowIso,
                    sync: touchSyncMetadata(draft.sync, draft.id, nowIso),
                };
                set({
                    editingSessionDraft: nextDraft,
                });
                enqueueSyncChangeIfEnabled({
                    entityType: 'session',
                    entityId: nextDraft.id,
                    localId: nextDraft.sync.localId,
                    operation: 'upsert',
                    revision: nextDraft.sync.revision,
                    queuedAt: nowIso,
                });
                return { ok: true };
            },
            removeSessionNode: (nodeId) => set((state) => {
                if (!state.editingSessionDraft) {
                    return state;
                }

                const nowIso = new Date().toISOString();
                const nextDraft = {
                    ...state.editingSessionDraft,
                    nodes: state.editingSessionDraft.nodes.filter((node) => node.id !== nodeId),
                    updatedAt: nowIso,
                    sync: touchSyncMetadata(state.editingSessionDraft.sync, state.editingSessionDraft.id, nowIso),
                };
                enqueueSyncChangeIfEnabled({
                    entityType: 'session',
                    entityId: nextDraft.id,
                    localId: nextDraft.sync.localId,
                    operation: 'upsert',
                    revision: nextDraft.sync.revision,
                    queuedAt: nowIso,
                });
                return {
                    editingSessionDraft: nextDraft,
                    editingSessionNodeId: state.editingSessionNodeId === nodeId ? null : state.editingSessionNodeId,
                };
            }),
            moveSessionNode: (nodeId, direction) => set((state) => {
                if (!state.editingSessionDraft) {
                    return state;
                }

                const index = state.editingSessionDraft.nodes.findIndex((node) => node.id === nodeId);
                const nextNodes = moveNodeInArray(state.editingSessionDraft.nodes, index, direction);
                const nowIso = new Date().toISOString();
                const nextDraft = {
                    ...state.editingSessionDraft,
                    nodes: nextNodes,
                    updatedAt: nowIso,
                    sync: touchSyncMetadata(state.editingSessionDraft.sync, state.editingSessionDraft.id, nowIso),
                };
                enqueueSyncChangeIfEnabled({
                    entityType: 'session',
                    entityId: nextDraft.id,
                    localId: nextDraft.sync.localId,
                    operation: 'upsert',
                    revision: nextDraft.sync.revision,
                    queuedAt: nowIso,
                });
                return {
                    editingSessionDraft: nextDraft,
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

                const nowIso = new Date().toISOString();
                const nextDraft = {
                    ...draft,
                    nodes: nextNodes,
                    updatedAt: nowIso,
                    sync: touchSyncMetadata(draft.sync, draft.id, nowIso),
                };
                set({
                    editingSessionDraft: nextDraft,
                });
                enqueueSyncChangeIfEnabled({
                    entityType: 'session',
                    entityId: nextDraft.id,
                    localId: nextDraft.sync.localId,
                    operation: 'upsert',
                    revision: nextDraft.sync.revision,
                    queuedAt: nowIso,
                });

                return { ok: true };
            },
            insertSessionNodeAfter: (afterNodeId, node) => set((state) => {
                if (!state.editingSessionDraft) {
                    const nowIso = new Date().toISOString();
                    const draft = createEmptySessionDraft('Session', nowIso);
                    const nextDraft = {
                        ...draft,
                        nodes: [cloneSessionNode(node)],
                        updatedAt: nowIso,
                    };
                    enqueueSyncChangeIfEnabled({
                        entityType: 'session',
                        entityId: nextDraft.id,
                        localId: nextDraft.sync.localId,
                        operation: 'upsert',
                        revision: nextDraft.sync.revision,
                        queuedAt: nowIso,
                    });
                    return {
                        editingSessionDraft: nextDraft,
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

                const nextDraft = {
                    ...state.editingSessionDraft,
                    nodes,
                    updatedAt: nowIso,
                    sync: touchSyncMetadata(state.editingSessionDraft.sync, state.editingSessionDraft.id, nowIso),
                };
                enqueueSyncChangeIfEnabled({
                    entityType: 'session',
                    entityId: nextDraft.id,
                    localId: nextDraft.sync.localId,
                    operation: 'upsert',
                    revision: nextDraft.sync.revision,
                    queuedAt: nowIso,
                });

                return {
                    editingSessionDraft: nextDraft,
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
                            notes: node.notes ?? '',
                            config: sanitizeSavedWorkoutConfig(workout),
                            sourceWorkoutId: workout.id,
                            updatedAt: nowIso,
                        }
                        : node
                ));

                const nextDraft = {
                    ...draft,
                    nodes: nextNodes,
                    updatedAt: nowIso,
                    sync: touchSyncMetadata(draft.sync, draft.id, nowIso),
                };
                set({
                    editingSessionDraft: nextDraft,
                    selectedSavedWorkoutId: workout.id,
                });
                enqueueSyncChangeIfEnabled({
                    entityType: 'session',
                    entityId: nextDraft.id,
                    localId: nextDraft.sync.localId,
                    operation: 'upsert',
                    revision: nextDraft.sync.revision,
                    queuedAt: nowIso,
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

                const nextSession = cloneSavedSession(session);
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
                    appPhase: 'timer',
                    timerStatus: 'Preparing',
                    isTimerRunning: true,
                    isWorking: false,
                    currentSet: 1,
                    currentRep: 1,
                    isMainRep: true,
                    timeLeft: get().settings.prepTime,
                    setTotalDuration: get().settings.prepTime,
                    setElapsedTime: 0,
                    lastTickSecond: -1,
                    sessionNodeRuntimeType: null,
                    sessionRestTimeLeft: 0,
                    sessionLastTickSecond: -1,
                    completedSessionWorkoutNodeIds: [],
                });
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
                completedSessionWorkoutNodeIds: [],
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
                        completedSessionWorkoutNodeIds: [],
                    });
                    return;
                }

                const nextIndex = state.activeSessionNodeIndex + 1;
                if (nextIndex >= session.nodes.length) {
                    get().recordSessionUsed(session.id);
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
                        completedSessionWorkoutNodeIds: [],
                    });
                    return;
                }

                get().startSessionNode(nextIndex);
            },
            startSessionNode: (index) => {
                const state = get();
                const session = state.savedSessions.find((item) => item.id === state.activeSessionId) ?? state.editingSessionDraft;
                if (!session || index < 0 || index >= session.nodes.length) {
                    set({
                        sessionStatus: 'finished',
                        isRunningSession: false,
                        sessionNodeRuntimeType: null,
                        completedSessionWorkoutNodeIds: [],
                    });
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
            clearCompletedSessionWorkoutNodeIds: () => set({ completedSessionWorkoutNodeIds: [] }),
            recordCompletedSessionWorkoutNode: (nodeId) => {
                const state = get();
                if (state.completedSessionWorkoutNodeIds.includes(nodeId)) {
                    return;
                }

                const session = state.savedSessions.find((item) => item.id === state.activeSessionId) ?? state.editingSessionDraft;
                const node = session?.nodes.find((entry) => entry.id === nodeId);
                if (!node || node.type !== 'workout') {
                    return;
                }

                if (node.sourceWorkoutId) {
                    get().recordWorkoutUsed(node.sourceWorkoutId);
                }

                set((current) => ({
                    completedSessionWorkoutNodeIds: current.completedSessionWorkoutNodeIds.includes(nodeId)
                        ? current.completedSessionWorkoutNodeIds
                        : [...current.completedSessionWorkoutNodeIds, nodeId],
                }));
            },

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
                        completedSessionWorkoutNodeIds: [],
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
                completedSessionWorkoutNodeIds: [],
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
            replaceLibrariesFromSync: ({ workouts, sessions }) => set((state) => {
                const nowIso = new Date().toISOString();
                const nextWorkouts = workouts.map((workout) => ({
                    ...workout,
                    sync: normalizeSyncMetadata(workout.sync, workout.id, workout.updatedAt ?? nowIso),
                }));
                const nextSessions = sessions.map((session) => ({
                    ...session,
                    sync: normalizeSyncMetadata(session.sync, session.id, session.updatedAt ?? nowIso),
                }));
                const selectedSavedWorkoutId = state.selectedSavedWorkoutId && nextWorkouts.some((workout) => workout.id === state.selectedSavedWorkoutId)
                    ? state.selectedSavedWorkoutId
                    : null;
                const selectedSavedSessionId = state.selectedSavedSessionId && nextSessions.some((session) => session.id === state.selectedSavedSessionId)
                    ? state.selectedSavedSessionId
                    : null;
                const editingSessionDraft = state.editingSessionDraft && nextSessions.find((session) => session.id === state.editingSessionDraft?.id)
                    ? cloneSavedSession(nextSessions.find((session) => session.id === state.editingSessionDraft?.id)!)
                    : null;
                const activeSessionId = state.activeSessionId && nextSessions.some((session) => session.id === state.activeSessionId)
                    ? state.activeSessionId
                    : null;

                return {
                    savedWorkouts: nextWorkouts,
                    savedSessions: nextSessions,
                    selectedSavedWorkoutId,
                    selectedSavedSessionId,
                    editingSessionId: editingSessionDraft?.id ?? (state.editingSessionId && nextSessions.some((session) => session.id === state.editingSessionId) ? state.editingSessionId : null),
                    editingSessionDraft,
                    editingSessionNodeId: editingSessionDraft?.nodes.some((node) => node.id === state.editingSessionNodeId) ? state.editingSessionNodeId : null,
                    activeSessionId,
                    activeSessionNodeIndex: activeSessionId ? Math.min(state.activeSessionNodeIndex, Math.max(0, (nextSessions.find((session) => session.id === activeSessionId)?.nodes.length ?? 1) - 1)) : 0,
                };
            }),
            acknowledgeSyncedWorkout: (workout) => set((state) => ({
                savedWorkouts: state.savedWorkouts.map((entry) => (
                    entry.id === workout.id ? workout : entry
                )),
            })),
            acknowledgeSyncedSession: (session) => set((state) => {
                const nextSession = {
                    ...session,
                    sync: normalizeSyncMetadata(session.sync, session.id, session.updatedAt),
                };
                return {
                    savedSessions: state.savedSessions.map((entry) => (
                        entry.id === session.id ? nextSession : entry
                    )),
                    editingSessionDraft: state.editingSessionDraft?.id === session.id
                        ? cloneSavedSession(nextSession)
                        : state.editingSessionDraft,
                };
            }),
            purgeDeletedWorkout: (id) => set((state) => ({
                savedWorkouts: state.savedWorkouts.filter((workout) => workout.id !== id),
                selectedSavedWorkoutId: state.selectedSavedWorkoutId === id ? null : state.selectedSavedWorkoutId,
            })),
            purgeDeletedSession: (id) => set((state) => ({
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
                    if (isSessionRunning) {
                        get().startSessionNode(state.activeSessionNodeIndex);
                        return;
                    }

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
                            const session = state.savedSessions.find((item) => item.id === state.activeSessionId) ?? state.editingSessionDraft;
                            const activeNode = session?.nodes[state.activeSessionNodeIndex];
                            if (activeNode?.type === 'workout') {
                                get().recordCompletedSessionWorkoutNode(activeNode.id);
                            }
                            set({
                                isTimerRunning: false,
                                lastTickSecond: -1,
                                sessionNodeRuntimeType: null,
                            });
                            get().advanceSessionNode();
                        } else {
                            if (state.selectedSavedWorkoutId) {
                                get().recordWorkoutUsed(state.selectedSavedWorkoutId);
                            }
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
                    const session = state.savedSessions.find((item) => item.id === state.activeSessionId) ?? state.editingSessionDraft;
                    const activeNode = session?.nodes[state.activeSessionNodeIndex];
                    if (activeNode?.type === 'workout') {
                        get().recordCompletedSessionWorkoutNode(activeNode.id);
                    }
                    set({
                        isTimerRunning: false,
                        lastTickSecond: -1,
                        sessionNodeRuntimeType: null,
                    });
                    get().advanceSessionNode();
                } else {
                    if (state.selectedSavedWorkoutId) {
                        get().recordWorkoutUsed(state.selectedSavedWorkoutId);
                    }
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
            version: WORKOUT_STORE_PERSIST_VERSION,
            migrate: (persistedState, version) => {
                if (version >= WORKOUT_STORE_PERSIST_VERSION) {
                    return persistedState as Partial<WorkoutState>;
                }

                return migratePersistedWorkoutStoreState(persistedState);
            },
            // Persist the setup/preferences surface and library data only.
            // Timer/session runtime is intentionally transient and rehydrates fresh.
            partialize: persistWorkoutStoreState,
        },
    ),
);

