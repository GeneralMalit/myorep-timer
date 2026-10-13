import { afterEach, expect, it, vi } from 'vitest';

// Keep storage across module reloads to exercise a fresh page's store initialization.
afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
});

it('restores enabled sync, pending changes, and completed hydration on a fresh load', async () => {
    const storage = new Map<string, string>();
    vi.spyOn(window.localStorage, 'getItem').mockImplementation((name) => storage.get(name) ?? null);
    vi.spyOn(window.localStorage, 'setItem').mockImplementation((name, value) => { storage.set(name, value); });
    vi.resetModules();
    const { useSyncStore: firstLoad } = await import('@/store/useSyncStore');
    firstLoad.getState().setCurrentUser('returning-account');
    firstLoad.getState().completeEnableSync('returning-account', '2026-10-05T00:00:00.000Z');
    firstLoad.getState().enqueueEntityChange({
        entityType: 'session',
        entityId: 'saved-session',
        localId: 'saved-session',
        operation: 'upsert',
        revision: 2,
    });
    await Promise.resolve();
    const pendingOperations = firstLoad.getState().queuedOperations;
    const generation = firstLoad.getState().authGeneration;

    vi.resetModules();
    const { useSyncStore: refreshed } = await import('@/store/useSyncStore');
    expect(refreshed.persist.hasHydrated()).toBe(true);
    expect(refreshed.getState()).toMatchObject({
        hydrateComplete: true,
        syncEnabled: true,
        firstSyncState: 'idle',
        currentUserId: 'returning-account',
        authGeneration: generation,
        lastSyncedAt: '2026-10-05T00:00:00.000Z',
        queuedOperations: pendingOperations,
        queueStatus: 'pending',
        pendingCounts: { total: 1, sessions: 1 },
    });
    refreshed.getState().setCurrentUser('returning-account');
    expect(refreshed.getState().syncEnabled).toBe(true);
    expect(refreshed.getState().queuedOperations).toEqual(pendingOperations);
});

it('recovers an interrupted first sync on hydration without dropping its recovery backup', async () => {
    const storage = new Map<string, string>();
    vi.spyOn(window.localStorage, 'getItem').mockImplementation((name) => storage.get(name) ?? null);
    vi.spyOn(window.localStorage, 'setItem').mockImplementation((name, value) => { storage.set(name, value); });
    vi.resetModules();
    const { useSyncStore: firstLoad } = await import('@/store/useSyncStore');
    const createdAt = new Date().toISOString();
    const backup = {
        createdAt,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        workouts: [{ id: 'local-workout' }],
        sessions: [],
    };
    firstLoad.getState().setCurrentUser('interrupted-account');
    firstLoad.getState().beginEnableSync(backup, true);
    firstLoad.getState().markFirstSyncProcessing('upload-local');
    await Promise.resolve();

    const persisted = JSON.parse(storage.get('myorep-sync-storage') ?? '{}');
    expect(persisted.state).toMatchObject({
        firstSyncState: 'processing',
        recoveryBackup: backup,
        pendingChoice: 'upload-local',
    });

    vi.resetModules();
    // Re-import after clearing the module cache to exercise a fresh store instance.
    const { useSyncStore: refreshed } = await import('@/store/useSyncStore');
    expect(refreshed.persist.hasHydrated()).toBe(true);
    expect(refreshed.getState()).toMatchObject({
        hydrateComplete: true,
        syncEnabled: false,
        firstSyncState: 'pending-choice',
        currentUserId: 'interrupted-account',
        recoveryBackup: backup,
        pendingChoice: 'upload-local',
        onboardingRemoteHasData: true,
    });
});

it('pauses an owned enabled queue on sign-out and resumes it for the same account after reload', async () => {
    const storage = new Map<string, string>();
    vi.spyOn(window.localStorage, 'getItem').mockImplementation((name) => storage.get(name) ?? null);
    vi.spyOn(window.localStorage, 'setItem').mockImplementation((name, value) => { storage.set(name, value); });
    vi.resetModules();
    const { useSyncStore: firstLoad } = await import('@/store/useSyncStore');
    firstLoad.getState().setCurrentUser('paused-account');
    firstLoad.getState().completeEnableSync('paused-account', '2026-10-06T00:00:00.000Z');
    firstLoad.getState().enqueueEntityChange({
        entityType: 'workout',
        entityId: 'paused-workout',
        localId: 'paused-workout',
        operation: 'upsert',
        revision: 3,
        expectedRemoteRevision: 2,
    });
    const liveGeneration = firstLoad.getState().authGeneration;

    firstLoad.getState().setCurrentUser(null);

    const paused = firstLoad.getState();
    expect(paused).toMatchObject({
        syncEnabled: true,
        firstSyncState: 'idle',
        currentUserId: 'paused-account',
        authExpired: true,
        queueStatus: 'paused-auth',
        lastSyncedAt: '2026-10-06T00:00:00.000Z',
    });
    expect(paused.authGeneration).not.toBe(liveGeneration);
    expect(paused.queuedOperations).toHaveLength(1);
    expect(paused.queuedOperations[0]).toMatchObject({
        entityId: 'paused-workout',
        ownerUserId: 'paused-account',
        authGeneration: paused.authGeneration,
    });
    const pausedOperations = paused.queuedOperations;

    await Promise.resolve();
    vi.resetModules();
    const { useSyncStore: refreshed } = await import('@/store/useSyncStore');
    expect(refreshed.persist.hasHydrated()).toBe(true);
    expect(refreshed.getState()).toMatchObject({
        hydrateComplete: true,
        syncEnabled: true,
        firstSyncState: 'idle',
        currentUserId: 'paused-account',
        lastSyncedAt: '2026-10-06T00:00:00.000Z',
        queueStatus: 'pending',
        pendingCounts: { total: 1, workouts: 1 },
    });
    expect(refreshed.getState().queuedOperations).toEqual(pausedOperations);

    refreshed.getState().setCurrentUser('paused-account');
    expect(refreshed.getState()).toMatchObject({
        syncEnabled: true,
        currentUserId: 'paused-account',
        authExpired: false,
        queueStatus: 'pending',
        pendingCounts: { total: 1, workouts: 1 },
    });
    expect(refreshed.getState().queuedOperations).toEqual(pausedOperations);
});

it('keeps an explicit opt-out disabled through sign-out, reload, and the same account logging in', async () => {
    const storage = new Map<string, string>();
    vi.spyOn(window.localStorage, 'getItem').mockImplementation((name) => storage.get(name) ?? null);
    vi.spyOn(window.localStorage, 'setItem').mockImplementation((name, value) => { storage.set(name, value); });
    vi.resetModules();
    const { useSyncStore: firstLoad } = await import('@/store/useSyncStore');
    firstLoad.getState().setCurrentUser('opted-out-account');
    firstLoad.getState().completeEnableSync('opted-out-account', '2026-10-07T00:00:00.000Z');
    firstLoad.getState().enqueueEntityChange({
        entityType: 'workout',
        entityId: 'opted-out-workout',
        localId: 'opted-out-workout',
        operation: 'upsert',
        revision: 1,
    });
    firstLoad.getState().disableSync();
    expect(firstLoad.getState()).toMatchObject({
        syncEnabled: false,
        queuedOperations: [],
        pendingCounts: { total: 0 },
    });

    firstLoad.getState().setCurrentUser(null);
    expect(firstLoad.getState()).toMatchObject({ syncEnabled: false, queuedOperations: [] });

    await Promise.resolve();
    vi.resetModules();
    const { useSyncStore: refreshed } = await import('@/store/useSyncStore');
    expect(refreshed.persist.hasHydrated()).toBe(true);
    expect(refreshed.getState()).toMatchObject({
        hydrateComplete: true,
        syncEnabled: false,
        firstSyncState: 'idle',
        queuedOperations: [],
        queueStatus: 'idle',
        pendingCounts: { total: 0, workouts: 0, sessions: 0, deletes: 0 },
    });

    refreshed.getState().setCurrentUser('opted-out-account');
    expect(refreshed.getState()).toMatchObject({
        syncEnabled: false,
        authExpired: false,
        queuedOperations: [],
        queueStatus: 'idle',
        pendingCounts: { total: 0 },
    });
});

it('recovers an unfinished first sync that survived a sign-out and module reload', async () => {
    const storage = new Map<string, string>();
    vi.spyOn(window.localStorage, 'getItem').mockImplementation((name) => storage.get(name) ?? null);
    vi.spyOn(window.localStorage, 'setItem').mockImplementation((name, value) => { storage.set(name, value); });
    vi.resetModules();
    const { useSyncStore: firstLoad } = await import('@/store/useSyncStore');
    const backup = {
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        workouts: [{ id: 'unfinished-workout' }],
        sessions: [],
    };
    firstLoad.getState().setCurrentUser('half-onboarded-account');
    firstLoad.getState().beginEnableSync(backup, true);
    firstLoad.getState().markFirstSyncProcessing('upload-local');

    firstLoad.getState().setCurrentUser(null);
    expect(firstLoad.getState()).toMatchObject({
        syncEnabled: false,
        firstSyncState: 'pending-choice',
        currentUserId: 'half-onboarded-account',
        pendingChoice: 'upload-local',
        onboardingRemoteHasData: true,
        recoveryBackup: backup,
    });

    await Promise.resolve();
    vi.resetModules();
    const { useSyncStore: refreshed } = await import('@/store/useSyncStore');
    expect(refreshed.persist.hasHydrated()).toBe(true);
    expect(refreshed.getState()).toMatchObject({
        hydrateComplete: true,
        syncEnabled: false,
        firstSyncState: 'pending-choice',
        currentUserId: 'half-onboarded-account',
        pendingChoice: 'upload-local',
        onboardingRemoteHasData: true,
        recoveryBackup: backup,
    });
});
