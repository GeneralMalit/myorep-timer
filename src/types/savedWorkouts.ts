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
}

export interface SavedWorkoutsExportV1 {
    schemaVersion: 1;
    exportedAt: string;
    workouts: SavedWorkout[];
}

export interface SavedWorkoutsImportSummary {
    imported: number;
    renamed: number;
    skipped: number;
    errors: string[];
}

