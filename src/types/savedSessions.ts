import type { SavedWorkoutConfig } from '@/types/savedWorkouts';
import type { SyncMetadata } from '@/types/sync';

export const SAVED_SESSIONS_SCHEMA_VERSION = 1 as const;
export type SavedSessionsSchemaVersion = typeof SAVED_SESSIONS_SCHEMA_VERSION;

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
    notes?: string;
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
    sync?: SyncMetadata;
}

export interface SavedSessionExportRecordV1 extends SavedSession {
    sync: SyncMetadata;
}

export interface SavedSessionsExportV1 {
    schemaVersion: SavedSessionsSchemaVersion;
    exportedAt: string;
    sessions: SavedSessionExportRecordV1[];
}

export interface SavedSessionsImportSummary {
    imported: number;
    renamed: number;
    skipped: number;
    errors: string[];
}
