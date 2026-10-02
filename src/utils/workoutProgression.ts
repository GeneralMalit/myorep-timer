import type { SavedSession, SessionNode, WorkoutSessionNode } from '@/types/savedSessions';
import type { SavedWorkout, SavedWorkoutConfig } from '@/types/savedWorkouts';
import {
    normalizeCompletedSessionsSinceProgression,
    normalizeSavedWorkout,
    sanitizeSavedWorkoutConfig,
} from '@/utils/savedWorkouts';

export { normalizeCompletedSessionsSinceProgression };

/** The default number of completed sessions before a builder reminder appears. */
export const DEFAULT_PROGRESSION_REMINDER_THRESHOLD = 3 as const;

/**
 * Generic, valid values used when a new workout block is added to a session.
 *
 * Keep this independent from the standalone workout form.  The standalone
 * form may intentionally be blank while a newly added session block must be
 * immediately editable and valid.
 */
export const DEFAULT_WORKOUT_CONFIG: Readonly<SavedWorkoutConfig> = Object.freeze({
    sets: '3',
    reps: '15',
    seconds: '2',
    rest: '20',
    myoReps: '5',
    myoWorkSecs: '2',
});

/** Descriptive alias for callers that use the session-node terminology. */
export const DEFAULT_WORKOUT_SESSION_NODE_CONFIG = DEFAULT_WORKOUT_CONFIG;
/** Store-facing copy for the generic session workout defaults. */
export const DEFAULT_SESSION_WORKOUT_CONFIG: SavedWorkoutConfig = { ...DEFAULT_WORKOUT_CONFIG };

const WORKOUT_CONFIG_KEYS: Array<keyof SavedWorkoutConfig> = [
    'sets',
    'reps',
    'seconds',
    'rest',
    'myoReps',
    'myoWorkSecs',
];

/** Return a mutable copy of the generic new-block config. */
export const createDefaultWorkoutConfig = (): SavedWorkoutConfig => ({
    ...DEFAULT_WORKOUT_CONFIG,
});

const normalizeWorkoutSourceId = (value: unknown): string | null => (
    typeof value === 'string' && value.trim() ? value.trim() : null
);

const normalizeWorkoutNotes = (value: unknown): string => (
    typeof value === 'string' ? value : ''
);

export type NormalizedWorkoutSessionNode<T extends WorkoutSessionNode = WorkoutSessionNode> = Omit<
    T,
    'completedSessionsSinceProgression'
> & {
    completedSessionsSinceProgression: number;
};

/**
 * Normalize the metadata that participates in progression comparisons and
 * persistence.  The generic type keeps any caller-specific fields intact.
 */
export const normalizeWorkoutSessionNode = <T extends WorkoutSessionNode>(
    node: T,
    options?: { resetProgression?: boolean },
): NormalizedWorkoutSessionNode<T> => ({
    ...node,
    config: sanitizeSavedWorkoutConfig(node.config ?? {}),
    sourceWorkoutId: normalizeWorkoutSourceId(node.sourceWorkoutId),
    notes: normalizeWorkoutNotes(node.notes),
    completedSessionsSinceProgression: options?.resetProgression
        ? 0
        : normalizeCompletedSessionsSinceProgression(node.completedSessionsSinceProgression),
}) as NormalizedWorkoutSessionNode<T>;

/** Normalize a session node while leaving rest nodes untouched. */
export function normalizeSessionNode<T extends WorkoutSessionNode>(
    node: T,
    options?: { resetProgression?: boolean },
): NormalizedWorkoutSessionNode<T>;
export function normalizeSessionNode<T extends SessionNode>(
    node: T,
    options?: { resetProgression?: boolean },
): T;
export function normalizeSessionNode<T extends SessionNode>(
    node: T,
    options?: { resetProgression?: boolean },
): T {
    return (node.type === 'workout'
        ? normalizeWorkoutSessionNode(node, options)
        : { ...node }) as T;
}

/** Normalize JSON-shaped session nodes received from persistence or sync. */
export const normalizeSessionNodeForPersistence = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return value;
    }

    const node = value as Record<string, unknown>;
    if (node.type !== 'workout') {
        return { ...node };
    }

    return {
        ...node,
        sourceWorkoutId: normalizeWorkoutSourceId(node.sourceWorkoutId),
        notes: normalizeWorkoutNotes(node.notes),
        completedSessionsSinceProgression: normalizeCompletedSessionsSinceProgression(
            node.completedSessionsSinceProgression,
        ),
    };
};

export const normalizeSessionNodesForPersistence = (value: unknown): unknown[] => (
    Array.isArray(value)
        ? value.map((node) => normalizeSessionNodeForPersistence(node))
        : []
);

export type LinkedWorkoutNameChange = {
    previousName: string;
    nextName: string;
};

export const workoutConfigsMatch = (left: SavedWorkoutConfig, right: SavedWorkoutConfig): boolean => {
    const sanitizedLeft = sanitizeSavedWorkoutConfig(left);
    const sanitizedRight = sanitizeSavedWorkoutConfig(right);
    return WORKOUT_CONFIG_KEYS.every((key) => sanitizedLeft[key] === sanitizedRight[key]);
};

/** Project canonical saved-workout fields onto every live linked session node. */
export const projectLinkedWorkoutState = (
    workouts: SavedWorkout[],
    sessions: SavedSession[],
    nameChanges: ReadonlyMap<string, LinkedWorkoutNameChange> = new Map(),
): { workouts: SavedWorkout[]; sessions: SavedSession[] } => {
    const workoutsById = new Map(
        workouts
            .filter((workout) => !workout.sync?.pendingDelete)
            .map((workout) => [workout.id, workout] as const),
    );
    const projectedSessions = sessions.map((session) => {
        if (session.sync?.pendingDelete) {
            return session;
        }

        let changed = false;
        const nodes = session.nodes.map((node) => {
            if (node.type !== 'workout') {
                return node;
            }

            const sourceWorkoutId = normalizeWorkoutSourceId(node.sourceWorkoutId);
            const workout = sourceWorkoutId ? workoutsById.get(sourceWorkoutId) : undefined;
            if (!workout) {
                return node;
            }

            const sourceConfig = sanitizeSavedWorkoutConfig(workout);
            const sourceNotes = typeof workout.notes === 'string' ? workout.notes : '';
            const sourceCount = normalizeCompletedSessionsSinceProgression(
                workout.completedSessionsSinceProgression,
            );
            const nameChange = nameChanges.get(workout.id);
            const name = nameChange && node.name === nameChange.previousName
                ? nameChange.nextName
                : node.name;
            if (
                workoutConfigsMatch(node.config, sourceConfig)
                && normalizeWorkoutNotes(node.notes) === sourceNotes
                && normalizeCompletedSessionsSinceProgression(node.completedSessionsSinceProgression) === sourceCount
                && node.name === name
            ) {
                return node;
            }

            changed = true;
            return {
                ...node,
                name,
                config: sourceConfig,
                notes: sourceNotes,
                completedSessionsSinceProgression: sourceCount,
            };
        });

        return changed ? { ...session, nodes } : session;
    });

    return { workouts, sessions: projectedSessions };
};

/**
 * Migrate legacy node-local linked counters and notes into their source record,
 * then project the source's shared configuration and progression into links.
 * Duplicate linked blocks use max, not sum, because they record the same
 * completed session history.
 */
export const reconcileLinkedWorkoutState = (
    workouts: SavedWorkout[],
    sessions: SavedSession[],
    options?: { includeLinkedCounters?: boolean },
): { workouts: SavedWorkout[]; sessions: SavedSession[] } => {
    const normalizedSessions = sessions.map((session) => ({
        ...session,
        nodes: session.nodes.map((node) => normalizeSessionNode(node)),
    }));
    const sourceWorkoutsById = new Map(
        workouts
            .filter((workout) => !workout.sync?.pendingDelete)
            .map((workout) => [workout.id, workout] as const),
    );
    const progressionCounts = new Map<string, number>();
    const legacyProgressionSources = new Set<string>();
    const migratedNotes = new Map<string, { notes: string; updatedAt: number }>();

    sourceWorkoutsById.forEach((workout, workoutId) => {
        const count = normalizeCompletedSessionsSinceProgression(workout.completedSessionsSinceProgression);
        progressionCounts.set(workoutId, count);
        if (
            options?.includeLinkedCounters
            || typeof workout.completedSessionsSinceProgression !== 'number'
            || workout.completedSessionsSinceProgression !== count
        ) {
            legacyProgressionSources.add(workoutId);
        }
    });

    normalizedSessions.forEach((session) => {
        if (session.sync?.pendingDelete) {
            return;
        }

        session.nodes.forEach((node) => {
            if (node.type !== 'workout' || !node.sourceWorkoutId || !sourceWorkoutsById.has(node.sourceWorkoutId)) {
                return;
            }

            if (legacyProgressionSources.has(node.sourceWorkoutId)) {
                progressionCounts.set(
                    node.sourceWorkoutId,
                    Math.max(
                        progressionCounts.get(node.sourceWorkoutId) ?? 0,
                        normalizeCompletedSessionsSinceProgression(node.completedSessionsSinceProgression),
                    ),
                );
            }
            const sourceWorkout = sourceWorkoutsById.get(node.sourceWorkoutId)!;
            if (typeof sourceWorkout.notes === 'string') {
                return;
            }

            const updatedAt = Date.parse(node.updatedAt);
            const previous = migratedNotes.get(node.sourceWorkoutId);
            if (!previous || (Number.isFinite(updatedAt) ? updatedAt : 0) >= previous.updatedAt) {
                migratedNotes.set(node.sourceWorkoutId, {
                    notes: normalizeWorkoutNotes(node.notes),
                    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
                });
            }
        });
    });

    const normalizedWorkouts = workouts.map((workout) => normalizeSavedWorkout({
        ...workout,
        notes: typeof workout.notes === 'string'
            ? workout.notes
            : migratedNotes.get(workout.id)?.notes ?? '',
        completedSessionsSinceProgression: progressionCounts.get(workout.id)
            ?? normalizeCompletedSessionsSinceProgression(workout.completedSessionsSinceProgression),
    }));

    return projectLinkedWorkoutState(normalizedWorkouts, normalizedSessions);
};

/**
 * Compare only values that represent a progression edit for one workout
 * block. Names and timestamps intentionally do not participate.
 */
export const hasProgressionRelevantWorkoutChange = (
    previous: Pick<WorkoutSessionNode, 'config' | 'sourceWorkoutId' | 'notes'>,
    next: Pick<WorkoutSessionNode, 'config' | 'sourceWorkoutId' | 'notes'>,
): boolean => {
    const previousConfig = sanitizeSavedWorkoutConfig(previous.config ?? {});
    const nextConfig = sanitizeSavedWorkoutConfig(next.config ?? {});

    if (WORKOUT_CONFIG_KEYS.some((key) => previousConfig[key] !== nextConfig[key])) {
        return true;
    }

    if (normalizeWorkoutNotes(previous.notes) !== normalizeWorkoutNotes(next.notes)) {
        return true;
    }

    return normalizeWorkoutSourceId(previous.sourceWorkoutId) !== normalizeWorkoutSourceId(next.sourceWorkoutId);
};

/** Read the normalized progression value without mutating an input node. */
export const getCompletedSessionsSinceProgression = (
    node: Pick<WorkoutSessionNode, 'completedSessionsSinceProgression'>,
): number => normalizeCompletedSessionsSinceProgression(node.completedSessionsSinceProgression);

// Compatibility aliases make the intent discoverable for callers that use
// either the predicate or the verb form while keeping one implementation.
export const isProgressionRelevantWorkoutChange = hasProgressionRelevantWorkoutChange;
export const hasProgressionChange = hasProgressionRelevantWorkoutChange;
export const hasWorkoutProgressionChanged = hasProgressionRelevantWorkoutChange;
export const normalizeSessionNodeProgression = normalizeSessionNode;
