import type { SavedSessionExportRecordV1 } from '@/types/savedSessions';
import type { SavedWorkoutExportRecordV1 } from '@/types/savedWorkouts';

export const SAVED_LIBRARY_SCHEMA_VERSION = 1 as const;
export type SavedLibrarySchemaVersion = typeof SAVED_LIBRARY_SCHEMA_VERSION;

export interface SavedLibraryImportEntitySummary {
    imported: number;
    renamed: number;
    skipped: number;
}

export interface SavedLibraryExportV1 {
    schemaVersion: SavedLibrarySchemaVersion;
    exportedAt: string;
    workouts: SavedWorkoutExportRecordV1[];
    sessions: SavedSessionExportRecordV1[];
}

export interface SavedLibraryImportSummary {
    workouts: SavedLibraryImportEntitySummary;
    sessions: SavedLibraryImportEntitySummary;
    errors: string[];
}
