import type { SavedSession } from '@/types/savedSessions';
import type { SavedWorkout } from '@/types/savedWorkouts';
import {
    SAVED_LIBRARY_SCHEMA_VERSION,
    type SavedLibraryExportV1,
    type SavedLibraryImportSummary,
} from '@/types/savedLibrary';
import { buildSavedSessionsExport, mergeSavedSessionsFromImport } from '@/utils/savedSessions';
import { buildSavedWorkoutsExport, mergeSavedWorkoutsFromImport } from '@/utils/savedWorkouts';

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null
);

const parsePersistedSnapshotState = (payload: unknown): unknown => {
    if (!isRecord(payload)) {
        return null;
    }

    if (!('state' in payload)) {
        return null;
    }

    return payload.state;
};

const resolveImportPayload = (payload: unknown): { workoutsPayload: unknown; sessionsPayload: unknown } => {
    const persistedState = parsePersistedSnapshotState(payload);
    if (persistedState) {
        return {
            workoutsPayload: persistedState,
            sessionsPayload: persistedState,
        };
    }

    return {
        workoutsPayload: payload,
        sessionsPayload: payload,
    };
};

const hasWorkoutPayload = (payload: unknown): boolean => {
    if (Array.isArray(payload)) {
        return true;
    }

    if (typeof payload !== 'object' || payload === null) {
        return false;
    }

    const record = payload as Record<string, unknown>;
    const nestedData = typeof record.data === 'object' && record.data !== null
        ? record.data as Record<string, unknown>
        : null;

    return Array.isArray(record.workouts)
        || 'workouts' in record
        || Array.isArray(record.savedWorkouts)
        || 'savedWorkouts' in record
        || Array.isArray(record.items)
        || 'items' in record
        || Array.isArray(nestedData?.workouts)
        || Boolean(nestedData && 'workouts' in nestedData);
};

const hasSessionPayload = (payload: unknown): boolean => {
    if (Array.isArray(payload)) {
        return false;
    }

    if (typeof payload !== 'object' || payload === null) {
        return false;
    }

    const record = payload as Record<string, unknown>;
    const nestedData = typeof record.data === 'object' && record.data !== null
        ? record.data as Record<string, unknown>
        : null;

    return Array.isArray(record.sessions)
        || 'sessions' in record
        || Array.isArray(record.savedSessions)
        || 'savedSessions' in record
        || Array.isArray(nestedData?.sessions)
        || Boolean(nestedData && 'sessions' in nestedData);
};

export const buildSavedLibraryExport = (
    workouts: SavedWorkout[],
    sessions: SavedSession[],
    exportedAt: string,
): SavedLibraryExportV1 => {
    const workoutsExport = buildSavedWorkoutsExport(workouts, exportedAt);
    const sessionsExport = buildSavedSessionsExport(sessions, exportedAt);

    return {
        schemaVersion: SAVED_LIBRARY_SCHEMA_VERSION,
        exportedAt,
        workouts: workoutsExport.workouts,
        sessions: sessionsExport.sessions,
    };
};

export const mergeSavedLibraryFromImport = (
    existing: { workouts: SavedWorkout[]; sessions: SavedSession[] },
    payload: unknown,
): { workouts: SavedWorkout[]; sessions: SavedSession[]; summary: SavedLibraryImportSummary } => {
    const { workoutsPayload, sessionsPayload } = resolveImportPayload(payload);
    const workoutImport = hasWorkoutPayload(workoutsPayload)
        ? mergeSavedWorkoutsFromImport(existing.workouts, workoutsPayload)
        : {
            workouts: existing.workouts,
            summary: { imported: 0, renamed: 0, skipped: 0, errors: [] },
            idMap: new Map<string, string>(),
        };
    const sessionImport = hasSessionPayload(sessionsPayload)
        ? mergeSavedSessionsFromImport(existing.sessions, sessionsPayload, {
            importedWorkoutIdMap: workoutImport.idMap,
        })
        : {
            sessions: existing.sessions,
            summary: { imported: 0, renamed: 0, skipped: 0, errors: [] },
        };

    return {
        workouts: workoutImport.workouts,
        sessions: sessionImport.sessions,
        summary: {
            workouts: {
                imported: workoutImport.summary.imported,
                renamed: workoutImport.summary.renamed,
                skipped: workoutImport.summary.skipped,
            },
            sessions: {
                imported: sessionImport.summary.imported,
                renamed: sessionImport.summary.renamed,
                skipped: sessionImport.summary.skipped,
            },
            errors: [
                ...workoutImport.summary.errors,
                ...sessionImport.summary.errors,
            ],
        },
    };
};
