import type { SavedWorkoutConfig } from '@/types/savedWorkouts';

export type SessionNodeType = 'workout' | 'rest';
export type SessionStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface SessionNodeBase {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
}

export interface WorkoutSessionNode extends SessionNodeBase {
    type: 'workout';
    config: SavedWorkoutConfig;
    sourceWorkoutId: string | null;
}

export interface RestSessionNode extends SessionNodeBase {
    type: 'rest';
    seconds: string;
}

export type SessionNode = WorkoutSessionNode | RestSessionNode;

export interface SavedSession {
    id: string;
    name: string;
    nodes: SessionNode[];
    timesUsed: number;
    lastUsedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface SavedSessionsExportV1 {
    schemaVersion: 1;
    exportedAt: string;
    sessions: SavedSession[];
}

export interface SavedSessionsImportSummary {
    imported: number;
    renamed: number;
    skipped: number;
    errors: string[];
}
