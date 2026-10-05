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
