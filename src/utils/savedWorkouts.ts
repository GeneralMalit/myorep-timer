import {
    SAVED_WORKOUTS_SCHEMA_VERSION,
} from '@/types/savedWorkouts';
import type {
    SavedWorkout,
    SavedWorkoutConfig,
    SavedWorkoutExportRecordV1,
    SavedWorkoutsExportV1,
    SavedWorkoutsImportSummary,
} from '@/types/savedWorkouts';
import { createSyncMetadata, normalizeSyncMetadata } from '@/utils/sync';

const WORKOUT_CONFIG_KEYS: Array<keyof SavedWorkoutConfig> = [
    'sets',
    'reps',
    'seconds',
    'rest',
    'myoReps',
    'myoWorkSecs',
];

const parsePositiveInt = (value: unknown): number | null => {
    if (typeof value !== 'string' && typeof value !== 'number') {
        return null;
    }

    const parsed = typeof value === 'number' ? value : parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }

    return Math.floor(parsed);
};

const toNormalizedString = (value: unknown): string => {
    const parsed = parsePositiveInt(value);
    return parsed === null ? '' : String(parsed);
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const hasValidBaseConfig = (config: SavedWorkoutConfig): boolean => {
    return parsePositiveInt(config.sets) !== null
        && parsePositiveInt(config.reps) !== null
        && parsePositiveInt(config.seconds) !== null;
};

const hasValidClusterConfig = (config: SavedWorkoutConfig): boolean => {
    return parsePositiveInt(config.rest) !== null
        && parsePositiveInt(config.myoReps) !== null
        && parsePositiveInt(config.myoWorkSecs) !== null;
};

export const normalizeSetsInput = (value: string): string => {
    if (value === '') {
        return '';
    }

    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return '';
    }

    return String(Math.max(1, Math.floor(parsed)));
};

export const sanitizeSavedWorkoutConfig = (config: Partial<SavedWorkoutConfig>): SavedWorkoutConfig => {
    return {
        sets: normalizeSetsInput(config.sets ?? ''),
        reps: toNormalizedString(config.reps ?? ''),
        seconds: toNormalizedString(config.seconds ?? ''),
        rest: toNormalizedString(config.rest ?? ''),
        myoReps: toNormalizedString(config.myoReps ?? ''),
        myoWorkSecs: toNormalizedString(config.myoWorkSecs ?? ''),
    };
};

export const isValidWorkoutConfig = (config: SavedWorkoutConfig): boolean => {
    const parsedSets = parsePositiveInt(config.sets);
    if (parsedSets === null || !hasValidBaseConfig(config)) {
        return false;
    }

    return parsedSets === 1 ? true : hasValidClusterConfig(config);
};

export const createSavedWorkout = (name: string, config: SavedWorkoutConfig, nowIso: string): SavedWorkout => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const normalizedName = name.trim();
    return {
        id,
        name: normalizedName,
        ...config,
        timesUsed: 0,
        lastUsedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        sync: createSyncMetadata(id, nowIso),
    };
};

export const toSavedWorkoutExportRecord = (workout: SavedWorkout, nowIso: string): SavedWorkoutExportRecordV1 => {
    return {
        ...workout,
        sync: normalizeSyncMetadata(workout.sync, workout.id, nowIso),
    };
};

export const buildSavedWorkoutsExport = (workouts: SavedWorkout[], exportedAt: string): SavedWorkoutsExportV1 => {
    return {
        schemaVersion: SAVED_WORKOUTS_SCHEMA_VERSION,
        exportedAt,
        workouts: workouts.map((workout) => toSavedWorkoutExportRecord(workout, exportedAt)),
    };
};

const normalizeName = (value: string): string => value.trim().toLowerCase();

const resolveImportedName = (name: string, usedNames: Set<string>): { name: string; renamed: boolean } => {
    const original = name.trim();
    const normalizedOriginal = normalizeName(original);

    if (!usedNames.has(normalizedOriginal)) {
        usedNames.add(normalizedOriginal);
        return { name: original, renamed: false };
    }

    let suffix = 2;
    while (true) {
        const candidate = `${original} (Imported ${suffix})`;
        const normalizedCandidate = normalizeName(candidate);
        if (!usedNames.has(normalizedCandidate)) {
            usedNames.add(normalizedCandidate);
            return { name: candidate, renamed: true };
        }
        suffix += 1;
    }
};

const resolveWorkoutImportRecords = (payload: unknown): unknown[] | null => {
    if (Array.isArray(payload)) {
        return payload;
    }

    if (!isRecord(payload)) {
        return null;
    }

    if (Array.isArray(payload.workouts)) {
        return payload.workouts;
    }

    const nestedData = isRecord(payload.data) ? payload.data : null;
    if (nestedData && Array.isArray(nestedData.workouts)) {
        return nestedData.workouts;
    }

    if (Array.isArray(payload.items)) {
        return payload.items;
    }

    return null;
};

const toSavedWorkoutRecord = (value: unknown): SavedWorkout | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const record = value as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name) {
        return null;
    }

    const sanitizedConfig = sanitizeSavedWorkoutConfig({
        sets: record.sets as string,
        reps: record.reps as string,
        seconds: record.seconds as string,
        rest: record.rest as string,
        myoReps: record.myoReps as string,
        myoWorkSecs: record.myoWorkSecs as string,
    });

    if (!isValidWorkoutConfig(sanitizedConfig)) {
        return null;
    }

    const nowIso = new Date().toISOString();
    const id = typeof record.id === 'string' && record.id.trim()
        ? record.id
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    return {
        id,
        name,
        ...sanitizedConfig,
        timesUsed: parsePositiveInt(record.timesUsed) ?? 0,
        lastUsedAt: typeof record.lastUsedAt === 'string' ? record.lastUsedAt : null,
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : nowIso,
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : nowIso,
        sync: normalizeSyncMetadata(record.sync, id, nowIso),
    };
};

export const mergeSavedWorkoutsFromImport = (
    existing: SavedWorkout[],
    payload: unknown,
): { workouts: SavedWorkout[]; summary: SavedWorkoutsImportSummary } => {
    const summary: SavedWorkoutsImportSummary = {
        imported: 0,
        renamed: 0,
        skipped: 0,
        errors: [],
    };

    if (!payload || typeof payload !== 'object') {
        summary.errors.push('Invalid import payload.');
        return { workouts: existing, summary };
    }

    const parsedPayload = payload as Record<string, unknown>;
    const importedRecords = resolveWorkoutImportRecords(payload);
    if (!importedRecords) {
        if (typeof parsedPayload.schemaVersion === 'number' && parsedPayload.schemaVersion !== 1) {
            summary.errors.push('Unsupported schema version.');
        } else {
            summary.errors.push('Missing workouts array.');
        }
        return { workouts: existing, summary };
    }

    const nextWorkouts = [...existing];
    const usedNames = new Set(existing.map((workout) => normalizeName(workout.name)));

    importedRecords.forEach((workout, index) => {
        const parsedWorkout = toSavedWorkoutRecord(workout);
        if (!parsedWorkout) {
            summary.skipped += 1;
            summary.errors.push(`Skipped invalid workout at index ${index}.`);
            return;
        }

        const resolvedName = resolveImportedName(parsedWorkout.name, usedNames);
        if (resolvedName.renamed) {
            summary.renamed += 1;
        }

        nextWorkouts.push({
            ...parsedWorkout,
            name: resolvedName.name,
        });
        summary.imported += 1;
    });

    return { workouts: nextWorkouts, summary };
};

export const pickConfigFromState = (state: SavedWorkoutConfig): SavedWorkoutConfig => {
    const picked = {} as SavedWorkoutConfig;
    WORKOUT_CONFIG_KEYS.forEach((key) => {
        picked[key] = state[key];
    });
    return picked;
};
