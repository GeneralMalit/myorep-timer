import type { SavedSession, SavedSessionExportRecordV1 } from '@/types/savedSessions';
import type { SavedWorkout, SavedWorkoutExportRecordV1 } from '@/types/savedWorkouts';
import type {
    SyncDomainSnapshot,
    SyncEntityKind,
    SyncPendingCounts,
    SyncQueueAction,
    SyncQueueEntry,
    SyncRecoveryBackup,
    SyncRemotePresence,
    SyncRemotePresenceSource,
    SyncWritePayload,
} from '@/types/syncDomain';
import type {
    SupabaseSavedSessionRow,
    SupabaseSavedSessionWriteRow,
    SupabaseSavedWorkoutRow,
    SupabaseSavedWorkoutWriteRow,
    SyncMetadata,
} from '@/types/sync';

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

const resolveTimestamp = (value: unknown, fallback: string): string => {
    return typeof value === 'string' && value.trim() ? value : fallback;
};

const createId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const cloneJsonArray = (value: unknown): unknown[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map((item) => {
        if (item && typeof item === 'object') {
            return Array.isArray(item) ? cloneJsonArray(item) : { ...(item as Record<string, unknown>) };
        }

        return item;
    });
};

const resolveDeduplicationKey = (entry: Pick<SyncQueueEntry, 'entity' | 'action' | 'localId'>): string => {
    return `${entry.entity}:${entry.action}:${entry.localId}`;
};

const normalizeQueueStatus = (
    status: SyncDomainSnapshot['queueStatus'],
    queue: SyncQueueEntry[],
): SyncDomainSnapshot['queueStatus'] => {
    if (status === 'syncing' || status === 'paused' || status === 'error') {
        return status;
    }

    return queue.length > 0 ? 'queued' : 'idle';
};

const buildPendingCounts = (queue: SyncQueueEntry[]): SyncPendingCounts => {
    const counts: SyncPendingCounts = {
        workouts: 0,
        sessions: 0,
        upserts: 0,
        deletes: 0,
        total: queue.length,
    };

    queue.forEach((entry) => {
        if (entry.entity === 'workout') {
            counts.workouts += 1;
        } else {
            counts.sessions += 1;
        }

        if (entry.action === 'delete') {
            counts.deletes += 1;
        } else {
            counts.upserts += 1;
        }
    });

    return counts;
};

const normalizeSavedWorkoutSync = (
    workout: SavedWorkout,
    nowIso: string,
): SavedWorkoutExportRecordV1 => {
    return {
        ...workout,
        sync: normalizeSyncMetadata(workout.sync, workout.id, nowIso),
    };
};

const normalizeSavedSessionSync = (
    session: SavedSession,
    nowIso: string,
): SavedSessionExportRecordV1 => {
    return {
        ...session,
        nodes: cloneJsonArray(session.nodes) as SavedSession['nodes'],
        sync: normalizeSyncMetadata(session.sync, session.id, nowIso),
    };
};

export const createSyncMetadata = (localId: string, nowIso: string): SyncMetadata => {
    return {
        localId,
        remoteId: null,
        revision: 1,
        updatedAt: nowIso,
        dirty: true,
        pendingDelete: false,
        deletedAt: null,
        lastSyncedAt: null,
    };
};

export const normalizeSyncMetadata = (value: unknown, localId: string, nowIso: string): SyncMetadata => {
    if (!value || typeof value !== 'object') {
        return createSyncMetadata(localId, nowIso);
    }

    const record = value as Record<string, unknown>;
    const normalizedLocalId = typeof record.localId === 'string' && record.localId.trim()
        ? record.localId
        : localId;

    return {
        localId: normalizedLocalId,
        remoteId: typeof record.remoteId === 'string' && record.remoteId.trim()
            ? record.remoteId
            : null,
        revision: parsePositiveInt(record.revision) ?? 1,
        updatedAt: resolveTimestamp(record.updatedAt, nowIso),
        dirty: typeof record.dirty === 'boolean' ? record.dirty : true,
        pendingDelete: typeof record.pendingDelete === 'boolean' ? record.pendingDelete : false,
        deletedAt: resolveTimestamp(record.deletedAt, '') || null,
        lastSyncedAt: resolveTimestamp(record.lastSyncedAt, '') || null,
    };
};

export const touchSyncMetadata = (
    sync: SyncMetadata | undefined,
    localId: string,
    nowIso: string,
): SyncMetadata => {
    return {
        localId,
        remoteId: sync?.remoteId ?? null,
        revision: (sync?.revision ?? 0) + 1,
        updatedAt: nowIso,
        dirty: true,
        pendingDelete: sync?.pendingDelete ?? false,
        deletedAt: sync?.deletedAt ?? null,
        lastSyncedAt: sync?.lastSyncedAt ?? null,
    };
};

export const markSyncDeleted = (
    sync: SyncMetadata | undefined,
    localId: string,
    nowIso: string,
): SyncMetadata => {
    return {
        localId,
        remoteId: sync?.remoteId ?? null,
        revision: (sync?.revision ?? 0) + 1,
        updatedAt: nowIso,
        dirty: true,
        pendingDelete: true,
        deletedAt: nowIso,
        lastSyncedAt: sync?.lastSyncedAt ?? null,
    };
};

export const clearSyncMetadata = (
    sync: SyncMetadata | undefined,
    localId: string,
    nowIso: string,
): SyncMetadata => {
    return {
        localId,
        remoteId: sync?.remoteId ?? null,
        revision: (sync?.revision ?? 0) + 1,
        updatedAt: nowIso,
        dirty: false,
        pendingDelete: false,
        deletedAt: null,
        lastSyncedAt: nowIso,
    };
};

export const toSupabaseSavedWorkoutWriteRow = (
    workout: SavedWorkout,
    userId: string,
): SupabaseSavedWorkoutWriteRow => {
    const sync = workout.sync;
    const nowIso = sync?.updatedAt ?? workout.updatedAt;

    return {
        id: sync?.remoteId ?? undefined,
        user_id: userId,
        local_id: sync?.localId ?? workout.id,
        name: workout.name,
        sets: workout.sets,
        reps: workout.reps,
        seconds: workout.seconds,
        rest: workout.rest,
        myo_reps: workout.myoReps,
        myo_work_secs: workout.myoWorkSecs,
        times_used: workout.timesUsed,
        last_used_at: workout.lastUsedAt,
        revision: sync?.revision ?? 1,
        updated_at: nowIso,
        deleted_at: sync?.pendingDelete ? sync.deletedAt ?? nowIso : null,
    };
};

export const toSupabaseSavedSessionWriteRow = (
    session: SavedSession,
    userId: string,
): SupabaseSavedSessionWriteRow => {
    const sync = session.sync;
    const nowIso = sync?.updatedAt ?? session.updatedAt;

    return {
        id: sync?.remoteId ?? undefined,
        user_id: userId,
        local_id: sync?.localId ?? session.id,
        name: session.name,
        nodes: session.nodes,
        times_used: session.timesUsed,
        last_used_at: session.lastUsedAt,
        revision: sync?.revision ?? 1,
        updated_at: nowIso,
        deleted_at: sync?.pendingDelete ? sync.deletedAt ?? nowIso : null,
    };
};

const toLocalSyncMetadata = (
    row: Pick<SupabaseSavedWorkoutRow, 'id' | 'local_id' | 'revision' | 'updated_at' | 'deleted_at'> | Pick<SupabaseSavedSessionRow, 'id' | 'local_id' | 'revision' | 'updated_at' | 'deleted_at'>,
): SyncMetadata => {
    return {
        localId: row.local_id,
        remoteId: row.id,
        revision: parsePositiveInt(row.revision) ?? 1,
        updatedAt: row.updated_at,
        dirty: false,
        pendingDelete: row.deleted_at !== null,
        deletedAt: row.deleted_at,
        lastSyncedAt: row.updated_at,
    };
};

export const fromSupabaseSavedWorkoutRow = (
    row: SupabaseSavedWorkoutRow,
): SavedWorkout => {
    const nowIso = row.updated_at || new Date().toISOString();
    return {
        id: row.local_id,
        name: row.name,
        sets: row.sets,
        reps: row.reps,
        seconds: row.seconds,
        rest: row.rest,
        myoReps: row.myo_reps,
        myoWorkSecs: row.myo_work_secs,
        timesUsed: parsePositiveInt(row.times_used) ?? 0,
        lastUsedAt: row.last_used_at,
        createdAt: nowIso,
        updatedAt: row.updated_at,
        sync: toLocalSyncMetadata(row),
    };
};

export const fromSupabaseSavedSessionRow = (
    row: SupabaseSavedSessionRow,
): SavedSession => {
    const nowIso = row.updated_at || new Date().toISOString();
    return {
        id: row.local_id,
        name: row.name,
        nodes: cloneJsonArray(row.nodes) as SavedSession['nodes'],
        timesUsed: parsePositiveInt(row.times_used) ?? 0,
        lastUsedAt: row.last_used_at,
        createdAt: nowIso,
        updatedAt: row.updated_at,
        sync: toLocalSyncMetadata(row),
    };
};

export const buildRemotePresence = (
    rows: Array<
        Pick<SupabaseSavedWorkoutRow, 'id' | 'local_id' | 'revision' | 'updated_at' | 'deleted_at'>
        | Pick<SupabaseSavedSessionRow, 'id' | 'local_id' | 'revision' | 'updated_at' | 'deleted_at'>
    >,
    entity: SyncEntityKind,
    localId: string,
    remoteId?: string | null,
): SyncRemotePresence | null => {
    const byLocalId = rows.find((row) => row.local_id === localId);
    const byRemoteId = remoteId ? rows.find((row) => row.id === remoteId) : null;
    const matchedRow = byLocalId ?? byRemoteId ?? null;

    if (!matchedRow) {
        return null;
    }

    let source: SyncRemotePresenceSource = 'missing';
    if (byLocalId && byRemoteId) {
        source = 'both';
    } else if (byLocalId) {
        source = 'local-id';
    } else if (byRemoteId) {
        source = 'remote-id';
    }

    return {
        entity,
        localId: matchedRow.local_id,
        remoteId: matchedRow.id,
        hasRemoteRow: true,
        source,
        deletedAt: matchedRow.deleted_at,
        revision: parsePositiveInt(matchedRow.revision) ?? 1,
        updatedAt: matchedRow.updated_at,
        lastSyncedAt: matchedRow.updated_at,
    };
};

export const buildRemotePresenceMap = (
    rows: Array<
        Pick<SupabaseSavedWorkoutRow, 'id' | 'local_id' | 'revision' | 'updated_at' | 'deleted_at'>
        | Pick<SupabaseSavedSessionRow, 'id' | 'local_id' | 'revision' | 'updated_at' | 'deleted_at'>
    >,
    entity: SyncEntityKind,
): Record<string, SyncRemotePresence> => {
    return rows.reduce<Record<string, SyncRemotePresence>>((accumulator, row) => {
        const presence = buildRemotePresence(rows, entity, row.local_id, row.id);
        if (presence) {
            accumulator[row.local_id] = presence;
        }
        return accumulator;
    }, {});
};

export const inspectRemotePresence = (
    rows: Array<
        Pick<SupabaseSavedWorkoutRow, 'id' | 'local_id' | 'revision' | 'updated_at' | 'deleted_at'>
        | Pick<SupabaseSavedSessionRow, 'id' | 'local_id' | 'revision' | 'updated_at' | 'deleted_at'>
    >,
    entity: SyncEntityKind,
    localId: string,
    remoteId?: string | null,
): SyncRemotePresence => {
    const presence = buildRemotePresence(rows, entity, localId, remoteId);
    return presence ?? {
        entity,
        localId,
        remoteId: remoteId ?? null,
        hasRemoteRow: false,
        source: 'missing',
        deletedAt: null,
        revision: 0,
        updatedAt: '',
        lastSyncedAt: null,
    };
};

export const createSyncQueueEntry = (
    input: {
        entity: SyncEntityKind;
        action: SyncQueueAction;
        localId: string;
        remoteId?: string | null;
        localRevision?: number;
        nowIso?: string;
        id?: string;
    },
): SyncQueueEntry => {
    const nowIso = input.nowIso ?? new Date().toISOString();
    const localRevision = parsePositiveInt(input.localRevision) ?? 1;

    return {
        id: input.id ?? createId(),
        entity: input.entity,
        action: input.action,
        localId: input.localId,
        remoteId: input.remoteId ?? null,
        localRevision,
        queuedAt: nowIso,
        lastAttemptAt: null,
        attemptCount: 0,
        dedupeKey: resolveDeduplicationKey({
            entity: input.entity,
            action: input.action,
            localId: input.localId,
        }),
        error: null,
    };
};

export const dedupeSyncQueueEntries = (queue: SyncQueueEntry[]): SyncQueueEntry[] => {
    const seen = new Set<string>();
    const nextQueue: SyncQueueEntry[] = [];

    for (let index = queue.length - 1; index >= 0; index -= 1) {
        const entry = queue[index];
        const dedupeKey = entry.dedupeKey || resolveDeduplicationKey(entry);
        if (seen.has(dedupeKey)) {
            continue;
        }

        seen.add(dedupeKey);
        nextQueue.unshift({
            ...entry,
            dedupeKey,
        });
    }

    return nextQueue;
};

export const ackSyncQueueEntry = (
    queue: SyncQueueEntry[],
    entryId: string,
): SyncQueueEntry[] => {
    return queue.filter((entry) => entry.id !== entryId);
};

export const markSyncQueueEntryAttempt = (
    queue: SyncQueueEntry[],
    entryId: string,
    nowIso: string,
    error: string | null = null,
): SyncQueueEntry[] => {
    return queue.map((entry) => {
        if (entry.id !== entryId) {
            return entry;
        }

        return {
            ...entry,
            lastAttemptAt: nowIso,
            attemptCount: entry.attemptCount + 1,
            error,
        };
    });
};

export const countSyncQueueEntries = (queue: SyncQueueEntry[]): SyncPendingCounts => {
    return buildPendingCounts(queue);
};

export const normalizeSyncQueueStatus = (
    status: SyncDomainSnapshot['queueStatus'],
    queue: SyncQueueEntry[],
): SyncDomainSnapshot['queueStatus'] => {
    return normalizeQueueStatus(status, queue);
};

export const createSyncRecoveryBackup = (
    input: {
        reason: string;
        syncEnabled: boolean;
        firstSyncOnboardingState: SyncDomainSnapshot['firstSyncOnboardingState'];
        queueStatus?: SyncDomainSnapshot['queueStatus'];
        queue?: SyncQueueEntry[];
        workouts: SavedWorkout[];
        sessions: SavedSession[];
        nowIso?: string;
    },
): SyncRecoveryBackup => {
    const nowIso = input.nowIso ?? new Date().toISOString();
    const queue = dedupeSyncQueueEntries(input.queue ?? []);
    const queueStatus = normalizeQueueStatus(input.queueStatus ?? 'idle', queue);
    const pendingCounts = countSyncQueueEntries(queue);

    return {
        schemaVersion: 1,
        createdAt: nowIso,
        reason: input.reason,
        syncEnabled: input.syncEnabled,
        firstSyncOnboardingState: input.firstSyncOnboardingState,
        queueStatus,
        pendingCounts,
        queue,
        workouts: input.workouts.map((workout) => normalizeSavedWorkoutSync(workout, nowIso)),
        sessions: input.sessions.map((session) => normalizeSavedSessionSync(session, nowIso)),
    };
};

export const buildSyncWritePayload = (
    input: {
        workouts: SavedWorkout[];
        sessions: SavedSession[];
        deletedWorkoutIds?: string[];
        deletedSessionIds?: string[];
        userId: string;
    },
): SyncWritePayload => {
    const deletedWorkoutIds = input.deletedWorkoutIds ?? [];
    const deletedSessionIds = input.deletedSessionIds ?? [];

    return {
        workouts: input.workouts.map((workout) => toSupabaseSavedWorkoutWriteRow(workout, input.userId)),
        sessions: input.sessions.map((session) => toSupabaseSavedSessionWriteRow(session, input.userId)),
        deletedWorkoutIds,
        deletedSessionIds,
    };
};

export const isSyncAuthExpiredError = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    return /expired|invalid session|jwt|refresh token/i.test(message);
};
