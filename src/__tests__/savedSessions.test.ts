import { describe, expect, it } from 'vitest';
import {
    buildSavedSessionsExport,
    cloneSavedSession,
    cloneSessionNode,
    createRestSessionNode,
    createSavedSession,
    createWorkoutSessionNode,
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
        const node = createWorkoutSessionNode(
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
        const session = createSavedSession('Session A', [node, createRestSessionNode('Rest', '30', nowIso)], nowIso);
        expect(session.nodes).toHaveLength(2);

        const clonedNode = cloneSessionNode(node);
        const clonedSession = cloneSavedSession(session);

        expect(clonedNode).not.toBe(node);
        expect(clonedNode.id).toBe(node.id);
        expect(clonedSession).not.toBe(session);
        expect(clonedSession.nodes).toHaveLength(2);
        expect(clonedSession.nodes[0]).not.toBe(session.nodes[0]);
        expect(clonedSession.nodes[0].id).toBe(session.nodes[0].id);
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
                    nowIso,
                ),
            ],
            nowIso,
        );
        const exportPayload = buildSavedSessionsExport([session], nowIso);

        expect(exportPayload.schemaVersion).toBe(1);
        expect(exportPayload.sessions).toHaveLength(1);

        const imported = mergeSavedSessionsFromImport([], exportPayload);
        expect(imported.summary.imported).toBe(1);
        expect(imported.sessions).toHaveLength(1);
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
});
