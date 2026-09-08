import { describe, expect, it } from 'vitest';
import type { WorkoutSessionNode } from '@/types/savedSessions';
import { createSavedSession, createWorkoutSessionNode } from '@/utils/savedSessions';
import { fromSupabaseSavedSessionRow, toSupabaseSavedSessionWriteRow } from '@/utils/sync';
import {
    DEFAULT_PROGRESSION_REMINDER_THRESHOLD,
    DEFAULT_SESSION_WORKOUT_CONFIG,
    DEFAULT_WORKOUT_CONFIG,
    createDefaultWorkoutConfig,
    hasProgressionRelevantWorkoutChange,
    hasWorkoutProgressionChanged,
    normalizeCompletedSessionsSinceProgression,
    normalizeSessionNodeForPersistence,
} from '@/utils/workoutProgression';

const baseNode = (overrides: Partial<WorkoutSessionNode> = {}): WorkoutSessionNode => ({
    id: 'node-1',
    type: 'workout',
    name: 'Workout',
    config: {
        sets: '3',
        reps: '15',
        seconds: '2',
        rest: '20',
        myoReps: '5',
        myoWorkSecs: '2',
    },
    sourceWorkoutId: 'source-1',
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
});

describe('workoutProgression utilities', () => {
    it('accepts only finite nonnegative safe integer counters', () => {
        expect(normalizeCompletedSessionsSinceProgression(0)).toBe(0);
        expect(normalizeCompletedSessionsSinceProgression(3)).toBe(3);

        for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '3', null, undefined]) {
            expect(normalizeCompletedSessionsSinceProgression(value)).toBe(0);
        }
    });

    it('exposes valid generic defaults as copies', () => {
        expect(DEFAULT_PROGRESSION_REMINDER_THRESHOLD).toBe(3);
        expect(DEFAULT_WORKOUT_CONFIG).toEqual({
            sets: '3',
            reps: '15',
            seconds: '2',
            rest: '20',
            myoReps: '5',
            myoWorkSecs: '2',
        });
        expect(DEFAULT_SESSION_WORKOUT_CONFIG).toEqual(DEFAULT_WORKOUT_CONFIG);

        const copy = createDefaultWorkoutConfig();
        copy.reps = '12';
        expect(DEFAULT_WORKOUT_CONFIG.reps).toBe('15');
    });

    it('compares sanitized configuration, notes, and linked source only', () => {
        const previous = baseNode();
        const equivalent = baseNode({
            name: 'Renamed only',
            updatedAt: '2026-01-02T00:00:00.000Z',
            config: {
                sets: '03',
                reps: '15.0',
                seconds: '2',
                rest: '20',
                myoReps: '5',
                myoWorkSecs: '2',
            },
            sourceWorkoutId: ' source-1 ',
        });

        expect(hasProgressionRelevantWorkoutChange(previous, equivalent)).toBe(false);
        expect(hasWorkoutProgressionChanged(previous, equivalent)).toBe(false);

        expect(hasProgressionRelevantWorkoutChange(previous, baseNode({
            config: { ...previous.config, rest: '25' },
        }))).toBe(true);
        expect(hasProgressionRelevantWorkoutChange(previous, baseNode({ notes: 'log' }))).toBe(true);
        expect(hasProgressionRelevantWorkoutChange(previous, baseNode({ sourceWorkoutId: 'source-2' }))).toBe(true);
        expect(hasProgressionRelevantWorkoutChange(
            baseNode({ notes: undefined, sourceWorkoutId: null }),
            baseNode({ notes: '', sourceWorkoutId: ' ' }),
        )).toBe(false);
    });

    it('preserves and normalizes counters through sync JSON rows', () => {
        const nowIso = '2026-01-01T00:00:00.000Z';
        const node = createWorkoutSessionNode('Synced block', DEFAULT_WORKOUT_CONFIG, nowIso);
        node.completedSessionsSinceProgression = 8;
        const session = createSavedSession('Synced session', [node], nowIso);
        const writeRow = toSupabaseSavedSessionWriteRow(session, 'user-1');

        expect(writeRow.nodes[0]).toMatchObject({ completedSessionsSinceProgression: 8 });

        const restored = fromSupabaseSavedSessionRow({
            ...writeRow,
            id: 'remote-session-1',
            user_id: 'user-1',
            local_id: session.id,
            revision: 1,
            deleted_at: null,
            created_at: nowIso,
        });
        expect(restored.nodes[0].type === 'workout'
            ? restored.nodes[0].completedSessionsSinceProgression
            : -1).toBe(8);

        const legacy = fromSupabaseSavedSessionRow({
            ...writeRow,
            id: 'remote-session-2',
            user_id: 'user-1',
            local_id: session.id,
            nodes: [{ ...writeRow.nodes[0] as object, completedSessionsSinceProgression: -2 }],
            revision: 1,
            deleted_at: null,
            created_at: nowIso,
        });
        expect(legacy.nodes[0].type === 'workout'
            ? legacy.nodes[0].completedSessionsSinceProgression
            : -1).toBe(0);

        expect(normalizeSessionNodeForPersistence({
            type: 'workout', id: 'malformed-legacy', name: 'Legacy',
        })).toMatchObject({ completedSessionsSinceProgression: 0 });
    });
});
