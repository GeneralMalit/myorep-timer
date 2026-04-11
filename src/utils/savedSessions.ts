import type { SavedWorkoutConfig } from '@/types/savedWorkouts';
import type {
    RestSessionNode,
    SavedSession,
    SavedSessionsExportV1,
    SavedSessionsImportSummary,
    SessionNode,
    WorkoutSessionNode,
} from '@/types/savedSessions';
import { isValidWorkoutConfig, sanitizeSavedWorkoutConfig } from '@/utils/savedWorkouts';

const SESSION_NODE_KEYS: Array<keyof SavedWorkoutConfig> = [
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

const formatClockTime = (totalSeconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const estimateWorkoutNodeDurationSeconds = (node: WorkoutSessionNode): number | null => {
    const sets = parsePositiveInt(node.config.sets);
    const reps = parsePositiveInt(node.config.reps);
    const seconds = parsePositiveInt(node.config.seconds);

    if (sets === null || reps === null || seconds === null) {
        return null;
    }

    if (sets === 1) {
        return reps * seconds;
    }

    const rest = parsePositiveInt(node.config.rest);
    const myoReps = parsePositiveInt(node.config.myoReps);
    const myoWorkSecs = parsePositiveInt(node.config.myoWorkSecs);

    if (rest === null || myoReps === null || myoWorkSecs === null) {
        return null;
    }

    return (reps * seconds) + ((sets - 1) * (rest + (myoReps * myoWorkSecs)));
};

export const estimateSessionDurationSeconds = (
    session: Pick<SavedSession, 'nodes'>,
    prepTimeSeconds: number,
): number | null => {
    if (session.nodes.length === 0) {
        return 0;
    }

    const prepTime = parsePositiveInt(prepTimeSeconds);
    if (prepTime === null) {
        return null;
    }

    let totalSeconds = prepTime;

    for (const node of session.nodes) {
        if (node.type === 'rest') {
            const restSeconds = parsePositiveInt(node.seconds);
            if (restSeconds === null) {
                return null;
            }

            totalSeconds += restSeconds;
            continue;
        }

        const workoutSeconds = estimateWorkoutNodeDurationSeconds(node);
        if (workoutSeconds === null) {
            return null;
        }

        totalSeconds += workoutSeconds;
    }

    return totalSeconds;
};

export const formatEstimatedSessionDuration = (totalSeconds: number | null): string => {
    if (totalSeconds === null) {
        return '--:--';
    }

    return formatClockTime(totalSeconds);
};

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const normalizeName = (value: string) => value.trim();

const normalizeSessionNodeConfig = (config: Partial<SavedWorkoutConfig>): SavedWorkoutConfig => {
    const sanitized = sanitizeSavedWorkoutConfig(config);
    const picked = {} as SavedWorkoutConfig;

    SESSION_NODE_KEYS.forEach((key) => {
        picked[key] = sanitized[key];
    });

    return picked;
};

const cloneNodeIdentity = <T extends SessionNode>(node: T, nowIso?: string): T => {
    if (!nowIso) {
        return node.type === 'workout'
            ? {
                ...node,
                config: { ...node.config },
            } as T
            : {
                ...node,
            } as T;
    }

    const nextId = createId();
    return node.type === 'workout'
        ? {
            ...node,
            id: nextId,
            config: { ...node.config },
            createdAt: nowIso,
            updatedAt: nowIso,
        } as T
        : {
            ...node,
            id: nextId,
            createdAt: nowIso,
            updatedAt: nowIso,
        } as T;
};

const resolveSessionExportedAt = (exportedAt?: string) => exportedAt ?? new Date().toISOString();

const resolveImportedName = (name: string, usedNames: Set<string>): { name: string; renamed: boolean } => {
    const original = name.trim();
    const normalizedOriginal = original.toLowerCase();

    if (!usedNames.has(normalizedOriginal)) {
        usedNames.add(normalizedOriginal);
        return { name: original, renamed: false };
    }

    let suffix = 2;
    while (true) {
        const candidate = `${original} (Imported ${suffix})`;
        const normalizedCandidate = candidate.toLowerCase();
        if (!usedNames.has(normalizedCandidate)) {
            usedNames.add(normalizedCandidate);
            return { name: candidate, renamed: true };
        }
        suffix += 1;
    }
};

const resolveImportedSessionId = (candidateId: unknown, usedIds: Set<string>): string => {
    const originalId = typeof candidateId === 'string' ? candidateId.trim() : '';
    if (originalId && !usedIds.has(originalId)) {
        usedIds.add(originalId);
        return originalId;
    }

    let nextId = createId();
    while (usedIds.has(nextId)) {
        nextId = createId();
    }

    usedIds.add(nextId);
    return nextId;
};

const toImportedSessionNode = (value: unknown): SessionNode | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const record = value as Record<string, unknown>;
    const type = record.type;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const nowIso = typeof record.createdAt === 'string' && record.createdAt ? record.createdAt : new Date().toISOString();

    if (!name || (type !== 'workout' && type !== 'rest')) {
        return null;
    }

    if (type === 'rest') {
        const seconds = sanitizeRestNodeSeconds(record.seconds);
        if (!seconds) {
            return null;
        }

        return {
            id: typeof record.id === 'string' && record.id.trim() ? record.id : createId(),
            type: 'rest',
            name,
            seconds,
            createdAt: nowIso,
            updatedAt: typeof record.updatedAt === 'string' && record.updatedAt ? record.updatedAt : nowIso,
        };
    }

    const configRecord = record.config && typeof record.config === 'object'
        ? (record.config as Record<string, unknown>)
        : record;

    const config = normalizeSessionNodeConfig({
        sets: configRecord.sets as string,
        reps: configRecord.reps as string,
        seconds: configRecord.seconds as string,
        rest: configRecord.rest as string,
        myoReps: configRecord.myoReps as string,
        myoWorkSecs: configRecord.myoWorkSecs as string,
    });

    if (!isValidWorkoutConfig(config)) {
        return null;
    }

    return {
        id: typeof record.id === 'string' && record.id.trim() ? record.id : createId(),
        type: 'workout',
        name,
        config,
        sourceWorkoutId: typeof record.sourceWorkoutId === 'string' && record.sourceWorkoutId.trim()
            ? record.sourceWorkoutId
            : null,
        createdAt: nowIso,
        updatedAt: typeof record.updatedAt === 'string' && record.updatedAt ? record.updatedAt : nowIso,
    };
};

export const sanitizeRestNodeSeconds = (value: unknown): string => {
    if (value === undefined || value === null) {
        return '';
    }

    const parsed = parsePositiveInt(value);
    return parsed === null ? '' : String(parsed);
};

export const isValidRestNode = (node: Pick<RestSessionNode, 'seconds'>): boolean => {
    return parsePositiveInt(node.seconds) !== null;
};

export const createWorkoutSessionNode = (
    nameOrConfig: string | Partial<SavedWorkoutConfig>,
    configOrName: Partial<SavedWorkoutConfig> | string,
    nowIsoOrSourceWorkoutId?: string,
    sourceWorkoutId?: string | null,
): WorkoutSessionNode => {
    const nowIso = typeof nowIsoOrSourceWorkoutId === 'string' && sourceWorkoutId !== undefined
        ? nowIsoOrSourceWorkoutId
        : new Date().toISOString();

    if (typeof nameOrConfig === 'string') {
        const normalizedName = normalizeName(nameOrConfig) || 'Workout';
        const sanitizedConfig = normalizeSessionNodeConfig(configOrName as Partial<SavedWorkoutConfig>);
        return {
            id: createId(),
            type: 'workout',
            name: normalizedName,
            config: sanitizedConfig,
            sourceWorkoutId: sourceWorkoutId ?? null,
            createdAt: nowIso,
            updatedAt: nowIso,
        };
    }

    const sanitizedConfig = normalizeSessionNodeConfig(nameOrConfig);
    const normalizedName = typeof configOrName === 'string' ? normalizeName(configOrName) || 'Workout' : 'Workout';
    return {
        id: createId(),
        type: 'workout',
        name: normalizedName,
        config: sanitizedConfig,
        sourceWorkoutId: typeof nowIsoOrSourceWorkoutId === 'string' ? nowIsoOrSourceWorkoutId : null,
        createdAt: nowIso,
        updatedAt: nowIso,
    };
};

export const createRestSessionNode = (
    nameOrSeconds: string | number,
    secondsOrNowIso?: string | number,
    nowIso?: string,
): RestSessionNode => {
    if (nowIso !== undefined) {
        return {
            id: createId(),
            type: 'rest',
            name: normalizeName(String(nameOrSeconds)) || 'Rest',
            seconds: sanitizeRestNodeSeconds(secondsOrNowIso),
            createdAt: nowIso,
            updatedAt: nowIso,
        };
    }

    if (secondsOrNowIso === undefined) {
        return {
            id: createId(),
            type: 'rest',
            name: 'Rest',
            seconds: sanitizeRestNodeSeconds(nameOrSeconds),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
    }

    const generatedNowIso = new Date().toISOString();
    return {
        id: createId(),
        type: 'rest',
        name: normalizeName(String(nameOrSeconds)) || 'Rest',
        seconds: sanitizeRestNodeSeconds(secondsOrNowIso),
        createdAt: generatedNowIso,
        updatedAt: generatedNowIso,
    };
};

export const cloneSessionNode = <T extends SessionNode>(node: T, nowIso?: string): T => {
    return cloneNodeIdentity(node, nowIso);
};

export const cloneSavedSession = <T extends SavedSession>(session: T, nowIso?: string): T => {
    if (!nowIso) {
        return {
            ...session,
            nodes: session.nodes.map((node) => cloneSessionNode(node)),
        };
    }

    return {
        ...session,
        id: createId(),
        nodes: session.nodes.map((node) => cloneSessionNode(node, nowIso)),
        createdAt: nowIso,
        updatedAt: nowIso,
    };
};

export const moveNodeInArray = <T>(items: T[], index: number, direction: 'left' | 'right'): T[] => {
    const nextItems = [...items];
    const targetIndex = direction === 'left' ? index - 1 : index + 1;

    if (index < 0 || index >= nextItems.length || targetIndex < 0 || targetIndex >= nextItems.length) {
        return nextItems;
    }

    const [item] = nextItems.splice(index, 1);
    nextItems.splice(targetIndex, 0, item);
    return nextItems;
};

export const isValidSavedSession = (session: Pick<SavedSession, 'name' | 'nodes'>): boolean => {
    const normalizedName = normalizeName(session.name);
    if (!normalizedName || session.nodes.length === 0) {
        return false;
    }

    return session.nodes.every((node) => {
        if (!normalizeName(node.name)) {
            return false;
        }

        if (node.type === 'workout') {
            return isValidWorkoutConfig(normalizeSessionNodeConfig(node.config));
        }

        return isValidRestNode(node);
    });
};

export const hasLinkedWorkoutSource = (
    node: SessionNode,
    availableWorkoutIds: Iterable<string>,
): boolean => {
    if (node.type !== 'workout' || !node.sourceWorkoutId) {
        return false;
    }

    const workoutIdSet = availableWorkoutIds instanceof Set
        ? availableWorkoutIds
        : new Set(availableWorkoutIds);

    return workoutIdSet.has(node.sourceWorkoutId);
};

export const getLegacyWorkoutSessionNodes = (
    session: Pick<SavedSession, 'nodes'>,
    availableWorkoutIds: Iterable<string>,
): WorkoutSessionNode[] => {
    const workoutIdSet = availableWorkoutIds instanceof Set
        ? availableWorkoutIds
        : new Set(availableWorkoutIds);

    return session.nodes.filter((node): node is WorkoutSessionNode => (
        node.type === 'workout' && !hasLinkedWorkoutSource(node, workoutIdSet)
    ));
};

export const createSavedSession = (
    name: string,
    nodesOrNowIso?: SessionNode[] | string,
    nowIso?: string,
): SavedSession => {
    const generatedNowIso = nowIso
        ?? (typeof nodesOrNowIso === 'string' ? nodesOrNowIso : new Date().toISOString());
    const nodes = Array.isArray(nodesOrNowIso) ? nodesOrNowIso : [];

    return {
        id: createId(),
        name: normalizeName(name) || 'Saved Session',
        nodes: nodes.map((node) => cloneSessionNode(node, generatedNowIso)),
        timesUsed: 0,
        lastUsedAt: null,
        createdAt: generatedNowIso,
        updatedAt: generatedNowIso,
    };
};

export const buildSavedSessionsExport = (
    sessions: SavedSession[],
    exportedAt: string,
): SavedSessionsExportV1 => {
    return {
        schemaVersion: 1,
        exportedAt: resolveSessionExportedAt(exportedAt),
        sessions,
    };
};

export const mergeSavedSessionsFromImport = (
    existing: SavedSession[],
    payload: unknown,
): { sessions: SavedSession[]; summary: SavedSessionsImportSummary } => {
    const summary: SavedSessionsImportSummary = {
        imported: 0,
        renamed: 0,
        skipped: 0,
        errors: [],
    };

    if (!payload || typeof payload !== 'object') {
        summary.errors.push('Invalid import payload.');
        return { sessions: existing, summary };
    }

    const record = payload as Record<string, unknown>;
    if (record.schemaVersion !== 1) {
        summary.errors.push('Unsupported schema version.');
        return { sessions: existing, summary };
    }

    if (!Array.isArray(record.sessions)) {
        summary.errors.push('Missing sessions array.');
        return { sessions: existing, summary };
    }

    const nextSessions = [...existing];
    const usedNames = new Set(existing.map((session) => normalizeName(session.name).toLowerCase()));
    const usedIds = new Set(existing.map((session) => session.id));

    record.sessions.forEach((candidate, index) => {
        if (!candidate || typeof candidate !== 'object') {
            summary.skipped += 1;
            summary.errors.push(`Skipped invalid session at index ${index}.`);
            return;
        }

        const sessionRecord = candidate as Record<string, unknown>;
        const name = typeof sessionRecord.name === 'string' ? sessionRecord.name.trim() : '';
        if (!name || !Array.isArray(sessionRecord.nodes)) {
            summary.skipped += 1;
            summary.errors.push(`Skipped invalid session at index ${index}.`);
            return;
        }

        const nodes = sessionRecord.nodes
            .map((node) => toImportedSessionNode(node))
            .filter((node): node is SessionNode => node !== null);

        if (!isValidSavedSession({ name, nodes })) {
            summary.skipped += 1;
            summary.errors.push(`Skipped invalid session at index ${index}.`);
            return;
        }

        const resolvedName = resolveImportedName(name, usedNames);
        if (resolvedName.renamed) {
            summary.renamed += 1;
        }

        const nowIso = new Date().toISOString();
        nextSessions.push({
            id: resolveImportedSessionId(sessionRecord.id, usedIds),
            name: resolvedName.name,
            nodes: nodes.map((node) => cloneSessionNode(node, nowIso)),
            timesUsed: parsePositiveInt(sessionRecord.timesUsed) ?? 0,
            lastUsedAt: typeof sessionRecord.lastUsedAt === 'string' ? sessionRecord.lastUsedAt : null,
            createdAt: typeof sessionRecord.createdAt === 'string' && sessionRecord.createdAt ? sessionRecord.createdAt : nowIso,
            updatedAt: typeof sessionRecord.updatedAt === 'string' && sessionRecord.updatedAt ? sessionRecord.updatedAt : nowIso,
        });
        summary.imported += 1;
    });

    return { sessions: nextSessions, summary };
};
