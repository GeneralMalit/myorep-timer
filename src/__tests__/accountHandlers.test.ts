import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    handleEntitlementRefreshRequest,
    handlePasswordSignUpRequest,
    handleProfileUpdateRequest,
} from '@/server/accountHandlers';

const getSupabaseServerEnvironmentMock = vi.hoisted(() => vi.fn());
const createSupabaseAuthClientMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const authenticateSupabaseUserMock = vi.hoisted(() => vi.fn());
const assertSupabasePasswordSignUpAvailableMock = vi.hoisted(() => vi.fn());
const updateSupabaseUsernameMock = vi.hoisted(() => vi.fn());
const syncResolvedEntitlementMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/billingEnv', () => ({
    getSupabaseServerEnvironment: getSupabaseServerEnvironmentMock,
}));

vi.mock('@/server/billingData', () => ({
    createSupabaseAuthClient: createSupabaseAuthClientMock,
    createSupabaseAdminClient: createSupabaseAdminClientMock,
    authenticateSupabaseUser: authenticateSupabaseUserMock,
    assertSupabasePasswordSignUpAvailable: assertSupabasePasswordSignUpAvailableMock,
    updateSupabaseUsername: updateSupabaseUsernameMock,
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
        assertSupabasePasswordSignUpAvailableMock.mockResolvedValue(undefined);
        updateSupabaseUsernameMock.mockResolvedValue({
            id: 'user-1',
            email: 'athlete@example.com',
            username: 'athlete_one',
            display_name: 'athlete_one',
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-16T00:00:00.000Z',
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

    it('validates password sign-up availability before the client requests the confirmation email flow', async () => {
        const response = await handlePasswordSignUpRequest(new Request('https://example.test/api/account/password-signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: 'new_user',
                email: 'new@example.com',
                password: 'very-secure-pass',
            }),
        }));

        expect(response.status).toBe(200);
        expect(assertSupabasePasswordSignUpAvailableMock).toHaveBeenCalledWith(
            { kind: 'admin-client' },
            {
                username: 'new_user',
                email: 'new@example.com',
            },
        );
        await expect(response.json()).resolves.toMatchObject({ ok: true });
    });

    it('rejects invalid password-signup payloads before hitting Supabase admin', async () => {
        const response = await handlePasswordSignUpRequest(new Request('https://example.test/api/account/password-signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: 'bad user',
                email: 'bad-email',
                password: 'short',
            }),
        }));

        expect(response.status).toBe(400);
        expect(assertSupabasePasswordSignUpAvailableMock).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toMatchObject({
            error: 'Enter a valid email address.',
        });
    });

    it('updates the signed-in user username through the trusted server path', async () => {
        const response = await handleProfileUpdateRequest(new Request('https://example.test/api/account/update-profile', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer access-token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: 'athlete_one',
            }),
        }));

        expect(response.status).toBe(200);
        expect(authenticateSupabaseUserMock).toHaveBeenCalledWith({ kind: 'auth-client' }, 'access-token');
        expect(updateSupabaseUsernameMock).toHaveBeenCalledWith({ kind: 'admin-client' }, {
            userId: 'user-1',
            username: 'athlete_one',
        });
        await expect(response.json()).resolves.toMatchObject({
            profile: {
                username: 'athlete_one',
            },
        });
    });

    it('rejects username updates without auth', async () => {
        const response = await handleProfileUpdateRequest(new Request('https://example.test/api/account/update-profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: 'athlete_one',
            }),
        }));

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({
            error: 'Sign in first to update your account.',
        });
    });

    it('rejects invalid usernames during profile update', async () => {
        const response = await handleProfileUpdateRequest(new Request('https://example.test/api/account/update-profile', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer access-token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: 'ab',
            }),
        }));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            error: 'Use 3-24 lowercase letters, numbers, or underscores for your username.',
        });
    });
});
