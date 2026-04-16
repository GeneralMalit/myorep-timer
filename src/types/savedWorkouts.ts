import type { SyncMetadata } from '@/types/sync';

export const SAVED_WORKOUTS_SCHEMA_VERSION = 1 as const;
export type SavedWorkoutsSchemaVersion = typeof SAVED_WORKOUTS_SCHEMA_VERSION;

export interface SavedWorkoutConfig {
    sets: string;
    reps: string;
    seconds: string;
    rest: string;
    myoReps: string;
    myoWorkSecs: string;
}

export interface SavedWorkout extends SavedWorkoutConfig {
    id: string;
    name: string;
    timesUsed: number;
    lastUsedAt: string | null;
    createdAt: string;
    updatedAt: string;
    sync?: SyncMetadata;
}

export interface SavedWorkoutExportRecordV1 extends SavedWorkout {
    sync: SyncMetadata;
}

export interface SavedWorkoutsExportV1 {
    schemaVersion: SavedWorkoutsSchemaVersion;
    exportedAt: string;
    workouts: SavedWorkoutExportRecordV1[];
}

export interface SavedWorkoutsImportSummary {
    imported: number;
    renamed: number;
    skipped: number;
    errors: string[];
}
