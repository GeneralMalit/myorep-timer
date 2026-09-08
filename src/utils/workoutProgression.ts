import type { SavedWorkoutConfig } from '@/types/savedWorkouts';
import type { SessionNode, WorkoutSessionNode } from '@/types/savedSessions';
import { sanitizeSavedWorkoutConfig } from '@/utils/savedWorkouts';

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

/**
 * Normalize the per-block progression counter at every data boundary.
 *
 * Counters are deliberately numbers rather than parseable strings.  A
 * malformed persisted/imported value must never turn into a fractional,
 * negative, infinite, or unsafe counter.
 */
export const normalizeCompletedSessionsSinceProgression = (value: unknown): number => (
    typeof value === 'number'
        && Number.isFinite(value)
        && Number.isSafeInteger(value)
        && value >= 0
        ? value
        : 0
);

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
