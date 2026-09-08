import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SavedSession } from '@/types/savedSessions';
import type { SavedWorkout } from '@/types/savedWorkouts';
import type { SyncQueueEntry } from '@/types/syncDomain';
import type { SupabaseSavedSessionRow, SupabaseSavedWorkoutRow } from '@/types/sync';
import {
    getSupabaseAuthCodeFromUrl,
    getSupabaseAuthRedirectUrl,
    getSupabaseClient,
    getSupabaseEnvironment,
    getSupabaseRuntimeState,
    isSupabaseConfigured,
    isSupabaseNativeAuthCallbackUrl,
    isSupabaseRecoveryUrl,
    resetSupabaseClientForTests,
    SUPABASE_NATIVE_REDIRECT_URL,
} from '@/lib/supabase';
import {
    loadSupabaseAccountState,
    resendSupabaseSignUpConfirmation,
    sendSupabasePasswordReset,
    signInSupabaseWithPassword,
    signOutSupabase,
    signUpSupabaseWithPassword,
    updateSupabasePassword,
    updateSupabaseUsername,
} from '@/lib/supabaseAccount';
import {
    fromSupabaseSavedSessionRow as fromRemoteSessionRow,
    fromSupabaseSavedWorkoutRow as fromRemoteWorkoutRow,
    inspectRemoteSyncPresence,
    overwriteRemoteLibraryWithLocal,
    pushSessionMutation,
    pushWorkoutMutation,
    SYNC_MAX_LIBRARY_ROWS,
    fetchRemoteLibrarySnapshot,
} from '@/lib/supabaseSync';
import {
    openBillingPortal,
    refreshBillingEntitlementState,
    startBillingCheckout,
} from '@/lib/billing';
import { buildSavedLibraryExport, mergeSavedLibraryFromImport } from '@/utils/savedLibrary';
import {
    createRestSessionNode,
    createSavedSession,
    createWorkoutSessionNode,
} from '@/utils/savedSessions';
import { createSavedWorkout } from '@/utils/savedWorkouts';
import {
    ackSyncQueueEntry,
    buildRemotePresence,
    buildRemotePresenceMap,
    buildSyncWritePayload,
    clearSyncMetadata,
    countSyncQueueEntries,
    createSyncQueueEntry,
    createSyncRecoveryBackup,
    dedupeSyncQueueEntries,
    fromSupabaseSavedSessionRow,
    fromSupabaseSavedWorkoutRow,
    inspectRemotePresence,
    isSyncAuthExpiredError,
    markSyncDeleted,
    markSyncQueueEntryAttempt,
    normalizeSyncMetadata,
    normalizeSyncQueueStatus,
    touchSyncMetadata,
} from '@/utils/sync';

const createClientMock = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({
    createClient: createClientMock,
}));

const NOW_ISO = '2026-08-05T00:00:00.000Z';
const USER_ID = '11111111-1111-4111-8111-111111111111';

const workoutConfig = {
    sets: '3',
    reps: '12',
    seconds: '3',
    rest: '20',
    myoReps: '4',
    myoWorkSecs: '2',
};

const workoutRow = (
    overrides: Partial<SupabaseSavedWorkoutRow> = {},
): SupabaseSavedWorkoutRow => ({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    user_id: USER_ID,
    local_id: 'local-workout-1',
    name: 'Remote workout',
    sets: '3',
    reps: '12',
    seconds: '3',
    rest: '20',
    myo_reps: '4',
    myo_work_secs: '2',
    times_used: 2,
    last_used_at: null,
    revision: 4,
    updated_at: NOW_ISO,
    deleted_at: null,
    created_at: NOW_ISO,
    ...overrides,
});

const sessionRow = (
    overrides: Partial<SupabaseSavedSessionRow> = {},
): SupabaseSavedSessionRow => ({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    user_id: USER_ID,
    local_id: 'local-session-1',
    name: 'Remote session',
    nodes: [],
    times_used: 3,
    last_used_at: null,
    revision: 5,
    updated_at: NOW_ISO,
    deleted_at: null,
    created_at: NOW_ISO,
    ...overrides,
});

const localWorkout = (overrides: Partial<SavedWorkout> = {}): SavedWorkout => {
    const workout = createSavedWorkout('Local workout', workoutConfig, NOW_ISO);
    return {
        ...workout,
        id: 'local-workout-1',
        sync: {
            ...workout.sync!,
            localId: 'local-workout-1',
            remoteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            revision: 3,
            baseRevision: 2,
        },
        ...overrides,
    };
};

const localSession = (overrides: Partial<SavedSession> = {}): SavedSession => {
    const session = createSavedSession('Local session', [createRestSessionNode('Rest', '30', NOW_ISO)], NOW_ISO);
    return {
        ...session,
        id: 'local-session-1',
        sync: {
            ...session.sync!,
            localId: 'local-session-1',
            remoteId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            revision: 4,
            baseRevision: 3,
        },
        ...overrides,
    };
};

const accountSession = (accessToken = 'access-token'): Session => ({
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 1_800_000_000,
    refresh_token: 'refresh-token',
    user: {
        id: USER_ID,
        app_metadata: {},
        user_metadata: { username: 'athlete_one' },
        aud: 'authenticated',
        created_at: NOW_ISO,
        email: 'athlete@example.com',
    },
});

const rpcClient = (data: unknown, error: unknown = null) => {
    const rpc = vi.fn().mockResolvedValue({ data, error });
    return {
        client: { rpc } as unknown as SupabaseClient,
        rpc,
    };
};

const accountQueryClient = (
    profileResult: { data: unknown; error: unknown },
    entitlementResult: { data: unknown; error: unknown },
) => {
    const from = vi.fn((table: string) => {
        const query: Record<string, ReturnType<typeof vi.fn>> = {};
        query.select = vi.fn(() => query);
        query.eq = vi.fn(() => query);
        query.maybeSingle = vi.fn().mockResolvedValue(
            table === 'profiles' ? profileResult : entitlementResult,
        );
        return query;
    });

    return { from } as unknown as SupabaseClient;
};

const setConfiguredSupabaseClient = (client: unknown, url = 'https://example.supabase.co') => {
    vi.stubEnv('VITE_ENABLE_SUPABASE', 'true');
    vi.stubEnv('VITE_SUPABASE_URL', url);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('VITE_SUPABASE_REDIRECT_URL', '');
    resetSupabaseClientForTests();
    createClientMock.mockReturnValue(client);
};

afterEach(() => {
    resetSupabaseClientForTests();
    createClientMock.mockReset();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('sync utility edge contracts', () => {
    it('normalizes legacy metadata values and derives safe base revisions', () => {
        expect(normalizeSyncMetadata(null, 'fallback', NOW_ISO)).toMatchObject({
            localId: 'fallback',
            revision: 1,
            baseRevision: 0,
        });

        expect(normalizeSyncMetadata({
            localId: 42,
            remoteId: '   ',
            revision: Number.POSITIVE_INFINITY,
            baseRevision: -1,
            updatedAt: 42,
            dirty: 'yes',
            pendingDelete: 'yes',
            deletedAt: 4,
            lastSyncedAt: {},
        }, 'fallback', NOW_ISO)).toEqual({
            localId: 'fallback',
            remoteId: null,
            revision: 1,
            baseRevision: 0,
            updatedAt: NOW_ISO,
            dirty: true,
            pendingDelete: false,
            deletedAt: null,
            lastSyncedAt: null,
        });

        expect(normalizeSyncMetadata({
            localId: 'local',
            remoteId: 'remote',
            revision: 7.9,
            baseRevision: '3.8',
            dirty: false,
            updatedAt: ' 2026-08-01 ',
        }, 'fallback', NOW_ISO)).toMatchObject({
            revision: 7,
            baseRevision: 3,
            updatedAt: ' 2026-08-01 ',
        });

        expect(normalizeSyncMetadata({
            remoteId: 'remote',
            revision: {},
            baseRevision: {},
            dirty: true,
        }, 'fallback', NOW_ISO).baseRevision).toBeNull();
    });

    it('derives edit, delete, and clear baselines for clean, dirty, and local metadata', () => {
        const cleanRemote = normalizeSyncMetadata({
            remoteId: 'remote',
            revision: 8,
            dirty: false,
        }, 'local', NOW_ISO);
        const dirtyRemote = { ...cleanRemote, dirty: true, baseRevision: null };

        expect(touchSyncMetadata(undefined, 'local', NOW_ISO)).toMatchObject({
            remoteId: null,
            revision: 1,
            baseRevision: 0,
        });
        expect(touchSyncMetadata({ ...cleanRemote, baseRevision: null }, 'local', NOW_ISO).baseRevision).toBe(8);
        expect(touchSyncMetadata(dirtyRemote, 'local', NOW_ISO).baseRevision).toBeNull();
        expect(markSyncDeleted({ ...cleanRemote, baseRevision: null }, 'local', NOW_ISO).baseRevision).toBe(8);
        expect(markSyncDeleted(dirtyRemote, 'local', NOW_ISO).baseRevision).toBeNull();
        expect(clearSyncMetadata({ ...cleanRemote, baseRevision: null }, 'local', NOW_ISO).baseRevision).toBe(8);
        expect(clearSyncMetadata(undefined, 'local', NOW_ISO)).toMatchObject({
            revision: 1,
            baseRevision: 0,
            lastSyncedAt: NOW_ISO,
        });
    });

    it('maps malformed remote rows without sharing session node containers', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(NOW_ISO));
        const nested = [{ id: 'nested' }];
        const nodes = [{ type: 'rest', seconds: '30' }, nested, 'marker'];
        const workout = fromSupabaseSavedWorkoutRow(workoutRow({
            updated_at: '',
            revision: 0,
            times_used: Number.NaN,
        }));
        const session = fromSupabaseSavedSessionRow(sessionRow({
            updated_at: '',
            revision: -4,
            times_used: -2,
            nodes,
        }));

        expect(workout).toMatchObject({ createdAt: NOW_ISO, timesUsed: 0 });
        expect(workout.sync).toMatchObject({ revision: 1, baseRevision: 1 });
        expect(session).toMatchObject({ createdAt: NOW_ISO, timesUsed: 0 });
        expect(session.nodes).not.toBe(nodes);
        expect(session.nodes[0]).not.toBe(nodes[0]);
        expect(session.nodes[1]).not.toBe(nested);
        expect(session.nodes[2]).toBe('marker');

        expect(fromSupabaseSavedSessionRow(sessionRow({ nodes: null as never })).nodes).toEqual([]);
    });

    it('distinguishes local-id, remote-id, both, and missing remote presence', () => {
        const first = workoutRow({ id: 'remote-a', local_id: 'local-a', revision: 0 });
        const second = workoutRow({ id: 'remote-b', local_id: 'local-b' });

        expect(buildRemotePresence([first, second], 'workout', 'local-a', 'remote-a')).toMatchObject({
            source: 'both',
            revision: 1,
        });
        expect(buildRemotePresence([first, second], 'workout', 'local-a', 'other')).toMatchObject({
            source: 'local-id',
        });
        expect(buildRemotePresence([first, second], 'workout', 'other', 'remote-b')).toMatchObject({
            source: 'remote-id',
            localId: 'local-b',
        });
        expect(buildRemotePresence([first], 'workout', 'missing')).toBeNull();
        expect(inspectRemotePresence([first], 'workout', 'missing', 'remote-missing')).toEqual({
            entity: 'workout',
            localId: 'missing',
            remoteId: 'remote-missing',
            hasRemoteRow: false,
            source: 'missing',
            deletedAt: null,
            revision: 0,
            updatedAt: '',
            lastSyncedAt: null,
        });
        expect(inspectRemotePresence([first], 'workout', 'local-a')).toMatchObject({ source: 'local-id' });
        expect(Object.keys(buildRemotePresenceMap([first, second], 'workout'))).toEqual(['local-a', 'local-b']);
    });

    it('deduplicates, counts, acknowledges, and records attempts for queue entries', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(NOW_ISO));
        vi.spyOn(Math, 'random').mockReturnValue(0.5);

        const first = createSyncQueueEntry({
            entity: 'workout',
            action: 'upsert',
            localId: 'workout-a',
            localRevision: 0,
        });
        const stale = { ...first, id: 'stale', dedupeKey: '' };
        const latest = { ...first, id: 'latest', localRevision: 3 };
        const deletion = createSyncQueueEntry({
            id: 'delete-session',
            entity: 'session',
            action: 'delete',
            localId: 'session-a',
            remoteId: 'remote-session',
            localRevision: 2.8,
            nowIso: NOW_ISO,
        });

        expect(first).toMatchObject({
            id: expect.stringMatching(/^1785888000000-/),
            localRevision: 1,
            queuedAt: NOW_ISO,
            dedupeKey: 'workout:upsert:workout-a',
        });
        expect(deletion.localRevision).toBe(2);

        const queue = dedupeSyncQueueEntries([stale, latest, deletion]);
        expect(queue.map((entry) => entry.id)).toEqual(['latest', 'delete-session']);
        expect(countSyncQueueEntries(queue)).toEqual({
            workouts: 1,
            sessions: 1,
            upserts: 1,
            deletes: 1,
            total: 2,
        });
        expect(ackSyncQueueEntry(queue, 'latest')).toEqual([deletion]);
        expect(ackSyncQueueEntry(queue, 'missing')).toEqual(queue);
        expect(markSyncQueueEntryAttempt(queue, 'latest', NOW_ISO)[0]).toMatchObject({
            attemptCount: 1,
            lastAttemptAt: NOW_ISO,
            error: null,
        });
        expect(markSyncQueueEntryAttempt(queue, 'delete-session', NOW_ISO, 'offline')[1]).toMatchObject({
            attemptCount: 1,
            error: 'offline',
        });
        expect(markSyncQueueEntryAttempt(queue, 'missing', NOW_ISO)).toEqual(queue);
    });

    it('normalizes queue states and builds a detached recovery backup', () => {
        const upsert = createSyncQueueEntry({
            id: 'upsert',
            entity: 'workout',
            action: 'upsert',
            localId: 'local-workout-1',
            nowIso: NOW_ISO,
        });
        const duplicate = { ...upsert, id: 'newer' };
        const workout = { ...localWorkout(), sync: undefined };
        const session = { ...localSession(), sync: undefined };
        const originalNodes = session.nodes;

        expect(normalizeSyncQueueStatus('syncing', [])).toBe('syncing');
        expect(normalizeSyncQueueStatus('paused', [])).toBe('paused');
        expect(normalizeSyncQueueStatus('error', [])).toBe('error');
        expect(normalizeSyncQueueStatus('idle', [upsert])).toBe('queued');
        expect(normalizeSyncQueueStatus('queued', [])).toBe('idle');

        const backup = createSyncRecoveryBackup({
            reason: 'before-first-sync',
            syncEnabled: true,
            firstSyncOnboardingState: 'in-progress',
            queue: [upsert, duplicate],
            workouts: [workout],
            sessions: [session],
            nowIso: NOW_ISO,
        });

        expect(backup).toMatchObject({
            schemaVersion: 1,
            createdAt: NOW_ISO,
            queueStatus: 'queued',
            pendingCounts: { total: 1, workouts: 1, upserts: 1 },
        });
        expect(backup.queue).toHaveLength(1);
        expect(backup.workouts[0].sync).toMatchObject({ localId: workout.id, revision: 1 });
        expect(backup.sessions[0].sync).toMatchObject({ localId: session.id, revision: 1 });
        expect(backup.sessions[0].nodes).not.toBe(originalNodes);

        vi.useFakeTimers();
        vi.setSystemTime(new Date(NOW_ISO));
        expect(createSyncRecoveryBackup({
            reason: 'empty',
            syncEnabled: false,
            firstSyncOnboardingState: 'not-started',
            workouts: [],
            sessions: [],
        })).toMatchObject({ createdAt: NOW_ISO, queueStatus: 'idle', queue: [] });
    });

    it('builds write batches and recognizes only authentication-expiry errors', () => {
        expect(buildSyncWritePayload({
            workouts: [localWorkout()],
            sessions: [localSession()],
            userId: USER_ID,
        })).toMatchObject({
            workouts: [expect.objectContaining({ user_id: USER_ID })],
            sessions: [expect.objectContaining({ user_id: USER_ID })],
            deletedWorkoutIds: [],
            deletedSessionIds: [],
        });
        expect(buildSyncWritePayload({
            workouts: [],
            sessions: [],
            deletedWorkoutIds: ['workout-a'],
            deletedSessionIds: ['session-a'],
            userId: USER_ID,
        })).toMatchObject({
            deletedWorkoutIds: ['workout-a'],
            deletedSessionIds: ['session-a'],
        });

        expect(isSyncAuthExpiredError(new Error('JWT expired'))).toBe(true);
        expect(isSyncAuthExpiredError('Invalid session: refresh token rejected')).toBe(true);
        expect(isSyncAuthExpiredError('temporary network failure')).toBe(false);
        expect(isSyncAuthExpiredError({ message: 'jwt expired' })).toBe(false);
    });
});

describe('saved library wrapper migrations', () => {
    it('exports both libraries and remaps imported workout references after an id conflict', () => {
        const existingWorkout = { ...localWorkout(), id: 'shared-id', name: 'Existing' };
        const importedWorkout = { ...localWorkout(), id: 'shared-id', name: 'Imported' };
        const importedNode = createWorkoutSessionNode('Imported node', workoutConfig, NOW_ISO, 'shared-id');
        const importedSession = { ...localSession(), id: 'session-import', nodes: [importedNode] };

        const exported = buildSavedLibraryExport([importedWorkout], [importedSession], NOW_ISO);
        expect(exported).toMatchObject({
            schemaVersion: 1,
            exportedAt: NOW_ISO,
            workouts: [expect.objectContaining({ name: 'Imported' })],
            sessions: [expect.objectContaining({ name: 'Local session' })],
        });

        const merged = mergeSavedLibraryFromImport({ workouts: [existingWorkout], sessions: [] }, exported);
        expect(merged.summary).toMatchObject({
            workouts: { imported: 1, renamed: 0, skipped: 0 },
            sessions: { imported: 1, renamed: 0, skipped: 0 },
            errors: [],
        });
        const mappedWorkoutId = merged.workouts[1].id;
        expect(mappedWorkoutId).not.toBe('shared-id');
        expect(merged.sessions[0].nodes[0]).toMatchObject({
            type: 'workout',
            sourceWorkoutId: mappedWorkoutId,
        });
    });

    it('accepts persisted, nested, and legacy workout-only payload shapes', () => {
        const workout = localWorkout({ id: 'legacy-workout', name: 'Legacy workout' });
        const session = localSession({ id: 'legacy-session', name: 'Legacy session' });

        const persisted = mergeSavedLibraryFromImport({ workouts: [], sessions: [] }, {
            state: {
                savedWorkouts: [workout],
                savedSessions: [session],
            },
        });
        expect(persisted.summary.workouts.imported).toBe(1);
        expect(persisted.summary.sessions.imported).toBe(1);

        const nested = mergeSavedLibraryFromImport({ workouts: [], sessions: [] }, {
            data: { workouts: [workout], sessions: [session] },
        });
        expect(nested.summary.workouts.imported).toBe(1);
        expect(nested.summary.sessions.imported).toBe(1);

        const legacyArray = mergeSavedLibraryFromImport({ workouts: [], sessions: [] }, [workout]);
        expect(legacyArray.summary.workouts.imported).toBe(1);
        expect(legacyArray.summary.sessions.imported).toBe(0);

        const items = mergeSavedLibraryFromImport({ workouts: [], sessions: [] }, { items: [workout] });
        expect(items.summary.workouts.imported).toBe(1);
    });

    it('preserves existing data for unrelated input and combines entity-specific errors', () => {
        const existing = { workouts: [localWorkout()], sessions: [localSession()] };

        for (const payload of [null, 7, 'text', {}, { state: null }]) {
            const result = mergeSavedLibraryFromImport(existing, payload);
            expect(result.workouts).toEqual(existing.workouts);
            expect(result.sessions).toEqual(existing.sessions);
            expect(result.summary.errors).toEqual([]);
        }

        const malformed = mergeSavedLibraryFromImport(existing, {
            workouts: {},
            sessions: {},
        });
        expect(malformed.summary.errors).toEqual([
            'Missing workouts array.',
            'Missing sessions array.',
        ]);
    });
});

describe('Supabase environment branches', () => {
    it('reports partial configuration, trims values, and formats malformed hosts safely', () => {
        vi.stubEnv('VITE_ENABLE_SUPABASE', 'true');
        vi.stubEnv('VITE_SUPABASE_URL', '  ');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', ' anon-key ');
        vi.stubEnv('VITE_SUPABASE_REDIRECT_URL', '  ');

        expect(getSupabaseEnvironment()).toMatchObject({
            enabled: true,
            configured: false,
            url: '',
            anonKey: 'anon-key',
            redirectUrl: null,
            missing: ['VITE_SUPABASE_URL'],
        });
        expect(isSupabaseConfigured()).toBe(false);
        expect(getSupabaseRuntimeState()).toMatchObject({
            status: 'missing-config',
            detail: 'Missing: VITE_SUPABASE_URL',
        });

        vi.stubEnv('VITE_SUPABASE_URL', 'not a valid url');
        expect(getSupabaseRuntimeState()).toMatchObject({
            status: 'ready',
            detail: 'Configured for not a valid url',
        });
    });

    it('parses auth callback, code, recovery, and redirect fallbacks', () => {
        vi.stubEnv('VITE_ENABLE_SUPABASE', 'false');
        vi.stubEnv('VITE_SUPABASE_URL', '');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
        vi.stubEnv('VITE_SUPABASE_REDIRECT_URL', '');

        expect(isSupabaseNativeAuthCallbackUrl(`${SUPABASE_NATIVE_REDIRECT_URL}?code=abc`)).toBe(true);
        expect(isSupabaseNativeAuthCallbackUrl('com.generalmalit.myoreptimer://other/callback')).toBe(false);
        expect(isSupabaseNativeAuthCallbackUrl('not a url')).toBe(false);
        expect(getSupabaseAuthCodeFromUrl('https://app.example.com/callback?code=abc%20123')).toBe('abc 123');
        expect(getSupabaseAuthCodeFromUrl('broken')).toBeNull();
        expect(isSupabaseRecoveryUrl('https://app.example.com/callback?type=recovery')).toBe(true);
        expect(isSupabaseRecoveryUrl('https://app.example.com/callback?type=signup')).toBe(false);
        expect(isSupabaseRecoveryUrl('broken')).toBe(false);
        expect(getSupabaseAuthRedirectUrl({ native: true })).toBe(SUPABASE_NATIVE_REDIRECT_URL);
        expect(getSupabaseAuthRedirectUrl({ origin: 'https://origin.example.com' })).toBe('https://origin.example.com');
        expect(getSupabaseAuthRedirectUrl()).toBe(window.location.origin);

        const currentWindow = window;
        vi.stubGlobal('window', undefined);
        expect(getSupabaseAuthRedirectUrl()).toBe(SUPABASE_NATIVE_REDIRECT_URL);
        vi.stubGlobal('window', currentWindow);
    });

    it('reuses a matching client, replaces it for new credentials, and resets it', () => {
        const first = { id: 'first-client' };
        const second = { id: 'second-client' };
        const third = { id: 'third-client' };
        createClientMock
            .mockReturnValueOnce(first)
            .mockReturnValueOnce(second)
            .mockReturnValueOnce(third);
        vi.stubEnv('VITE_ENABLE_SUPABASE', 'true');
        vi.stubEnv('VITE_SUPABASE_URL', 'https://one.supabase.co');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'first-key');

        expect(getSupabaseClient()).toBe(first);
        expect(getSupabaseClient()).toBe(first);
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'second-key');
        expect(getSupabaseClient()).toBe(second);
        resetSupabaseClientForTests();
        expect(getSupabaseClient()).toBe(third);
        expect(createClientMock).toHaveBeenCalledTimes(3);
    });
});

describe('Supabase account error and fallback branches', () => {
    it('falls back to session-only state when table queries are unavailable', async () => {
        const session = accountSession();
        const result = await loadSupabaseAccountState({ auth: {} } as SupabaseClient, session);

        expect(result.session).toBe(session);
        expect(result.profile?.username).toBe('athlete_one');
    });

    it('uses persisted nullable rows when refresh JSON is unavailable or no token exists', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockRejectedValue(new Error('invalid json')),
        });
        vi.stubGlobal('fetch', fetchMock);
        const client = accountQueryClient(
            { data: null, error: null },
            { data: null, error: null },
        );

        await expect(loadSupabaseAccountState(client, accountSession())).resolves.toMatchObject({
            mode: 'signed-in-free',
        });

        fetchMock.mockClear();
        await expect(loadSupabaseAccountState(client, accountSession(''))).resolves.toMatchObject({
            mode: 'signed-in-free',
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('surfaces profile and persisted entitlement query failures', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({}),
        }));
        const profileError = new Error('profile read failed');
        const entitlementError = new Error('entitlement read failed');

        await expect(loadSupabaseAccountState(accountQueryClient(
            { data: null, error: profileError },
            { data: null, error: null },
        ), accountSession())).rejects.toBe(profileError);

        await expect(loadSupabaseAccountState(accountQueryClient(
            { data: null, error: null },
            { data: null, error: entitlementError },
        ), accountSession())).rejects.toBe(entitlementError);
    });

    it('validates and reports password sign-in and sign-up failures', async () => {
        const signInWithPassword = vi.fn().mockResolvedValue({ error: new Error('bad credentials') });
        expect(await signInSupabaseWithPassword({ auth: { signInWithPassword } } as never, '', 'password')).toEqual({
            ok: false,
            error: 'Email and password are required.',
        });
        expect(await signInSupabaseWithPassword({ auth: { signInWithPassword } } as never, 'a@example.com', '   ')).toEqual({
            ok: false,
            error: 'Email and password are required.',
        });
        expect(await signInSupabaseWithPassword({ auth: { signInWithPassword } } as never, 'a@example.com', 'password')).toEqual({
            ok: false,
            error: 'bad credentials',
        });

        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: false,
                json: vi.fn().mockResolvedValue({ error: 'Username is taken.' }),
            })
            .mockResolvedValueOnce({
                ok: false,
                json: vi.fn().mockRejectedValue(new Error('invalid json')),
            })
            .mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });
        vi.stubGlobal('fetch', fetchMock);

        const auth = {
            signUp: vi.fn()
                .mockResolvedValueOnce({ data: { session: null }, error: new Error('sign-up rejected') })
                .mockResolvedValueOnce({ data: { session: accountSession() }, error: null }),
            signOut: vi.fn().mockResolvedValue({ error: null }),
        };
        const client = { auth } as unknown as SupabaseClient;

        for (const input of [
            ['', 'a@example.com', 'password'],
            ['athlete', '', 'password'],
            ['athlete', 'a@example.com', '   '],
        ]) {
            await expect(signUpSupabaseWithPassword(client, input[0], input[1], input[2], 'https://redirect')).resolves.toMatchObject({
                ok: false,
                error: 'Username, email, and password are required.',
            });
        }
        await expect(signUpSupabaseWithPassword(client, 'athlete', 'a@example.com', 'password', 'https://redirect')).resolves.toEqual({
            ok: false,
            error: 'Username is taken.',
        });
        await expect(signUpSupabaseWithPassword(client, 'athlete', 'a@example.com', 'password', 'https://redirect')).resolves.toEqual({
            ok: false,
            error: 'Could not create your account.',
        });
        await expect(signUpSupabaseWithPassword(client, 'athlete', 'a@example.com', 'password', 'https://redirect')).resolves.toEqual({
            ok: false,
            error: 'sign-up rejected',
        });
        await expect(signUpSupabaseWithPassword(client, 'athlete', 'a@example.com', 'password', 'https://redirect')).resolves.toMatchObject({
            ok: false,
            error: expect.stringContaining('email confirmation'),
        });
        expect(auth.signOut).toHaveBeenCalledTimes(1);
    });

    it('handles resend, username, password reset, password update, and sign-out errors', async () => {
        const authError = new Error('auth failed');
        const auth = {
            resend: vi.fn().mockResolvedValue({ error: authError }),
            resetPasswordForEmail: vi.fn().mockResolvedValue({ error: authError }),
            updateUser: vi.fn().mockResolvedValue({ error: authError }),
            signOut: vi.fn()
                .mockResolvedValueOnce({ error: authError })
                .mockResolvedValueOnce({ error: null }),
        };
        const client = { auth } as unknown as SupabaseClient;

        expect(await resendSupabaseSignUpConfirmation(client, '', 'https://redirect')).toMatchObject({ ok: false });
        expect(await resendSupabaseSignUpConfirmation(client, 'a@example.com', 'https://redirect')).toEqual({ ok: false, error: 'auth failed' });
        expect(await sendSupabasePasswordReset(client, '', 'https://redirect')).toMatchObject({ ok: false });
        expect(await sendSupabasePasswordReset(client, 'a@example.com', 'https://redirect')).toEqual({ ok: false, error: 'auth failed' });
        expect(await updateSupabasePassword(client, '   ')).toMatchObject({ ok: false });
        expect(await updateSupabasePassword(client, 'new-password')).toEqual({ ok: false, error: 'auth failed' });
        expect(await signOutSupabase(client)).toEqual({ ok: false, error: 'auth failed' });
        expect(await signOutSupabase(client)).toEqual({ ok: true });

        vi.stubGlobal('fetch', undefined);
        expect(await updateSupabaseUsername(accountSession(), 'athlete')).toMatchObject({ ok: false });

        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: false,
                json: vi.fn().mockResolvedValue({ error: 'Username is reserved.' }),
            })
            .mockResolvedValueOnce({
                ok: false,
                json: vi.fn().mockRejectedValue(new Error('invalid json')),
            });
        vi.stubGlobal('fetch', fetchMock);
        expect(await updateSupabaseUsername(accountSession(''), 'athlete')).toMatchObject({ ok: false });
        expect(await updateSupabaseUsername(accountSession(), '!!!')).toMatchObject({ ok: false, error: 'Username is required.' });
        expect(await updateSupabaseUsername(accountSession(), 'Athlete One')).toEqual({ ok: false, error: 'Username is reserved.' });
        expect(await updateSupabaseUsername(accountSession(), 'Athlete Two')).toEqual({ ok: false, error: 'Could not update your username.' });
    });
});

describe('Supabase sync decoding and guard branches', () => {
    it('normalizes remote session nodes and created-at fallbacks', () => {
        const nodes = [
            null,
            7,
            { type: 'rest', seconds: '30' },
            { type: 'workout', sourceWorkoutId: ' ', notes: 42 },
            { type: 'workout', sourceWorkoutId: 'source-id', notes: 'keep me' },
        ];
        const session = fromRemoteSessionRow(sessionRow({ nodes, created_at: undefined }));
        const workout = fromRemoteWorkoutRow(workoutRow({ created_at: undefined }));

        expect(workout.createdAt).toBe(NOW_ISO);
        expect(session.createdAt).toBe(NOW_ISO);
        expect(session.nodes).toEqual([
            null,
            7,
            { type: 'rest', seconds: '30' },
            { type: 'workout', sourceWorkoutId: null, notes: '', completedSessionsSinceProgression: 0 },
            { type: 'workout', sourceWorkoutId: 'source-id', notes: 'keep me', completedSessionsSinceProgression: 0 },
        ]);
        expect(fromRemoteSessionRow(sessionRow({ nodes: null as never })).nodes).toEqual([]);
    });

    it('counts remote presence and surfaces either count query error', async () => {
        const countClient = (workoutsResult: unknown, sessionsResult: unknown) => ({
            from: vi.fn((table: string) => {
                const query: Record<string, ReturnType<typeof vi.fn>> = {};
                query.select = vi.fn(() => query);
                query.eq = vi.fn(() => query);
                query.is = vi.fn().mockResolvedValue(table === 'saved_workouts' ? workoutsResult : sessionsResult);
                return query;
            }),
        }) as unknown as SupabaseClient;

        await expect(inspectRemoteSyncPresence(countClient(
            { count: null, error: null },
            { count: 2, error: null },
        ), USER_ID)).resolves.toEqual({ hasData: true, workoutCount: 0, sessionCount: 2 });

        const workoutError = new Error('workout count failed');
        await expect(inspectRemoteSyncPresence(countClient(
            { count: 0, error: workoutError },
            { count: 0, error: null },
        ), USER_ID)).rejects.toBe(workoutError);

        const sessionError = new Error('session count failed');
        await expect(inspectRemoteSyncPresence(countClient(
            { count: 0, error: null },
            { count: 0, error: sessionError },
        ), USER_ID)).rejects.toBe(sessionError);
    });

    it('rejects paged query errors and oversized workout or session libraries', async () => {
        const snapshotClient = (workoutResult: unknown, sessionResult: unknown) => ({
            from: vi.fn((table: string) => {
                const query: Record<string, ReturnType<typeof vi.fn>> = {};
                query.select = vi.fn(() => query);
                query.eq = vi.fn(() => query);
                query.is = vi.fn(() => query);
                query.order = vi.fn(() => query);
                query.range = vi.fn().mockResolvedValue(table === 'saved_workouts' ? workoutResult : sessionResult);
                return query;
            }),
        }) as unknown as SupabaseClient;

        const queryError = new Error('snapshot failed');
        await expect(fetchRemoteLibrarySnapshot(snapshotClient(
            { data: null, error: queryError },
            { data: [], error: null },
        ), USER_ID)).rejects.toBe(queryError);

        await expect(fetchRemoteLibrarySnapshot(snapshotClient(
            { data: new Array(SYNC_MAX_LIBRARY_ROWS + 1).fill(workoutRow()), error: null },
            { data: [], error: null },
        ), USER_ID)).rejects.toThrow(/workout library exceeds/);

        await expect(fetchRemoteLibrarySnapshot(snapshotClient(
            { data: [], error: null },
            { data: new Array(SYNC_MAX_LIBRARY_ROWS + 1).fill(sessionRow()), error: null },
        ), USER_ID)).rejects.toThrow(/session library exceeds/);

        await expect(fetchRemoteLibrarySnapshot(snapshotClient(
            { data: null, error: null },
            { data: null, error: null },
        ), USER_ID)).resolves.toEqual({ workouts: [], sessions: [] });
    });

    it('rejects malformed mutation service responses', async () => {
        const invalidCases: Array<[unknown, RegExp]> = [
            [null, /Invalid mutation response/],
            [[], /Invalid mutation response/],
            [{ status: 'unknown' }, /Invalid mutation status/],
            [{
                status: 'conflict',
                reason: 'unknown',
                expected_revision: 2,
                remote_revision: 3,
                remote_deleted_at: null,
                remote_record: null,
            }, /Invalid mutation conflict/],
            [{
                status: 'applied',
                reason: null,
                expected_revision: 2,
                remote_revision: 3,
                remote_deleted_at: null,
                remote_record: [],
            }, /Invalid remote record/],
            [{
                status: 'deleted',
                reason: null,
                expected_revision: 2,
                remote_revision: 3,
                remote_deleted_at: 42,
                remote_record: null,
            }, /Invalid tombstone timestamp/],
            [{
                status: 'deleted',
                reason: null,
                expected_revision: -1,
                remote_revision: 3,
                remote_deleted_at: null,
                remote_record: null,
            }, /Invalid expected revision/],
            [{
                status: 'deleted',
                reason: null,
                expected_revision: 2,
                remote_revision: Number.MAX_SAFE_INTEGER + 1,
                remote_deleted_at: null,
                remote_record: null,
            }, /Invalid remote revision/],
        ];

        for (const [data, message] of invalidCases) {
            await expect(pushWorkoutMutation(rpcClient(data).client, USER_ID, localWorkout(), 2)).rejects.toThrow(message);
        }
    });

    it('decodes applied, deleted, and revision-mismatch results for both entities', async () => {
        const appliedWorkout = rpcClient({
            status: 'applied',
            reason: null,
            expected_revision: '2',
            remote_revision: '3',
            remote_deleted_at: null,
            remote_record: workoutRow({ revision: 3 }),
        });
        await expect(pushWorkoutMutation(appliedWorkout.client, USER_ID, localWorkout())).resolves.toMatchObject({
            status: 'applied',
            remoteRevision: 3,
            record: { id: 'local-workout-1' },
        });
        expect(appliedWorkout.rpc).toHaveBeenCalledWith('mutate_saved_workout', expect.objectContaining({
            p_expected_revision: 2,
        }));

        await expect(pushWorkoutMutation(rpcClient({
            status: 'deleted',
            reason: null,
            expected_revision: 2,
            remote_revision: 4,
            remote_deleted_at: NOW_ISO,
            remote_record: null,
        }).client, USER_ID, localWorkout(), 2)).resolves.toEqual({
            status: 'deleted',
            record: null,
            remoteRevision: 4,
        });

        await expect(pushSessionMutation(rpcClient({
            status: 'applied',
            reason: null,
            expected_revision: 3,
            remote_revision: 4,
            remote_deleted_at: null,
            remote_record: sessionRow({ revision: 4 }),
        }).client, USER_ID, localSession())).resolves.toMatchObject({
            status: 'applied',
            record: { id: 'local-session-1' },
        });

        await expect(pushSessionMutation(rpcClient({
            status: 'deleted',
            reason: null,
            expected_revision: 3,
            remote_revision: 5,
            remote_deleted_at: NOW_ISO,
            remote_record: null,
        }).client, USER_ID, localSession(), 3)).resolves.toMatchObject({ status: 'deleted' });

        await expect(pushSessionMutation(rpcClient({
            status: 'conflict',
            reason: 'revision_mismatch',
            expected_revision: 3,
            remote_revision: 5,
            remote_deleted_at: null,
            remote_record: sessionRow({ revision: 5 }),
        }).client, USER_ID, localSession(), 3)).resolves.toMatchObject({
            status: 'conflict',
            reason: 'revision_mismatch',
            remoteRecord: { id: 'local-session-1' },
        });
    });

    it('rejects applied responses without active records and validates expected revisions', async () => {
        const applied = (remoteRecord: unknown) => ({
            status: 'applied',
            reason: null,
            expected_revision: 2,
            remote_revision: 3,
            remote_deleted_at: null,
            remote_record: remoteRecord,
        });

        await expect(pushWorkoutMutation(rpcClient(applied(null)).client, USER_ID, localWorkout(), 2)).rejects.toThrow(/active record/);
        await expect(pushWorkoutMutation(rpcClient(applied(workoutRow({ deleted_at: NOW_ISO }))).client, USER_ID, localWorkout(), 2)).rejects.toThrow(/active record/);
        await expect(pushSessionMutation(rpcClient(applied(null)).client, USER_ID, localSession(), 3)).rejects.toThrow(/active record/);
        await expect(pushSessionMutation(rpcClient(applied(sessionRow({ deleted_at: NOW_ISO }))).client, USER_ID, localSession(), 3)).rejects.toThrow(/active record/);

        const neverCalled = rpcClient(null);
        await expect(pushWorkoutMutation(neverCalled.client, USER_ID, localWorkout(), -1)).rejects.toThrow(/non-negative safe integer/);
        await expect(pushSessionMutation(neverCalled.client, USER_ID, localSession(), Number.NaN)).rejects.toThrow(/non-negative safe integer/);
        expect(neverCalled.rpc).not.toHaveBeenCalled();
    });

    it('short-circuits unsynced tombstones and propagates mutation RPC failures', async () => {
        const localOnlyWorkout = localWorkout({
            sync: { ...localWorkout().sync!, remoteId: null, pendingDelete: true },
        });
        const localOnlySession = localSession({
            sync: { ...localSession().sync!, remoteId: null, pendingDelete: true },
        });
        const client = rpcClient(null).client;

        await expect(pushWorkoutMutation(client, USER_ID, localOnlyWorkout)).resolves.toEqual({
            status: 'deleted', record: null, remoteRevision: 0,
        });
        await expect(pushSessionMutation(client, USER_ID, localOnlySession)).resolves.toEqual({
            status: 'deleted', record: null, remoteRevision: 0,
        });

        const rpcError = new Error('rpc failed');
        await expect(pushWorkoutMutation(rpcClient(null, rpcError).client, USER_ID, localWorkout())).rejects.toBe(rpcError);
        await expect(pushSessionMutation(rpcClient(null, rpcError).client, USER_ID, localSession())).rejects.toBe(rpcError);
    });

    it('guards atomic overwrites and filters pending or returned tombstones', async () => {
        const pendingWorkout = localWorkout({
            id: 'pending-workout',
            sync: { ...localWorkout().sync!, localId: 'pending-workout', pendingDelete: true },
        });
        const pendingSession = localSession({
            id: 'pending-session',
            sync: { ...localSession().sync!, localId: 'pending-session', pendingDelete: true },
        });
        const client = rpcClient({
            workouts: [workoutRow(), workoutRow({ id: 'deleted', local_id: 'deleted', deleted_at: NOW_ISO })],
            sessions: [sessionRow(), sessionRow({ id: 'deleted', local_id: 'deleted', deleted_at: NOW_ISO })],
        });

        const result = await overwriteRemoteLibraryWithLocal(
            client.client,
            USER_ID,
            [localWorkout(), pendingWorkout],
            [localSession(), pendingSession],
        );
        expect(client.rpc).toHaveBeenCalledWith('overwrite_sync_library', {
            p_workouts: [expect.objectContaining({ local_id: 'local-workout-1' })],
            p_sessions: [expect.objectContaining({ local_id: 'local-session-1' })],
        });
        expect(result.workouts).toHaveLength(1);
        expect(result.sessions).toHaveLength(1);

        await expect(overwriteRemoteLibraryWithLocal(
            rpcClient(null).client,
            USER_ID,
            new Array(SYNC_MAX_LIBRARY_ROWS + 1).fill(localWorkout()),
            [],
        )).rejects.toThrow(/Local library exceeds/);
        await expect(overwriteRemoteLibraryWithLocal(
            rpcClient(null).client,
            USER_ID,
            [],
            new Array(SYNC_MAX_LIBRARY_ROWS + 1).fill(localSession()),
        )).rejects.toThrow(/Local library exceeds/);

        const rpcError = new Error('overwrite failed');
        await expect(overwriteRemoteLibraryWithLocal(rpcClient(null, rpcError).client, USER_ID, [], [])).rejects.toBe(rpcError);
        await expect(overwriteRemoteLibraryWithLocal(rpcClient(null).client, USER_ID, [], [])).rejects.toThrow(/Invalid library response/);
        await expect(overwriteRemoteLibraryWithLocal(rpcClient({ workouts: [] }).client, USER_ID, [], [])).rejects.toThrow(/Invalid library response/);
    });
});

describe('billing browser and failure branches', () => {
    it('reports missing configuration, auth lookup errors, and missing tokens', async () => {
        vi.stubEnv('VITE_ENABLE_SUPABASE', 'false');
        vi.stubEnv('VITE_SUPABASE_URL', '');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
        await expect(startBillingCheckout()).resolves.toEqual({
            ok: false,
            message: 'Supabase is not configured for this build.',
        });

        setConfiguredSupabaseClient({
            auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: new Error('session failed') }) },
        });
        await expect(startBillingCheckout()).resolves.toEqual({ ok: false, message: 'session failed' });

        setConfiguredSupabaseClient({
            auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) },
        });
        await expect(openBillingPortal()).resolves.toEqual({
            ok: false,
            message: 'Sign in first to manage Plus billing.',
        });
    });

    it('uses server errors, generic fallbacks, and missing-url validation', async () => {
        setConfiguredSupabaseClient({
            auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } }, error: null }) },
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Checkout unavailable.' }), { status: 409 }))
            .mockResolvedValueOnce(new Response('not-json', { status: 503 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(startBillingCheckout()).resolves.toEqual({ ok: false, message: 'Checkout unavailable.' });
        await expect(openBillingPortal()).resolves.toEqual({ ok: false, message: 'Billing request failed with status 503.' });
        await expect(startBillingCheckout()).resolves.toEqual({ ok: false, message: 'Billing service did not return a redirect URL.' });
    });

    it('redirects checkout and handles every entitlement refresh early return', async () => {
        const originalLocation = window.location;
        const assign = vi.fn();
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...originalLocation, assign },
        });

        try {
            setConfiguredSupabaseClient({
                auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } }, error: null }) },
            });
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
                url: 'https://checkout.example.com/session',
            }), { status: 200 })));
            await expect(startBillingCheckout()).resolves.toEqual({ ok: true, message: 'Redirecting to secure checkout.' });
            expect(assign).toHaveBeenCalledWith('https://checkout.example.com/session');

            vi.stubEnv('VITE_ENABLE_SUPABASE', 'false');
            resetSupabaseClientForTests();
            await expect(refreshBillingEntitlementState()).resolves.toBeNull();

            setConfiguredSupabaseClient({
                auth: { getSession: vi.fn().mockResolvedValue({ data: { session: accountSession() }, error: new Error('expired') }) },
            });
            await expect(refreshBillingEntitlementState()).resolves.toBeNull();

            setConfiguredSupabaseClient({
                auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) },
            });
            await expect(refreshBillingEntitlementState()).resolves.toBeNull();
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });
});
