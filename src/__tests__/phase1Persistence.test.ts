import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import {
    buildSavedSessionsExport,
    createRestSessionNode,
    createSavedSession,
    createWorkoutSessionNode,
    mergeSavedSessionsFromImport,
} from '@/utils/savedSessions';
import {
    buildSavedWorkoutsExport,
    createSavedWorkout,
    mergeSavedWorkoutsFromImport,
} from '@/utils/savedWorkouts';
import {
    clearSyncMetadata,
    createSyncMetadata,
    markSyncDeleted,
    normalizeSyncMetadata,
    touchSyncMetadata,
} from '@/utils/sync';

const resetStore = () => {
    useWorkoutStore.setState({
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
        completedSessionWorkoutNodeIds: [],
        showSettings: false,
        isSidebarCollapsed: false,
        theme: 'theme-default',
    });
};

describe('phase 1 persistence redesign coverage', () => {
    beforeEach(() => {
        resetStore();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('keeps saved workout and session exports schema-versioned and sync-normalized on import', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-02-02T03:04:05.000Z'));

        const workout = createSavedWorkout('Push Day', {
            sets: '3',
            reps: '10',
            seconds: '3',
            rest: '20',
            myoReps: '4',
            myoWorkSecs: '2',
        }, '2026-02-01T00:00:00.000Z');

        expect(workout.sync).toEqual({
            localId: workout.id,
            remoteId: null,
            revision: 1,
            updatedAt: '2026-02-01T00:00:00.000Z',
            dirty: true,
            pendingDelete: false,
            deletedAt: null,
            lastSyncedAt: null,
        });

        const workoutExport = buildSavedWorkoutsExport([workout], '2026-02-02T00:00:00.000Z');
        expect(workoutExport.schemaVersion).toBe(1);

        const workoutImport = mergeSavedWorkoutsFromImport([], {
            schemaVersion: 1,
            exportedAt: '2026-02-02T00:00:00.000Z',
            workouts: [
                {
                    ...workout,
                    sync: {
                        localId: '',
                        remoteId: 'remote-workout-1',
                        revision: '7',
                        updatedAt: '',
                        dirty: false,
                        pendingDelete: true,
                        deletedAt: '',
                        lastSyncedAt: '',
                    },
                },
            ],
        });

        expect(workoutImport.summary.imported).toBe(1);
        expect(workoutImport.workouts[0].sync).toEqual({
            localId: workout.id,
            remoteId: 'remote-workout-1',
            revision: 7,
            updatedAt: '2026-02-02T03:04:05.000Z',
            dirty: false,
            pendingDelete: true,
            deletedAt: null,
            lastSyncedAt: null,
        });

        const session = createSavedSession(
            'Session A',
            [
                createWorkoutSessionNode(
                    'Workout A',
                    {
                        sets: '2',
                        reps: '10',
                        seconds: '3',
                        rest: '20',
                        myoReps: '4',
                        myoWorkSecs: '2',
                    },
                    '2026-02-01T00:00:00.000Z',
                    workout.id,
                ),
                createRestSessionNode('Rest A', '30', '2026-02-01T00:00:00.000Z'),
            ],
            '2026-02-01T00:00:00.000Z',
        );

        expect(session.sync).toEqual({
            localId: session.id,
            remoteId: null,
            revision: 1,
            updatedAt: '2026-02-01T00:00:00.000Z',
            dirty: true,
            pendingDelete: false,
            deletedAt: null,
            lastSyncedAt: null,
        });

        const sessionExport = buildSavedSessionsExport([session], '2026-02-02T00:00:00.000Z');
        expect(sessionExport.schemaVersion).toBe(1);

        const sessionImport = mergeSavedSessionsFromImport([], {
            schemaVersion: 1,
            exportedAt: '2026-02-02T00:00:00.000Z',
            sessions: [
                {
                    ...session,
                    sync: {
                        localId: '',
                        remoteId: 'remote-session-1',
                        revision: '5',
                        updatedAt: '',
                        dirty: true,
                        pendingDelete: false,
                        deletedAt: '',
                        lastSyncedAt: '',
                    },
                },
            ],
        });

        expect(sessionImport.summary.imported).toBe(1);
        expect(sessionImport.sessions[0].sync).toEqual({
            localId: session.id,
            remoteId: 'remote-session-1',
            revision: 5,
            updatedAt: '2026-02-02T03:04:05.000Z',
            dirty: true,
            pendingDelete: false,
            deletedAt: null,
            lastSyncedAt: null,
        });
    });

    it('keeps runtime-only timer/session state out of the persisted slice', () => {
        useWorkoutStore.setState({
            savedWorkouts: [
                createSavedWorkout('Saved Workout', {
                    sets: '2',
                    reps: '10',
                    seconds: '3',
                    rest: '20',
                    myoReps: '4',
                    myoWorkSecs: '2',
                }, '2026-02-01T00:00:00.000Z'),
            ],
            savedSessions: [
                createSavedSession(
                    'Saved Session',
                    [
                        {
                            ...createWorkoutSessionNode(
                                'Saved Workout Node',
                                {
                                    sets: '2',
                                    reps: '10',
                                    seconds: '3',
                                    rest: '20',
                                    myoReps: '4',
                                    myoWorkSecs: '2',
                                },
                                '2026-02-01T00:00:00.000Z',
                            ),
                            notes: 'Prev 60kg',
                        },
                    ],
                    '2026-02-01T00:00:00.000Z',
                ),
            ],
            selectedSavedSessionId: 'session-1',
            setupMode: 'session',
            editingSessionId: 'session-1',
            editingSessionDraft: createSavedSession('Draft Session', [], '2026-02-01T00:00:00.000Z'),
            editingSessionNodeId: 'node-1',
            appPhase: 'timer',
            timerStatus: 'Resting',
            isTimerRunning: true,
            currentSet: 2,
            currentRep: 3,
            isMainRep: false,
            isWorking: false,
            timeLeft: 12.5,
            setTotalDuration: 40,
            setElapsedTime: 17.5,
            lastTickSecond: 11,
            activeSessionId: 'session-1',
            activeSessionNodeIndex: 1,
            sessionStatus: 'running',
            isRunningSession: true,
            sessionNodeRuntimeType: 'rest',
            sessionRestTimeLeft: 12,
            sessionLastTickSecond: 8,
            completedSessionWorkoutNodeIds: ['node-a'],
            lastImportSummary: {
                imported: 1,
                renamed: 0,
                skipped: 0,
                errors: [],
            },
        });

        const persisted = (useWorkoutStore as unknown as {
            persist: { getOptions: () => { partialize: (state: ReturnType<typeof useWorkoutStore.getState>) => Record<string, unknown> } };
        }).persist.getOptions().partialize(useWorkoutStore.getState());

        expect(persisted).toMatchObject({
            settings: expect.any(Object),
            sets: '',
            reps: '',
            seconds: '',
            rest: '',
            myoReps: '',
            myoWorkSecs: '',
            savedWorkouts: expect.any(Array),
            savedSessions: expect.any(Array),
            selectedSavedWorkoutId: null,
            selectedSavedSessionId: 'session-1',
            setupMode: 'session',
            theme: 'theme-default',
        });
        expect(persisted.savedSessions[0].nodes[0].type === 'workout' ? persisted.savedSessions[0].nodes[0].notes : '').toBe('Prev 60kg');
        expect(persisted).not.toHaveProperty('lastImportSummary');
        expect(persisted).not.toHaveProperty('editingSessionId');
        expect(persisted).not.toHaveProperty('editingSessionDraft');
        expect(persisted).not.toHaveProperty('editingSessionNodeId');
        expect(persisted).not.toHaveProperty('appPhase');
        expect(persisted).not.toHaveProperty('timerStatus');
        expect(persisted).not.toHaveProperty('isTimerRunning');
        expect(persisted).not.toHaveProperty('currentSet');
        expect(persisted).not.toHaveProperty('currentRep');
        expect(persisted).not.toHaveProperty('isMainRep');
        expect(persisted).not.toHaveProperty('isWorking');
        expect(persisted).not.toHaveProperty('timeLeft');
        expect(persisted).not.toHaveProperty('setTotalDuration');
        expect(persisted).not.toHaveProperty('setElapsedTime');
        expect(persisted).not.toHaveProperty('lastTickSecond');
        expect(persisted).not.toHaveProperty('activeSessionId');
        expect(persisted).not.toHaveProperty('activeSessionNodeIndex');
        expect(persisted).not.toHaveProperty('sessionStatus');
        expect(persisted).not.toHaveProperty('isRunningSession');
        expect(persisted).not.toHaveProperty('sessionNodeRuntimeType');
        expect(persisted).not.toHaveProperty('sessionRestTimeLeft');
        expect(persisted).not.toHaveProperty('sessionLastTickSecond');
        expect(persisted).not.toHaveProperty('completedSessionWorkoutNodeIds');
    });

    it('documents the sync lifecycle helpers used by local persistence and future remote sync', () => {
        const base = createSyncMetadata('local-1', '2026-02-01T00:00:00.000Z');
        const dirty = touchSyncMetadata(base, 'local-1', '2026-02-02T00:00:00.000Z');
        const deleted = markSyncDeleted(dirty, 'local-1', '2026-02-03T00:00:00.000Z');
        const cleared = clearSyncMetadata(deleted, 'local-1', '2026-02-04T00:00:00.000Z');

        expect(base).toMatchObject({
            localId: 'local-1',
            remoteId: null,
            revision: 1,
            dirty: true,
            pendingDelete: false,
            deletedAt: null,
            lastSyncedAt: null,
        });
        expect(normalizeSyncMetadata({
            localId: '',
            remoteId: 'remote-1',
            revision: '12',
            updatedAt: '',
            dirty: false,
            pendingDelete: true,
            deletedAt: '',
            lastSyncedAt: '',
        }, 'local-2', '2026-02-01T00:00:00.000Z')).toMatchObject({
            localId: 'local-2',
            remoteId: 'remote-1',
            revision: 12,
            updatedAt: '2026-02-01T00:00:00.000Z',
            dirty: false,
            pendingDelete: true,
            deletedAt: null,
            lastSyncedAt: null,
        });
        expect(dirty).toMatchObject({
            localId: 'local-1',
            revision: 2,
            dirty: true,
            pendingDelete: false,
        });
        expect(deleted).toMatchObject({
            localId: 'local-1',
            revision: 3,
            dirty: true,
            pendingDelete: true,
            deletedAt: '2026-02-03T00:00:00.000Z',
        });
        expect(cleared).toMatchObject({
            localId: 'local-1',
            revision: 4,
            dirty: false,
            pendingDelete: false,
            deletedAt: null,
            lastSyncedAt: '2026-02-04T00:00:00.000Z',
        });
    });
});
