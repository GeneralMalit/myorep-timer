import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
    handleEntitlementRefreshRequest,
    handlePasswordSignUpRequest,
    handleProfileUpdateRequest,
} from '@/server/accountHandlers';

const getSupabaseServerEnvironmentMock = vi.hoisted(() => vi.fn());
const createSupabaseAuthClientMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const authenticateSupabaseUserMock = vi.hoisted(() => vi.fn());
const getSupabasePasswordSignUpAvailabilityMock = vi.hoisted(() => vi.fn());
const refreshResolvedEntitlementMock = vi.hoisted(() => vi.fn());
const updateSupabaseUsernameMock = vi.hoisted(() => vi.fn());
const AccountProvisionErrorMock = vi.hoisted(() => class AccountProvisionError extends Error {
    code: string;

    constructor(code: string, message: string) {
        super(message);
        this.code = code;
    }
});

vi.mock('@/server/billingEnv', () => ({
    getSupabaseServerEnvironment: getSupabaseServerEnvironmentMock,
}));

vi.mock('@/server/billingData', () => ({
    AccountProvisionError: AccountProvisionErrorMock,
    createSupabaseAuthClient: createSupabaseAuthClientMock,
    createSupabaseAdminClient: createSupabaseAdminClientMock,
    authenticateSupabaseUser: authenticateSupabaseUserMock,
    getSupabasePasswordSignUpAvailability: getSupabasePasswordSignUpAvailabilityMock,
    refreshResolvedEntitlement: refreshResolvedEntitlementMock,
    updateSupabaseUsername: updateSupabaseUsernameMock,
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
        getSupabasePasswordSignUpAvailabilityMock.mockResolvedValue('available');
        updateSupabaseUsernameMock.mockResolvedValue({
            id: 'user-1',
            email: 'athlete@example.com',
            username: 'athlete_one',
            display_name: 'athlete_one',
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-16T00:00:00.000Z',
        });
        refreshResolvedEntitlementMock.mockResolvedValue({
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
        expect(refreshResolvedEntitlementMock).toHaveBeenCalledWith({ kind: 'admin-client' }, 'user-1');
        await expect(response.json()).resolves.toMatchObject({
            entitlement: {
                user_id: 'user-1',
                plan: 'plus',
                cloud_sync_enabled: true,
            },
        });
    });

    it('refreshes entitlement through the conditional database RPC', async () => {
        const { refreshResolvedEntitlement } = await vi.importActual<
            typeof import('@/server/billingData')
        >('@/server/billingData');
        const entitlement = {
            user_id: 'user-1',
            plan: 'plus',
            cloud_sync_enabled: true,
            updated_at: '2026-04-16T00:00:00.000Z',
        };
        const rpc = vi.fn().mockResolvedValue({ data: entitlement, error: null });

        const result = await refreshResolvedEntitlement(
            { rpc } as unknown as SupabaseClient,
            'user-1',
        );

        expect(result).toEqual(entitlement);
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith('refresh_resolved_entitlement', {
            p_user_id: 'user-1',
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
        expect(getSupabasePasswordSignUpAvailabilityMock).toHaveBeenCalledWith(
            { kind: 'admin-client' },
            {
                username: 'new_user',
                email: 'new@example.com',
            },
        );
        await expect(response.json()).resolves.toMatchObject({ ok: true });
    });

    it('does not disclose whether the submitted email already has an account', async () => {
        getSupabasePasswordSignUpAvailabilityMock
            .mockResolvedValueOnce('available')
            .mockResolvedValueOnce('email_taken');

        const createRequest = (email: string) => new Request('https://example.test/api/account/password-signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-forwarded-for': '203.0.113.20',
            },
            body: JSON.stringify({
                username: 'new_user',
                email,
            }),
        });

        const availableResponse = await handlePasswordSignUpRequest(createRequest('new@example.com'));
        const existingResponse = await handlePasswordSignUpRequest(createRequest('existing@example.com'));

        expect(availableResponse.status).toBe(200);
        expect(existingResponse.status).toBe(200);
        await expect(availableResponse.json()).resolves.toEqual({ ok: true });
        await expect(existingResponse.json()).resolves.toEqual({ ok: true });
        expect(availableResponse.headers.get('Cache-Control')).toBe('no-store');
        expect(existingResponse.headers.get('Cache-Control')).toBe('no-store');
    });

    it('still reports a conflicting public username', async () => {
        getSupabasePasswordSignUpAvailabilityMock.mockResolvedValueOnce('username_taken');

        const response = await handlePasswordSignUpRequest(new Request('https://example.test/api/account/password-signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-forwarded-for': '203.0.113.21',
            },
            body: JSON.stringify({
                username: 'existing_user',
                email: 'new@example.com',
            }),
        }));

        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toEqual({
            error: 'That username is already taken.',
            code: 'username_taken',
        });
    });

    it('bounds repeated public signup preflight requests per process', async () => {
        const createRequest = () => new Request('https://example.test/api/account/password-signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-forwarded-for': '203.0.113.22',
            },
            body: JSON.stringify({
                username: 'rate_limited_user',
                email: 'rate-limited@example.com',
            }),
        });

        const responses: Response[] = [];
        for (let attempt = 0; attempt < 11; attempt += 1) {
            responses.push(await handlePasswordSignUpRequest(createRequest()));
        }

        expect(responses.slice(0, 10).every((response) => response.status === 200)).toBe(true);
        const rateLimitedResponse = responses[10]!;
        expect(rateLimitedResponse.status).toBe(429);
        expect(rateLimitedResponse.headers.get('Retry-After')).toMatch(/^\d+$/);
        await expect(rateLimitedResponse.json()).resolves.toEqual({
            error: 'Too many sign-up attempts. Please try again later.',
        });
        expect(getSupabasePasswordSignUpAvailabilityMock).toHaveBeenCalledTimes(10);
    });

    it('checks signup availability with one indexed RPC instead of listing auth users', async () => {
        const { getSupabasePasswordSignUpAvailability } = await vi.importActual<
            typeof import('@/server/billingData')
        >('@/server/billingData');
        const rpc = vi.fn().mockResolvedValue({ data: 'email_taken', error: null });
        const listUsers = vi.fn();
        const adminClient = {
            rpc,
            auth: {
                admin: {
                    listUsers,
                },
            },
        } as unknown as SupabaseClient;

        const result = await getSupabasePasswordSignUpAvailability(adminClient, {
            username: 'new_user',
            email: ' EXISTING@EXAMPLE.COM ',
        });

        expect(result).toBe('email_taken');
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith('get_password_signup_availability', {
            p_email: 'existing@example.com',
            p_username: 'new_user',
        });
        expect(listUsers).not.toHaveBeenCalled();
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
        expect(getSupabasePasswordSignUpAvailabilityMock).not.toHaveBeenCalled();
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
