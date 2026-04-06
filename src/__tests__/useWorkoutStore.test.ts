import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { act } from '@testing-library/react';

describe('useWorkoutStore', () => {
    beforeEach(() => {
        // Reset store to initial state before each test
        const store = useWorkoutStore.getState();
        act(() => {
            store.resetWorkout();
            // Reset additional state that's not covered by resetWorkout
            store.setWorkoutConfig({
                sets: '',
                reps: '',
                seconds: '',
                rest: '',
                myoReps: '',
                myoWorkSecs: '',
            });
            store.updateTimerBaselines(0, 0);
            store.setIsTimerRunning(false);
            useWorkoutStore.setState({
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
        });
    });

    describe('Initial State', () => {
        it('should have correct initial state', () => {
            const state = useWorkoutStore.getState();

            // Config
            expect(state.sets).toBe('');
            expect(state.reps).toBe('');
            expect(state.seconds).toBe('');
            expect(state.rest).toBe('');
            expect(state.myoReps).toBe('');
            expect(state.myoWorkSecs).toBe('');

            // Timer State
            expect(state.appPhase).toBe('setup');
            expect(state.timerStatus).toBe('Ready');
            expect(state.isTimerRunning).toBe(false);
            expect(state.currentSet).toBe(1);
            expect(state.currentRep).toBe(1);
            expect(state.isMainRep).toBe(true);
            expect(state.isWorking).toBe(true);
            expect(state.timeLeft).toBe(0);
            expect(state.setTotalDuration).toBe(0);
            expect(state.setElapsedTime).toBe(0);
        });

        it('should have default settings', () => {
            const state = useWorkoutStore.getState();

            expect(state.settings.activeColor).toBe('#bb86fc');
            expect(state.settings.restColor).toBe('#03dac6');
            expect(state.settings.concentricColor).toBe('#cf6679');
            expect(state.settings.concentricSecond).toBe(1);
            expect(state.settings.smoothAnimation).toBe(true);
            expect(state.settings.prepTime).toBe(5);
            expect(state.settings.fullScreenMode).toBe(false);
            expect(state.settings.metronomeEnabled).toBe(true);
        });
    });

    describe('setWorkoutConfig', () => {
        it('should update workout configuration', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setWorkoutConfig({
                    sets: '5',
                    reps: '15',
                    seconds: '4',
                    rest: '20',
                    myoReps: '4',
                    myoWorkSecs: '3',
                });
            });

            const state = useWorkoutStore.getState();
            expect(state.sets).toBe('5');
            expect(state.reps).toBe('15');
            expect(state.seconds).toBe('4');
            expect(state.rest).toBe('20');
            expect(state.myoReps).toBe('4');
            expect(state.myoWorkSecs).toBe('3');
        });

        it('should update partial configuration', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setWorkoutConfig({ sets: '3' });
            });

            const state = useWorkoutStore.getState();
            expect(state.sets).toBe('3');
            expect(state.reps).toBe(''); // Unchanged
        });

        it('should clamp concentric window when pace values are reduced', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setSettings({ concentricSecond: 10 });
                store.setWorkoutConfig({
                    seconds: '4',
                    myoWorkSecs: '3',
                });
            });

            expect(useWorkoutStore.getState().settings.concentricSecond).toBe(3);
        });
    });

    describe('Saved Sessions', () => {
        it('should create, edit, and save a session draft', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setWorkoutConfig({
                    sets: '2',
                    reps: '12',
                    seconds: '4',
                    rest: '15',
                    myoReps: '4',
                    myoWorkSecs: '2',
                });
            });

            let createdId = '';
            act(() => {
                const created = store.createSession('Leg Day');
                expect(created.ok).toBe(true);
                createdId = created.id as string;
            });

            act(() => {
                store.addWorkoutNodeFromCurrentSetup();
                store.addRestNode('30');
            });

            const saveResult = store.saveSessionDraft();
            expect(saveResult.ok).toBe(true);

            const state = useWorkoutStore.getState();
            expect(state.setupMode).toBe('session');
            expect(state.selectedSavedSessionId).toBe(createdId);
            expect(state.savedSessions).toHaveLength(1);
            expect(state.savedSessions[0].name).toBe('Leg Day');
            expect(state.savedSessions[0].nodes).toHaveLength(2);
            expect(state.savedSessions[0].nodes[0].type).toBe('workout');
            expect(state.savedSessions[0].nodes[1].type).toBe('rest');
        });

        it('should load a saved session for editing with a cloned draft', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setWorkoutConfig({
                    sets: '1',
                    reps: '10',
                    seconds: '3',
                    rest: '',
                    myoReps: '',
                    myoWorkSecs: '',
                });
            });

            let sessionId = '';
            act(() => {
                const created = store.createSession('Upper Body');
                expect(created.ok).toBe(true);
                sessionId = created.id as string;
            });
            act(() => {
                store.addWorkoutNodeFromCurrentSetup();
            });
            act(() => {
                store.saveSessionDraft();
            });

            const loadResult = store.loadSessionForEditing(sessionId);
            expect(loadResult.ok).toBe(true);

            const state = useWorkoutStore.getState();
            expect(state.editingSessionDraft?.id).toBe(sessionId);
            expect(state.editingSessionDraft).not.toBe(state.savedSessions[0]);
            expect(state.editingSessionDraft?.nodes).toHaveLength(1);
        });

        it('should run a session through workout and rest nodes', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setWorkoutConfig({
                    sets: '1',
                    reps: '1',
                    seconds: '2',
                    rest: '',
                    myoReps: '',
                    myoWorkSecs: '',
                });
            });

            let sessionId = '';
            act(() => {
                const created = store.createSession('Quick Session');
                expect(created.ok).toBe(true);
                sessionId = created.id as string;
            });
            act(() => {
                store.addWorkoutNodeFromCurrentSetup();
                store.addRestNode('8');
            });
            act(() => {
                store.saveSessionDraft();
            });

            act(() => {
                store.startSession(sessionId);
            });

            expect(useWorkoutStore.getState().sessionStatus).toBe('running');
            expect(useWorkoutStore.getState().sessionNodeRuntimeType).toBe('workout');
            expect(useWorkoutStore.getState().activeSessionNodeIndex).toBe(0);
            expect(useWorkoutStore.getState().timerStatus).toBe('Preparing');

            act(() => {
                store.advanceCycle();
            });
            expect(useWorkoutStore.getState().timerStatus).toBe('Main Set');

            act(() => {
                store.advanceCycle();
            });
            expect(useWorkoutStore.getState().sessionNodeRuntimeType).toBe('rest');
            expect(useWorkoutStore.getState().activeSessionNodeIndex).toBe(1);
            expect(useWorkoutStore.getState().timerStatus).toBe('Resting');

            act(() => {
                store.completeSessionNode();
            });

            const state = useWorkoutStore.getState();
            expect(state.sessionStatus).toBe('finished');
            expect(state.isRunningSession).toBe(false);
            expect(state.timerStatus).toBe('Finished');
            expect(state.activeSessionNodeIndex).toBe(2);
        });

        it('should support draft node edits and movement', () => {
            const store = useWorkoutStore.getState();

            let sessionId = '';
            act(() => {
                const created = store.createSession('Circuit');
                expect(created.ok).toBe(true);
                sessionId = created.id as string;
            });
            act(() => {
                store.addRestNode('20');
                store.addWorkoutNodeFromCurrentSetup();
            });

            const draftBeforeMove = useWorkoutStore.getState().editingSessionDraft;
            expect(draftBeforeMove).not.toBeNull();
            const nodeIdToMove = draftBeforeMove!.nodes[1].id;
            act(() => {
                store.moveSessionNode(nodeIdToMove, 'left');
            });

            const draft = useWorkoutStore.getState().editingSessionDraft;
            expect(draft?.id).toBe(sessionId);
            expect(draft?.nodes).toHaveLength(2);
            expect(draft?.nodes[0].type).toBe('workout');
            expect(draft?.nodes[1].type).toBe('rest');

            const workoutNode = draft?.nodes[0];
            if (workoutNode?.type === 'workout') {
                act(() => {
                    store.updateWorkoutNode(workoutNode.id, {
                        sets: '3',
                        reps: '8',
                        seconds: '5',
                        rest: '20',
                        myoReps: '4',
                        myoWorkSecs: '3',
                    }, 'Updated Workout');
                });
            }

            const restNode = useWorkoutStore.getState().editingSessionDraft?.nodes.find((node) => node.type === 'rest');
            if (restNode && restNode.type === 'rest') {
                act(() => {
                    store.updateRestNode(restNode.id, '45', 'Updated Rest');
                });
            }

            const updatedDraft = useWorkoutStore.getState().editingSessionDraft;
            expect(updatedDraft?.nodes.some((node) => node.name === 'Updated Workout')).toBe(true);
            expect(updatedDraft?.nodes.some((node) => node.name === 'Updated Rest')).toBe(true);
        });

        it('should rename, duplicate, and delete sessions', () => {
            const store = useWorkoutStore.getState();
            let sessionId = '';

            act(() => {
                store.setWorkoutConfig({
                    sets: '2',
                    reps: '10',
                    seconds: '4',
                    rest: '15',
                    myoReps: '4',
                    myoWorkSecs: '2',
                });
            });
            act(() => {
                const created = store.createSession('Block A');
                expect(created.ok).toBe(true);
                sessionId = created.id as string;
            });

            act(() => {
                store.addWorkoutNodeFromCurrentSetup();
            });

            const saved = store.saveSessionDraft();
            expect(saved.ok).toBe(true);

            const renamed = store.renameSession(sessionId, 'Block A Updated');
            expect(renamed.ok).toBe(true);

            expect(useWorkoutStore.getState().savedSessions[0].name).toBe('Block A Updated');

            let duplicateId = '';
            const duplicated = store.duplicateSession(sessionId, 'Block A Copy');
            expect(duplicated.ok).toBe(true);
            duplicateId = duplicated.id as string;

            expect(useWorkoutStore.getState().savedSessions).toHaveLength(2);
            expect(useWorkoutStore.getState().savedSessions.some((session) => session.id === duplicateId)).toBe(true);

            store.deleteSession(sessionId);

            const state = useWorkoutStore.getState();
            expect(state.savedSessions).toHaveLength(1);
            expect(state.savedSessions[0].id).toBe(duplicateId);
        });
    });

    describe('startWorkout', () => {
        it('should start workout with valid configuration', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setWorkoutConfig({
                    sets: '5',
                    reps: '15',
                    seconds: '4',
                    rest: '20',
                    myoReps: '4',
                    myoWorkSecs: '3',
                });
                store.startWorkout();
            });

            const state = useWorkoutStore.getState();
            expect(state.appPhase).toBe('timer');
            expect(state.timerStatus).toBe('Preparing');
            expect(state.isTimerRunning).toBe(true);
            expect(state.currentSet).toBe(1);
            expect(state.currentRep).toBe(1);
            expect(state.isMainRep).toBe(true);
            expect(state.isWorking).toBe(true);
            expect(state.timeLeft).toBe(5); // Default prepTime
            expect(state.setTotalDuration).toBe(60); // 15 reps * 4 seconds
            expect(state.setElapsedTime).toBe(0);
        });

        it('should not start workout with invalid configuration', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setWorkoutConfig({
                    sets: '',
                    reps: '',
                    seconds: '',
                    rest: '',
                    myoReps: '',
                    myoWorkSecs: '',
                });
                store.startWorkout();
            });

            const state = useWorkoutStore.getState();
            expect(state.appPhase).toBe('setup');
            expect(state.isTimerRunning).toBe(false);
        });

        it('should not start workout with zero values', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setWorkoutConfig({
                    sets: '0',
                    reps: '0',
                    seconds: '0',
                    rest: '0',
                    myoReps: '0',
                    myoWorkSecs: '0',
                });
                store.startWorkout();
            });

            const state = useWorkoutStore.getState();
            expect(state.appPhase).toBe('setup');
            expect(state.isTimerRunning).toBe(false);
        });

        it('should start workout with one set even if rest and myo values are empty', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setWorkoutConfig({
                    sets: '1',
                    reps: '30',
                    seconds: '2',
                    rest: '',
                    myoReps: '',
                    myoWorkSecs: '',
                });
                store.startWorkout();
            });

            const state = useWorkoutStore.getState();
            expect(state.appPhase).toBe('timer');
            expect(state.timerStatus).toBe('Preparing');
            expect(state.isTimerRunning).toBe(true);
            expect(state.currentSet).toBe(1);
            expect(state.isMainRep).toBe(true);
            expect(state.isWorking).toBe(true);
        });
    });

    describe('PAUSE Functionality', () => {
        it('should pause running timer', () => {
            const store = useWorkoutStore.getState();

            // Setup and start workout
            act(() => {
                store.setWorkoutConfig({
                    sets: '5',
                    reps: '15',
                    seconds: '4',
                    rest: '20',
                    myoReps: '4',
                    myoWorkSecs: '3',
                });
                store.startWorkout();
            });

            // Verify timer is running
            expect(useWorkoutStore.getState().isTimerRunning).toBe(true);

            // Pause the timer
            act(() => {
                store.setIsTimerRunning(false);
            });

            const state = useWorkoutStore.getState();
            expect(state.isTimerRunning).toBe(false);
            // Other state should remain unchanged during pause
            expect(state.appPhase).toBe('timer');
            expect(state.timerStatus).toBe('Preparing');
        });

        it('should preserve timeLeft when pausing', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setWorkoutConfig({
                    sets: '5',
                    reps: '15',
                    seconds: '4',
                    rest: '20',
                    myoReps: '4',
                    myoWorkSecs: '3',
                });
                store.startWorkout();
            });

            // Simulate some time passing by manually setting timeLeft
            act(() => {
                store.setTimeLeft(3);
            });

            // Pause
            act(() => {
                store.setIsTimerRunning(false);
            });

            const state = useWorkoutStore.getState();
            expect(state.isTimerRunning).toBe(false);
            expect(state.timeLeft).toBe(3); // Time preserved
        });

        it('should preserve current set and rep when pausing', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setWorkoutConfig({
                    sets: '5',
                    reps: '15',
                    seconds: '4',
                    rest: '20',
                    myoReps: '4',
                    myoWorkSecs: '3',
                });
                store.startWorkout();
            });

            // Simulate progress
            act(() => {
                useWorkoutStore.setState({
                    currentSet: 2,
                    currentRep: 5,
                    isMainRep: false,
                    timerStatus: 'Myo Reps',
                });
            });

            // Pause is implicit when we don't start it, but let's be explicit
            act(() => {
                store.setIsTimerRunning(false);
            });

            const state = useWorkoutStore.getState();
            expect(state.isTimerRunning).toBe(false);
            expect(state.currentSet).toBe(2);
            expect(state.currentRep).toBe(5);
            expect(state.isMainRep).toBe(false);
            expect(state.timerStatus).toBe('Myo Reps');
        });
    });

    describe('RESUME Functionality', () => {
        it('should resume paused timer', () => {
            const store = useWorkoutStore.getState();

            // Setup, start, and pause workout
            act(() => {
                store.setWorkoutConfig({
                    sets: '5',
                    reps: '15',
                    seconds: '4',
                    rest: '20',
                    myoReps: '4',
                    myoWorkSecs: '3',
                });
                store.startWorkout();
            });

            // Pause
            act(() => {
                store.setIsTimerRunning(false);
            });

            expect(useWorkoutStore.getState().isTimerRunning).toBe(false);

            // Resume
            act(() => {
                store.setIsTimerRunning(true);
            });

            const state = useWorkoutStore.getState();
            expect(state.isTimerRunning).toBe(true);
            expect(state.appPhase).toBe('timer');
        });

        it('should resume with preserved timeLeft', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setWorkoutConfig({
                    sets: '5',
                    reps: '15',
                    seconds: '4',
                    rest: '20',
                    myoReps: '4',
                    myoWorkSecs: '3',
                });
                store.startWorkout();
            });

            // Set specific time and pause
            act(() => {
                store.updateTimerBaselines(2.5, 45);
                store.setIsTimerRunning(false);
            });

            const pausedState = useWorkoutStore.getState();
            expect(pausedState.timeLeft).toBe(2.5);
            expect(pausedState.setElapsedTime).toBe(45);

            // Resume
            act(() => {
                store.setIsTimerRunning(true);
            });

            const resumedState = useWorkoutStore.getState();
            expect(resumedState.isTimerRunning).toBe(true);
            expect(resumedState.timeLeft).toBe(2.5); // Time preserved
            expect(resumedState.setElapsedTime).toBe(45); // Elapsed time preserved
        });

        it('should maintain timer phase when resuming', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setWorkoutConfig({
                    sets: '5',
                    reps: '15',
                    seconds: '4',
                    rest: '20',
                    myoReps: '4',
                    myoWorkSecs: '3',
                });
                store.startWorkout();
            });

            // Transition to different phase manually
            act(() => {
                useWorkoutStore.setState({
                    timerStatus: 'Resting',
                    isWorking: false,
                    timeLeft: 15,
                    isTimerRunning: false,
                });
            });

            // Resume
            act(() => {
                store.setIsTimerRunning(true);
            });

            const state = useWorkoutStore.getState();
            expect(state.isTimerRunning).toBe(true);
            expect(state.timerStatus).toBe('Resting');
            expect(state.isWorking).toBe(false);
            expect(state.timeLeft).toBe(15);
        });
    });

    describe('RESET Functionality', () => {
        it('should reset workout to initial state', () => {
            const store = useWorkoutStore.getState();

            // Setup and start workout
            act(() => {
                store.setWorkoutConfig({
                    sets: '5',
                    reps: '15',
                    seconds: '4',
                    rest: '20',
                    myoReps: '4',
                    myoWorkSecs: '3',
                });
                store.startWorkout();
            });

            // Verify workout is running
            expect(useWorkoutStore.getState().appPhase).toBe('timer');
            expect(useWorkoutStore.getState().isTimerRunning).toBe(true);

            // Reset
            act(() => {
                store.resetWorkout();
            });

            const state = useWorkoutStore.getState();
            expect(state.isTimerRunning).toBe(false);
            expect(state.appPhase).toBe('setup');
            expect(state.timerStatus).toBe('Ready');
        });

        it('should stop timer when resetting', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setWorkoutConfig({
                    sets: '5',
                    reps: '15',
                    seconds: '4',
                    rest: '20',
                    myoReps: '4',
                    myoWorkSecs: '3',
                });
                store.startWorkout();
            });

            expect(useWorkoutStore.getState().isTimerRunning).toBe(true);

            act(() => {
                store.resetWorkout();
            });

            expect(useWorkoutStore.getState().isTimerRunning).toBe(false);
        });

        it('should return to setup phase when resetting', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setWorkoutConfig({
                    sets: '5',
                    reps: '15',
                    seconds: '4',
                    rest: '20',
                    myoReps: '4',
                    myoWorkSecs: '3',
                });
                store.startWorkout();
            });

            // Advance cycle (this should change timerStatus)
            act(() => {
                store.advanceCycle(); // Preparing -> Main Set
            });

            act(() => {
                store.resetWorkout();
            });

            const state = useWorkoutStore.getState();
            expect(state.appPhase).toBe('setup');
            expect(state.timerStatus).toBe('Ready');
        });
    });

    describe('Pause + Resume + Reset Sequence', () => {
        it('should handle complete pause-resume-reset cycle', () => {
            const store = useWorkoutStore.getState();

            // 1. Start workout
            act(() => {
                store.setWorkoutConfig({
                    sets: '5',
                    reps: '15',
                    seconds: '4',
                    rest: '20',
                    myoReps: '4',
                    myoWorkSecs: '3',
                });
                store.startWorkout();
            });

            let state = useWorkoutStore.getState();
            expect(state.isTimerRunning).toBe(true);
            expect(state.appPhase).toBe('timer');

            // 2. Simulate some progress and pause
            act(() => {
                useWorkoutStore.setState({
                    currentSet: 2,
                    currentRep: 3,
                    timeLeft: 2.5,
                    setElapsedTime: 30,
                    isTimerRunning: false,
                });
            });

            state = useWorkoutStore.getState();
            expect(state.isTimerRunning).toBe(false);
            expect(state.timeLeft).toBe(2.5);

            // 3. Resume
            act(() => {
                store.setIsTimerRunning(true);
            });

            state = useWorkoutStore.getState();
            expect(state.isTimerRunning).toBe(true);
            expect(state.timeLeft).toBe(2.5); // Preserved
            expect(state.currentSet).toBe(2); // Preserved

            // 4. Pause again
            act(() => {
                store.setIsTimerRunning(false);
            });

            state = useWorkoutStore.getState();
            expect(state.isTimerRunning).toBe(false);

            // 5. Reset
            act(() => {
                store.resetWorkout();
            });

            state = useWorkoutStore.getState();
            expect(state.isTimerRunning).toBe(false);
            expect(state.appPhase).toBe('setup');
            expect(state.timerStatus).toBe('Ready');
        });
    });

    describe('setSettings', () => {
        it('should update settings', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setSettings({ prepTime: 10 });
            });

            expect(useWorkoutStore.getState().settings.prepTime).toBe(10);
        });

        it('should merge partial settings', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setSettings({ activeColor: '#ff0000' });
            });

            const state = useWorkoutStore.getState();
            expect(state.settings.activeColor).toBe('#ff0000');
            expect(state.settings.restColor).toBe('#03dac6'); // Unchanged
        });

        it('should clamp concentric window to the fastest configured pace', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setWorkoutConfig({
                    seconds: '6',
                    myoWorkSecs: '3',
                });
                store.setSettings({ concentricSecond: 8 });
            });

            expect(useWorkoutStore.getState().settings.concentricSecond).toBe(3);
        });
    });

    describe('saved workouts', () => {
        const validConfig = {
            sets: '3',
            reps: '12',
            seconds: '3',
            rest: '20',
            myoReps: '4',
            myoWorkSecs: '2',
        };

        it('should save and load a workout template', () => {
            const store = useWorkoutStore.getState();

            act(() => {
                store.setWorkoutConfig(validConfig);
            });

            const saveResult = store.saveCurrentWorkout('Leg Day');
            expect(saveResult.ok).toBe(true);

            const saved = useWorkoutStore.getState().savedWorkouts;
            expect(saved).toHaveLength(1);
            expect(saved[0].name).toBe('Leg Day');

            const loadResult = store.loadWorkout(saved[0].id);
            expect(loadResult.ok).toBe(true);
            expect(useWorkoutStore.getState().sets).toBe('3');
            expect(useWorkoutStore.getState().selectedSavedWorkoutId).toBe(saved[0].id);

            act(() => {
                store.setWorkoutConfig({ sets: '6' });
            });
            expect(useWorkoutStore.getState().sets).toBe('6');
            expect(useWorkoutStore.getState().selectedSavedWorkoutId).toBe(saved[0].id);

            const updateResult = store.saveCurrentWorkout('Leg Day');
            expect(updateResult.ok).toBe(true);
            expect(useWorkoutStore.getState().savedWorkouts).toHaveLength(1);
            expect(useWorkoutStore.getState().savedWorkouts[0].sets).toBe('6');
        });

        it('should reject duplicate workout names and invalid workout configs', () => {
            const store = useWorkoutStore.getState();
            act(() => {
                store.setWorkoutConfig(validConfig);
            });

            expect(store.saveCurrentWorkout('Push')).toMatchObject({ ok: true });
            expect(store.saveCurrentWorkout('push')).toMatchObject({ ok: false });

            act(() => {
                store.setWorkoutConfig({ reps: '' });
            });
            expect(store.saveCurrentWorkout('Invalid')).toMatchObject({ ok: false });
        });

        it('should rename and delete saved workouts', () => {
            const store = useWorkoutStore.getState();
            act(() => {
                store.setWorkoutConfig(validConfig);
            });

            store.saveCurrentWorkout('A');
            store.saveCurrentWorkout('B');
            const [first, second] = useWorkoutStore.getState().savedWorkouts;

            expect(store.renameWorkout(first.id, 'Renamed')).toMatchObject({ ok: true });
            expect(store.renameWorkout(second.id, 'Renamed')).toMatchObject({ ok: false });

            act(() => {
                store.deleteWorkout(first.id);
            });

            const remaining = useWorkoutStore.getState().savedWorkouts;
            expect(remaining).toHaveLength(1);
            expect(remaining[0].name).toBe('B');
        });

        it('should record usage when starting from a loaded template', () => {
            const store = useWorkoutStore.getState();
            act(() => {
                store.setWorkoutConfig(validConfig);
            });
            store.saveCurrentWorkout('Template');
            const saved = useWorkoutStore.getState().savedWorkouts[0];
            store.loadWorkout(saved.id);

            act(() => {
                store.startWorkout();
            });

            const updated = useWorkoutStore.getState().savedWorkouts[0];
            expect(updated.timesUsed).toBe(1);
            expect(updated.lastUsedAt).not.toBeNull();
            expect(useWorkoutStore.getState().appPhase).toBe('timer');
        });

        it('should export and import with conflict renaming and invalid skips', () => {
            const store = useWorkoutStore.getState();
            act(() => {
                store.setWorkoutConfig(validConfig);
            });
            store.saveCurrentWorkout('Arms');

            const payload = store.exportSavedWorkouts();
            expect(payload.schemaVersion).toBe(1);
            expect(payload.workouts).toHaveLength(1);

            const importPayload = {
                schemaVersion: 1,
                exportedAt: new Date().toISOString(),
                workouts: [
                    payload.workouts[0],
                    { ...payload.workouts[0], id: 'new-id' },
                    { name: 'Bad Workout', sets: '0' },
                ],
            };

            const summary = store.importSavedWorkouts(importPayload);
            expect(summary.imported).toBe(2);
            expect(summary.renamed).toBe(2);
            expect(summary.skipped).toBe(1);
            expect(useWorkoutStore.getState().savedWorkouts).toHaveLength(3);
            expect(useWorkoutStore.getState().savedWorkouts.some((workout) => workout.name.includes('(Imported'))).toBe(true);
        });

        it('should return import error summary for malformed payloads', () => {
            const store = useWorkoutStore.getState();
            const summary = store.importSavedWorkouts({ schemaVersion: 99, workouts: [] });
            expect(summary.imported).toBe(0);
            expect(summary.errors[0]).toContain('Unsupported schema version');

            act(() => {
                store.clearImportSummary();
            });
            expect(useWorkoutStore.getState().lastImportSummary).toBeNull();
        });

        it('should sanitize set input to minimum of 1 while allowing empty', () => {
            const store = useWorkoutStore.getState();
            act(() => {
                store.setWorkoutConfig({ sets: '0' });
            });
            expect(useWorkoutStore.getState().sets).toBe('1');

            act(() => {
                store.setWorkoutConfig({ sets: '-10' });
            });
            expect(useWorkoutStore.getState().sets).toBe('1');

            act(() => {
                store.setWorkoutConfig({ sets: '' });
            });
            expect(useWorkoutStore.getState().sets).toBe('');
        });
    });

    describe('Individual Setters', () => {
        it('should update timeLeft independently', () => {
            const store = useWorkoutStore.getState();
            act(() => {
                store.setTimeLeft(10);
            });
            expect(useWorkoutStore.getState().timeLeft).toBe(10);
        });

        it('should update isTimerRunning independently', () => {
            const store = useWorkoutStore.getState();
            act(() => {
                store.setIsTimerRunning(true);
            });
            expect(useWorkoutStore.getState().isTimerRunning).toBe(true);

            act(() => {
                store.setIsTimerRunning(false);
            });
            expect(useWorkoutStore.getState().isTimerRunning).toBe(false);
        });
    });

    describe('advanceCycle transitions', () => {
        it('moves Preparing to Main Set', () => {
            useWorkoutStore.setState({
                sets: '3',
                reps: '10',
                seconds: '2',
                rest: '20',
                myoReps: '4',
                myoWorkSecs: '2',
                timerStatus: 'Preparing',
                isWorking: true,
                isMainRep: true,
                currentRep: 1,
            });

            act(() => {
                useWorkoutStore.getState().advanceCycle();
            });

            const state = useWorkoutStore.getState();
            expect(state.timerStatus).toBe('Main Set');
            expect(state.timeLeft).toBe(2);
        });

        it('cycles through main reps then resting', () => {
            useWorkoutStore.setState({
                sets: '3',
                reps: '2',
                seconds: '3',
                rest: '10',
                myoReps: '4',
                myoWorkSecs: '2',
                timerStatus: 'Main Set',
                isWorking: true,
                isMainRep: true,
                currentSet: 1,
                currentRep: 1,
            });

            act(() => {
                useWorkoutStore.getState().advanceCycle();
            });
            expect(useWorkoutStore.getState().currentRep).toBe(2);

            act(() => {
                useWorkoutStore.getState().advanceCycle();
            });
            expect(useWorkoutStore.getState().timerStatus).toBe('Resting');
            expect(useWorkoutStore.getState().isWorking).toBe(false);
        });

        it('finishes after final main rep for single-set workout', () => {
            useWorkoutStore.setState({
                sets: '1',
                reps: '1',
                seconds: '2',
                rest: '10',
                myoReps: '4',
                myoWorkSecs: '2',
                timerStatus: 'Main Set',
                isWorking: true,
                isMainRep: true,
                currentSet: 1,
                currentRep: 1,
                setTotalDuration: 2,
            });

            act(() => {
                useWorkoutStore.getState().advanceCycle();
            });

            const state = useWorkoutStore.getState();
            expect(state.timerStatus).toBe('Finished');
            expect(state.isTimerRunning).toBe(false);
        });

        it('moves from resting to myo reps and then to finished', () => {
            useWorkoutStore.setState({
                sets: '2',
                reps: '2',
                seconds: '3',
                rest: '5',
                myoReps: '2',
                myoWorkSecs: '2',
                timerStatus: 'Resting',
                isWorking: false,
                isMainRep: false,
                currentSet: 1,
                currentRep: 1,
            });

            act(() => {
                useWorkoutStore.getState().advanceCycle();
            });
            expect(useWorkoutStore.getState().timerStatus).toBe('Myo Reps');

            useWorkoutStore.setState({
                isWorking: true,
                isMainRep: false,
                currentSet: 2,
                currentRep: 2,
                setTotalDuration: 4,
            });
            act(() => {
                useWorkoutStore.getState().advanceCycle();
            });

            expect(useWorkoutStore.getState().timerStatus).toBe('Finished');
        });
    });
});


