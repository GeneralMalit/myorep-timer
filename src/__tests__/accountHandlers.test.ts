import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleEntitlementRefreshRequest } from '@/server/accountHandlers';

const getSupabaseServerEnvironmentMock = vi.hoisted(() => vi.fn());
const createSupabaseAuthClientMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const authenticateSupabaseUserMock = vi.hoisted(() => vi.fn());
const syncResolvedEntitlementMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/billingEnv', () => ({
    getSupabaseServerEnvironment: getSupabaseServerEnvironmentMock,
}));

vi.mock('@/server/billingData', () => ({
    createSupabaseAuthClient: createSupabaseAuthClientMock,
    createSupabaseAdminClient: createSupabaseAdminClientMock,
    authenticateSupabaseUser: authenticateSupabaseUserMock,
}));

vi.mock('@/server/entitlements', () => ({
    syncResolvedEntitlement: syncResolvedEntitlementMock,
}));

describe('accountHandlers', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        getSupabaseServerEnvironmentMock.mockReturnValue({
            supabaseUrl: 'https://supabase.example.co',
            supabaseAnonKey: 'anon-key',
            supabaseServiceRoleKey: 'service-role-key',
        });
        createSupabaseAuthClientMock.mockReturnValue({ kind: 'auth-client' });
        createSupabaseAdminClientMock.mockReturnValue({ kind: 'admin-client' });
        authenticateSupabaseUserMock.mockResolvedValue({
            id: 'user-1',
            email: 'athlete@example.com',
        });
        syncResolvedEntitlementMock.mockResolvedValue({
            user_id: 'user-1',
            plan: 'plus',
            cloud_sync_enabled: true,
            updated_at: '2026-04-16T00:00:00.000Z',
        });
    });

    it('requires an authenticated session', async () => {
        const response = await handleEntitlementRefreshRequest(new Request('https://example.test/api/account/refresh-entitlement', {
            method: 'POST',
        }));

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({
            error: 'Sign in first to refresh your account state.',
        });
    });

    it('recomputes the caller entitlement through the trusted resolver', async () => {
        const response = await handleEntitlementRefreshRequest(new Request('https://example.test/api/account/refresh-entitlement', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer access-token',
            },
        }));

        expect(response.status).toBe(200);
        expect(authenticateSupabaseUserMock).toHaveBeenCalledWith({ kind: 'auth-client' }, 'access-token');
        expect(syncResolvedEntitlementMock).toHaveBeenCalledWith({ kind: 'admin-client' }, {
            userId: 'user-1',
        });
        await expect(response.json()).resolves.toMatchObject({
            entitlement: {
                user_id: 'user-1',
                plan: 'plus',
                cloud_sync_enabled: true,
            },
        });
    });
});
