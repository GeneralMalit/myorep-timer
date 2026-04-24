import { describe, expect, it } from 'vitest';
import {
    buildSavedSessionsExport,
    cloneSavedSession,
    cloneSessionNode,
    createRestSessionNode,
    createSavedSession,
    createWorkoutSessionNode,
    estimateSessionDurationSeconds,
    formatEstimatedSessionDuration,
    isValidRestNode,
    isValidSavedSession,
    mergeSavedSessionsFromImport,
    moveNodeInArray,
    sanitizeRestNodeSeconds,
} from '@/utils/savedSessions';

describe('savedSessions utilities', () => {
    it('creates and validates workout and rest nodes', () => {
        const nowIso = '2026-01-01T00:00:00.000Z';
        const workoutNode = createWorkoutSessionNode(
            'Workout Node',
            {
                sets: '3',
                reps: '12',
                seconds: '3',
                rest: '20',
                myoReps: '4',
                myoWorkSecs: '2',
            },
            nowIso,
            'workout-1',
        );
        const restNode = createRestSessionNode('Rest Node', '45', nowIso);

        expect(workoutNode.type).toBe('workout');
        expect(workoutNode.sourceWorkoutId).toBe('workout-1');
        expect(workoutNode.notes).toBe('');
        expect(restNode.type).toBe('rest');
        expect(isValidRestNode({ seconds: '45' })).toBe(true);
        expect(isValidSavedSession({ name: 'Session A', nodes: [workoutNode, restNode] })).toBe(true);
    });

    it('sanitizes rest seconds and rejects invalid values', () => {
        expect(sanitizeRestNodeSeconds('20')).toBe('20');
        expect(sanitizeRestNodeSeconds('0')).toBe('');
        expect(sanitizeRestNodeSeconds('abc')).toBe('');
        expect(isValidRestNode({ seconds: '' })).toBe(false);
    });

    it('clones nodes and sessions without sharing references', () => {
        const nowIso = '2026-01-01T00:00:00.000Z';
        const notedWorkout = createWorkoutSessionNode(
            'Workout A',
            {
                sets: '2',
                reps: '10',
                seconds: '3',
                rest: '20',
                myoReps: '4',
                myoWorkSecs: '2',
            },
            nowIso,
        );
        notedWorkout.notes = 'Prev 60kg';

        const session = createSavedSession('Session A', [notedWorkout, createRestSessionNode('Rest', '30', nowIso)], nowIso);
        expect(session.nodes).toHaveLength(2);

        const clonedNode = cloneSessionNode(notedWorkout);
        const clonedSession = cloneSavedSession(session);

        expect(clonedNode).not.toBe(notedWorkout);
        expect(clonedNode.id).toBe(notedWorkout.id);
        expect(clonedNode.notes).toBe('Prev 60kg');
        expect(clonedSession).not.toBe(session);
        expect(clonedSession.nodes).toHaveLength(2);
        expect(clonedSession.nodes[0]).not.toBe(session.nodes[0]);
        expect(clonedSession.nodes[0].id).toBe(session.nodes[0].id);
        expect(clonedSession.nodes[0].type === 'workout' ? clonedSession.nodes[0].notes : '').toBe('Prev 60kg');
    });

    it('can duplicate nodes and sessions with fresh identities', () => {
        const nowIso = '2026-01-02T00:00:00.000Z';
        const node = createWorkoutSessionNode(
            'Workout B',
            {
                sets: '2',
                reps: '10',
                seconds: '3',
                rest: '20',
                myoReps: '4',
                myoWorkSecs: '2',
            },
            nowIso,
        );
        const session = createSavedSession('Session B', [node], nowIso);
        expect(session.nodes).toHaveLength(1);

        const clonedNode = cloneSessionNode(node, nowIso);
        const duplicatedSession = cloneSavedSession(session, nowIso);

        expect(clonedNode.id).not.toBe(node.id);
        expect(clonedNode.createdAt).toBe(nowIso);
        expect(duplicatedSession.id).not.toBe(session.id);
        expect(duplicatedSession.nodes).toHaveLength(1);
        expect(duplicatedSession.nodes[0].id).not.toBe(session.nodes[0].id);
    });

    it('moves nodes in an array safely', () => {
        expect(moveNodeInArray(['a', 'b', 'c'], 1, 'left')).toEqual(['b', 'a', 'c']);
        expect(moveNodeInArray(['a', 'b', 'c'], 1, 'right')).toEqual(['a', 'c', 'b']);
        expect(moveNodeInArray(['a', 'b', 'c'], 0, 'left')).toEqual(['a', 'b', 'c']);
    });

    it('builds session exports and merges imported sessions', () => {
        const nowIso = '2026-01-01T00:00:00.000Z';
        const session = createSavedSession(
            'Session A',
            [
                {
                    ...createWorkoutSessionNode(
                        'Workout A',
                        {
                            sets: '2',
                            reps: '10',
                            seconds: '3',
                            rest: '20',
                            myoReps: '4',
                            myoWorkSecs: '2',
                        },
                        nowIso,
                    ),
                    notes: 'Prev 60kg',
                },
            ],
            nowIso,
        );
        const exportPayload = buildSavedSessionsExport([session], nowIso);

        expect(exportPayload.schemaVersion).toBe(1);
        expect(exportPayload.sessions).toHaveLength(1);

        const imported = mergeSavedSessionsFromImport([], exportPayload);
        expect(imported.summary.imported).toBe(1);
        expect(imported.sessions).toHaveLength(1);
        expect(imported.sessions[0].nodes[0].type === 'workout' ? imported.sessions[0].nodes[0].notes : '').toBe('Prev 60kg');
    });

    it('estimates session duration from prep time and node timing', () => {
        const nowIso = '2026-01-01T00:00:00.000Z';
        const session = createSavedSession(
            'Session Timing',
            [
                createWorkoutSessionNode(
                    'Workout Timing',
                    {
                        sets: '2',
                        reps: '10',
                        seconds: '3',
                        rest: '20',
                        myoReps: '4',
                        myoWorkSecs: '2',
                    },
                    nowIso,
                ),
                createRestSessionNode('Between', '15', nowIso),
            ],
            nowIso,
        );

        const durationSeconds = estimateSessionDurationSeconds(session, 5);

        expect(durationSeconds).toBe(78);
        expect(formatEstimatedSessionDuration(durationSeconds)).toBe('1:18');
    });

    it('regenerates duplicate imported session ids within the same merge', () => {
        const nowIso = '2026-01-01T00:00:00.000Z';
        const existing = createSavedSession(
            'Existing',
            [
                createWorkoutSessionNode(
                    'Workout Existing',
                    {
                        sets: '2',
                        reps: '10',
                        seconds: '3',
                        rest: '20',
                        myoReps: '4',
                        myoWorkSecs: '2',
                    },
                    nowIso,
                ),
            ],
            nowIso,
        );

        const duplicateId = 'duplicate-session-id';
        const payload = {
            schemaVersion: 1,
            exportedAt: nowIso,
            sessions: [
                {
                    id: duplicateId,
                    name: 'Imported One',
                    nodes: [
                        {
                            id: 'node-1',
                            type: 'rest',
                            name: 'Rest 1',
                            seconds: '30',
                            createdAt: nowIso,
                            updatedAt: nowIso,
                        },
                    ],
                    timesUsed: 0,
                    lastUsedAt: null,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                },
                {
                    id: duplicateId,
                    name: 'Imported Two',
                    nodes: [
                        {
                            id: 'node-2',
                            type: 'rest',
                            name: 'Rest 2',
                            seconds: '45',
                            createdAt: nowIso,
                            updatedAt: nowIso,
                        },
                    ],
                    timesUsed: 0,
                    lastUsedAt: null,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                },
            ],
        };

        const imported = mergeSavedSessionsFromImport([existing], payload);
        const importedIds = imported.sessions.slice(1).map((session) => session.id);

        expect(imported.summary.imported).toBe(2);
        expect(new Set(importedIds).size).toBe(importedIds.length);
        expect(importedIds).not.toContain(existing.id);
    });

    it('covers creation helpers and invalid session validation branches', () => {
        expect(sanitizeRestNodeSeconds(undefined)).toBe('');
        expect(sanitizeRestNodeSeconds(null)).toBe('');

        const restWithNow = createRestSessionNode('Cooldown', '30', '2026-01-03T00:00:00.000Z');
        expect(restWithNow.name).toBe('Cooldown');
        expect(restWithNow.seconds).toBe('30');

        const defaultRest = createRestSessionNode('45');
        expect(defaultRest.name).toBe('Rest');
        expect(defaultRest.seconds).toBe('45');

        const workoutFromConfig = createWorkoutSessionNode(
            {
                sets: '2',
                reps: '8',
                seconds: '4',
                rest: '20',
                myoReps: '3',
                myoWorkSecs: '2',
            },
            'Warmup',
            'source-workout',
        );
        expect(workoutFromConfig.name).toBe('Warmup');
        expect(workoutFromConfig.sourceWorkoutId).toBe('source-workout');

        expect(isValidSavedSession({ name: '  ', nodes: [restWithNow] })).toBe(false);
        expect(isValidSavedSession({ name: 'Session', nodes: [] })).toBe(false);
        expect(isValidSavedSession({
            name: 'Session',
            nodes: [
                {
                    ...restWithNow,
                    seconds: '',
                },
            ],
        })).toBe(false);
    });

    it('handles malformed imports and duplicate names plus ids', () => {
        const nowIso = '2026-01-01T00:00:00.000Z';

        expect(mergeSavedSessionsFromImport([], null).sessions).toHaveLength(0);
        expect(mergeSavedSessionsFromImport([], { schemaVersion: 2, sessions: [] }).sessions).toHaveLength(0);
        expect(mergeSavedSessionsFromImport([], { schemaVersion: 1, sessions: {} }).sessions).toHaveLength(0);

        const existing = createSavedSession(
            'Day One',
            [
                createWorkoutSessionNode(
                    'Workout One',
                    {
                        sets: '2',
                        reps: '10',
                        seconds: '3',
                        rest: '20',
                        myoReps: '4',
                        myoWorkSecs: '2',
                    },
                    nowIso,
                ),
            ],
            nowIso,
        );

        const payload = {
            schemaVersion: 1,
            exportedAt: nowIso,
            sessions: [
                null,
                {
                    id: existing.id,
                    name: 'Day One',
                    nodes: [
                        {
                            id: 'invalid-rest',
                            type: 'rest',
                            name: 'Broken Rest',
                            seconds: '0',
                            createdAt: nowIso,
                            updatedAt: nowIso,
                        },
                    ],
                },
                {
                    id: existing.id,
                    name: 'Day One',
                    nodes: [
                        {
                            id: 'good-rest',
                            type: 'rest',
                            name: 'Recovery',
                            seconds: '30',
                            createdAt: nowIso,
                            updatedAt: nowIso,
                        },
                    ],
                },
                {
                    id: existing.id,
                    name: 'Day One',
                    nodes: [
                        {
                            id: 'good-rest-2',
                            type: 'rest',
                            name: 'Recovery Two',
                            seconds: '45',
                            createdAt: nowIso,
                            updatedAt: nowIso,
                        },
                    ],
                },
            ],
        };

        const imported = mergeSavedSessionsFromImport([existing], payload);
        expect(imported.summary.imported).toBe(2);
        expect(imported.summary.renamed).toBe(2);
        expect(imported.summary.skipped).toBe(2);
        expect(imported.sessions).toHaveLength(3);
        expect(new Set(imported.sessions.map((session) => session.id)).size).toBe(3);
        expect(imported.sessions.some((session) => session.name.startsWith('Day One (Imported'))).toBe(true);
    });
});
