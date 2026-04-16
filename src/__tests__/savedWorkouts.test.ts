import { describe, it, expect } from 'vitest';
import {
    buildSavedWorkoutsExport,
    createSavedWorkout,
    isValidWorkoutConfig,
    mergeSavedWorkoutsFromImport,
    normalizeSetsInput,
    sanitizeSavedWorkoutConfig,
} from '@/utils/savedWorkouts';

describe('savedWorkouts utils', () => {
    it('normalizes sets input correctly', () => {
        expect(normalizeSetsInput('0')).toBe('1');
        expect(normalizeSetsInput('-4')).toBe('1');
        expect(normalizeSetsInput('5')).toBe('5');
        expect(normalizeSetsInput('')).toBe('');
        expect(normalizeSetsInput('abc')).toBe('');
    });

    it('sanitizes and validates workout configs', () => {
        const config = sanitizeSavedWorkoutConfig({
            sets: '3',
            reps: '12',
            seconds: '3',
            rest: '20',
            myoReps: '4',
            myoWorkSecs: '2',
        });

        expect(isValidWorkoutConfig(config)).toBe(true);
        expect(isValidWorkoutConfig({ ...config, sets: '0' })).toBe(false);
        expect(isValidWorkoutConfig({ ...config, sets: '1', rest: '', myoReps: '', myoWorkSecs: '' })).toBe(true);
    });

    it('creates export payload with schema', () => {
        const workout = createSavedWorkout('Pull Day', {
            sets: '3',
            reps: '10',
            seconds: '3',
            rest: '20',
            myoReps: '4',
            myoWorkSecs: '2',
        }, '2026-01-01T00:00:00.000Z');

        const payload = buildSavedWorkoutsExport([workout], '2026-01-02T00:00:00.000Z');
        expect(payload.schemaVersion).toBe(1);
        expect(payload.workouts).toHaveLength(1);
        expect(payload.exportedAt).toBe('2026-01-02T00:00:00.000Z');
    });

    it('merges imported workouts and renames conflicts', () => {
        const base = createSavedWorkout('Leg Day', {
            sets: '3',
            reps: '10',
            seconds: '3',
            rest: '20',
            myoReps: '4',
            myoWorkSecs: '2',
        }, '2026-01-01T00:00:00.000Z');

        const payload = {
            schemaVersion: 1,
            exportedAt: '2026-01-02T00:00:00.000Z',
            workouts: [
                base,
                { ...base, id: 'another' },
                { name: '', sets: '0' },
            ],
        };

        const result = mergeSavedWorkoutsFromImport([base], payload);
        expect(result.summary.imported).toBe(2);
        expect(result.summary.renamed).toBe(2);
        expect(result.summary.skipped).toBe(1);
        expect(result.workouts.length).toBe(3);
    });

    it('rejects unsupported payload schema', () => {
        const result = mergeSavedWorkoutsFromImport([], { schemaVersion: 99, workouts: [] });
        expect(result.summary.imported).toBe(0);
        expect(result.workouts).toHaveLength(0);
    });
});

