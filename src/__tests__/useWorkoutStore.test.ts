import { describe, it, expect, beforeEach, vi } from 'vitest';
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
});