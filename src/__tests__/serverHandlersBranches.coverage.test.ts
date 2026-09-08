import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBillingEnvironmentMock = vi.hoisted(() => vi.fn());
const getSupabaseServerEnvironmentMock = vi.hoisted(() => vi.fn());
const createSupabaseAuthClientMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const authenticateSupabaseUserMock = vi.hoisted(() => vi.fn());
const applyPaddleSubscriptionEventMock = vi.hoisted(() => vi.fn());
const getBillingAccountByUserIdMock = vi.hoisted(() => vi.fn());
const getBillingAccountByPaddleCustomerIdMock = vi.hoisted(() => vi.fn());
const getSupabasePasswordSignUpAvailabilityMock = vi.hoisted(() => vi.fn());
const refreshResolvedEntitlementMock = vi.hoisted(() => vi.fn());
const updateSupabaseUsernameMock = vi.hoisted(() => vi.fn());
const upsertBillingAccountMock = vi.hoisted(() => vi.fn());
const createPaddleCustomerMock = vi.hoisted(() => vi.fn());
const createPaddleCheckoutTransactionMock = vi.hoisted(() => vi.fn());
const createPaddleCustomerPortalSessionMock = vi.hoisted(() => vi.fn());
const buildPaddleHostedCheckoutUrlMock = vi.hoisted(() => vi.fn());
const verifyAndParsePaddleWebhookEventMock = vi.hoisted(() => vi.fn());
const buildEntitlementProjectionFromPaddleSubscriptionMock = vi.hoisted(() => vi.fn());
const AccountProvisionErrorMock = vi.hoisted(() => class AccountProvisionError extends Error {
    code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = 'AccountProvisionError';
        this.code = code;
    }
});

vi.mock('@/server/billingEnv', () => ({
    getBillingEnvironment: getBillingEnvironmentMock,
    getSupabaseServerEnvironment: getSupabaseServerEnvironmentMock,
}));

vi.mock('@/server/billingData', () => ({
    AccountProvisionError: AccountProvisionErrorMock,
    createSupabaseAuthClient: createSupabaseAuthClientMock,
    createSupabaseAdminClient: createSupabaseAdminClientMock,
    authenticateSupabaseUser: authenticateSupabaseUserMock,
    applyPaddleSubscriptionEvent: applyPaddleSubscriptionEventMock,
    getBillingAccountByUserId: getBillingAccountByUserIdMock,
    getBillingAccountByPaddleCustomerId: getBillingAccountByPaddleCustomerIdMock,
    getSupabasePasswordSignUpAvailability: getSupabasePasswordSignUpAvailabilityMock,
    refreshResolvedEntitlement: refreshResolvedEntitlementMock,
    updateSupabaseUsername: updateSupabaseUsernameMock,
    upsertBillingAccount: upsertBillingAccountMock,
}));

vi.mock('@/server/paddleBilling', () => ({
    createPaddleCustomer: createPaddleCustomerMock,
    createPaddleCheckoutTransaction: createPaddleCheckoutTransactionMock,
    createPaddleCustomerPortalSession: createPaddleCustomerPortalSessionMock,
    buildPaddleHostedCheckoutUrl: buildPaddleHostedCheckoutUrlMock,
    verifyAndParsePaddleWebhookEvent: verifyAndParsePaddleWebhookEventMock,
    buildEntitlementProjectionFromPaddleSubscription: buildEntitlementProjectionFromPaddleSubscriptionMock,
}));

import {
    handleEntitlementRefreshRequest,
    handlePasswordSignUpRequest,
    handleProfileUpdateRequest,
} from '@/server/accountHandlers';
import {
    handlePaddleCheckoutRequest,
    handlePaddlePortalRequest,
    handlePaddleWebhookRequest,
} from '@/server/billingHandlers';

const env = {
    appUrl: 'https://myorep.example/account',
    paddleApiKey: 'pdl_test_key',
    paddleNotificationSecretKey: 'notification-secret',
    paddlePlusPriceId: 'pri_plus',
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon-key',
    supabaseServiceRoleKey: 'service-role-key',
};

const subscription = (overrides: Record<string, unknown> = {}) => ({
    id: 'sub_1',
    customer_id: 'ctm_1',
    custom_data: { supabaseUserId: 'user-1' },
    status: 'active',
    items: [{ price: { id: 'pri_plus' } }],
    next_billed_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
});

const webhookEvent = (overrides: Record<string, unknown> = {}) => ({
    event_id: 'evt_1',
    event_type: 'subscription.updated',
    occurred_at: '2026-08-05T00:00:00.000Z',
    data: subscription(),
    ...overrides,
});

const request = (
    path: string,
    init: RequestInit = {},
): Request => new Request(`https://example.test${path}`, init);

const authenticatedRequest = (path: string, body?: unknown): Request => request(path, {
    method: 'POST',
    headers: {
        Authorization: 'Bearer access-token',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

const signedWebhookRequest = (body = '{}'): Request => request('/api/paddle/webhook', {
    method: 'POST',
    headers: { 'paddle-signature': 'ts=123;h1=digest' },
    body,
});

beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();

    getBillingEnvironmentMock.mockReturnValue(env);
    getSupabaseServerEnvironmentMock.mockReturnValue(env);
    createSupabaseAuthClientMock.mockReturnValue({ kind: 'auth-client' });
    createSupabaseAdminClientMock.mockReturnValue({ kind: 'admin-client' });
    authenticateSupabaseUserMock.mockResolvedValue({
        id: 'user-1',
        email: 'athlete@example.com',
    });
    getBillingAccountByUserIdMock.mockResolvedValue(null);
    getBillingAccountByPaddleCustomerIdMock.mockResolvedValue(null);
    getSupabasePasswordSignUpAvailabilityMock.mockResolvedValue('available');
    refreshResolvedEntitlementMock.mockResolvedValue({
        user_id: 'user-1',
        plan: 'plus',
        cloud_sync_enabled: true,
        updated_at: '2026-08-05T00:00:00.000Z',
    });
    updateSupabaseUsernameMock.mockResolvedValue({
        id: 'user-1',
        username: 'athlete_one',
    });
    upsertBillingAccountMock.mockResolvedValue(undefined);
    createPaddleCustomerMock.mockResolvedValue({ id: 'ctm_1' });
    createPaddleCheckoutTransactionMock.mockResolvedValue({ id: 'txn_1' });
    createPaddleCustomerPortalSessionMock.mockResolvedValue({
        urls: { general: { overview: 'https://vendors.paddle.com/portal/1' } },
    });
    buildPaddleHostedCheckoutUrlMock.mockReturnValue(
        'https://myorep.example/account?_ptxn=txn_1',
    );
    verifyAndParsePaddleWebhookEventMock.mockReturnValue(webhookEvent());
    buildEntitlementProjectionFromPaddleSubscriptionMock.mockImplementation((data, userId, occurredAt) => ({
        userId,
        paddleCustomerId: data.customer_id ?? null,
        paddleSubscriptionId: data.id,
        paddlePriceId: data.items?.[0]?.price?.id ?? null,
        subscriptionStatus: data.status,
        active: data.status === 'active' || data.status === 'trialing',
        currentPeriodEnd: data.next_billed_at ?? null,
        occurredAt,
    }));
    applyPaddleSubscriptionEventMock.mockResolvedValue('applied');
});

describe('billing handler branch coverage', () => {
    it('rejects non-POST methods on all Paddle endpoints', async () => {
        const responses = await Promise.all([
            handlePaddleCheckoutRequest(request('/api/paddle/checkout')),
            handlePaddlePortalRequest(request('/api/paddle/portal')),
            handlePaddleWebhookRequest(request('/api/paddle/webhook')),
        ]);

        expect(responses.map(({ status }) => status)).toEqual([405, 405, 405]);
        for (const response of responses) {
            await expect(response.json()).resolves.toEqual({ error: 'Method not allowed.' });
        }
        expect(getBillingEnvironmentMock).not.toHaveBeenCalled();
    });

    it('rejects missing, non-Bearer, and empty checkout authorization values', async () => {
        const responses = await Promise.all([
            handlePaddleCheckoutRequest(request('/api/paddle/checkout', { method: 'POST' })),
            handlePaddleCheckoutRequest(request('/api/paddle/checkout', {
                method: 'POST',
                headers: { Authorization: 'Basic abc' },
            })),
            handlePaddleCheckoutRequest(request('/api/paddle/checkout', {
                method: 'POST',
                headers: { Authorization: 'Bearer    ' },
            })),
        ]);

        expect(responses.map(({ status }) => status)).toEqual([401, 401, 401]);
        expect(authenticateSupabaseUserMock).not.toHaveBeenCalled();
    });

    it('uses the capitalized authorization-header fallback', async () => {
        getBillingAccountByUserIdMock.mockResolvedValue({ paddle_customer_id: 'ctm_existing' });
        const headersGet = vi.fn((name: string) => {
            if (name === 'authorization') return null;
            if (name === 'Authorization') return 'Bearer capitalized-token';
            return null;
        });
        const fakeRequest = {
            method: 'POST',
            headers: { get: headersGet },
        } as unknown as Request;

        const response = await handlePaddleCheckoutRequest(fakeRequest);

        expect(response.status).toBe(200);
        expect(authenticateSupabaseUserMock).toHaveBeenCalledWith(
            { kind: 'auth-client' },
            'capitalized-token',
        );
    });

    it('rejects a syntactically Bearer but empty token from a raw billing header adapter', async () => {
        const headersGet = vi.fn((name: string) => (
            name === 'authorization' ? 'Bearer   ' : null
        ));
        const fakeRequest = {
            method: 'POST',
            headers: { get: headersGet },
        } as unknown as Request;

        const response = await handlePaddleCheckoutRequest(fakeRequest);

        expect(response.status).toBe(401);
        expect(authenticateSupabaseUserMock).not.toHaveBeenCalled();
    });

    it('returns authentication errors and the non-Error session fallback', async () => {
        authenticateSupabaseUserMock
            .mockRejectedValueOnce(new Error('session expired'))
            .mockRejectedValueOnce('not-an-error');

        const errorResponse = await handlePaddleCheckoutRequest(
            authenticatedRequest('/api/paddle/checkout'),
        );
        const fallbackResponse = await handlePaddleCheckoutRequest(
            authenticatedRequest('/api/paddle/checkout'),
        );

        expect(errorResponse.status).toBe(401);
        await expect(errorResponse.json()).resolves.toEqual({ error: 'session expired' });
        expect(fallbackResponse.status).toBe(401);
        await expect(fallbackResponse.json()).resolves.toEqual({
            error: 'Invalid Supabase session.',
        });
    });

    it('reuses an existing customer and skips Paddle customer provisioning', async () => {
        getBillingAccountByUserIdMock.mockResolvedValue({ paddle_customer_id: 'ctm_existing' });

        const response = await handlePaddleCheckoutRequest(
            authenticatedRequest('/api/paddle/checkout'),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            url: 'https://myorep.example/account?_ptxn=txn_1',
        });
        expect(createPaddleCustomerMock).not.toHaveBeenCalled();
        expect(upsertBillingAccountMock).not.toHaveBeenCalled();
        expect(createPaddleCheckoutTransactionMock).toHaveBeenCalledWith(env, {
            customerId: 'ctm_existing',
            userId: 'user-1',
        });
    });

    it('provisions a customer with a null email before checkout', async () => {
        authenticateSupabaseUserMock.mockResolvedValue({ id: 'user-no-email' });

        const response = await handlePaddleCheckoutRequest(
            authenticatedRequest('/api/paddle/checkout'),
        );

        expect(response.status).toBe(200);
        expect(createPaddleCustomerMock).toHaveBeenCalledWith(env, {
            id: 'user-no-email',
            email: null,
        });
        expect(upsertBillingAccountMock).toHaveBeenCalledWith(
            { kind: 'admin-client' },
            { user_id: 'user-no-email', paddle_customer_id: 'ctm_1' },
        );
    });

    it('returns detailed checkout errors and the non-Error creation fallback', async () => {
        getBillingAccountByUserIdMock.mockRejectedValueOnce(new Error('billing query failed'));
        const detailedResponse = await handlePaddleCheckoutRequest(
            authenticatedRequest('/api/paddle/checkout'),
        );

        getBillingAccountByUserIdMock.mockResolvedValueOnce({ paddle_customer_id: 'ctm_1' });
        createPaddleCheckoutTransactionMock.mockRejectedValueOnce('unknown failure');
        const fallbackResponse = await handlePaddleCheckoutRequest(
            authenticatedRequest('/api/paddle/checkout'),
        );

        expect(detailedResponse.status).toBe(500);
        await expect(detailedResponse.json()).resolves.toEqual({ error: 'billing query failed' });
        expect(fallbackResponse.status).toBe(500);
        await expect(fallbackResponse.json()).resolves.toEqual({
            error: 'Could not create Paddle checkout session.',
        });
    });

    it('returns a successful Paddle customer portal URL', async () => {
        getBillingAccountByUserIdMock.mockResolvedValue({ paddle_customer_id: 'ctm_1' });

        const response = await handlePaddlePortalRequest(
            authenticatedRequest('/api/paddle/portal'),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            url: 'https://vendors.paddle.com/portal/1',
        });
        expect(createPaddleCustomerPortalSessionMock).toHaveBeenCalledWith(env, 'ctm_1');
    });

    it('requires authentication before loading a Paddle portal account', async () => {
        const response = await handlePaddlePortalRequest(request('/api/paddle/portal', {
            method: 'POST',
        }));

        expect(response.status).toBe(401);
        expect(getBillingAccountByUserIdMock).not.toHaveBeenCalled();
    });

    it('rejects both a missing billing account and a null Paddle customer id', async () => {
        getBillingAccountByUserIdMock
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ paddle_customer_id: null });

        for (let attempt = 0; attempt < 2; attempt += 1) {
            const response = await handlePaddlePortalRequest(
                authenticatedRequest('/api/paddle/portal'),
            );
            expect(response.status).toBe(400);
            await expect(response.json()).resolves.toEqual({
                error: 'No Paddle billing account was found for this user yet.',
            });
        }
    });

    it('rejects every incomplete Paddle portal URL shape', async () => {
        getBillingAccountByUserIdMock.mockResolvedValue({ paddle_customer_id: 'ctm_1' });

        for (const portalSession of [
            {},
            { urls: undefined },
            { urls: {} },
            { urls: { general: undefined } },
            { urls: { general: {} } },
            { urls: { general: { overview: '' } } },
        ]) {
            createPaddleCustomerPortalSessionMock.mockResolvedValueOnce(portalSession);
            const response = await handlePaddlePortalRequest(
                authenticatedRequest('/api/paddle/portal'),
            );
            expect(response.status).toBe(500);
            await expect(response.json()).resolves.toEqual({
                error: 'Paddle customer portal did not return a management URL.',
            });
        }
    });

    it('returns detailed portal failures and the non-Error fallback', async () => {
        getBillingAccountByUserIdMock.mockRejectedValueOnce(new Error('portal lookup failed'));
        const detailedResponse = await handlePaddlePortalRequest(
            authenticatedRequest('/api/paddle/portal'),
        );

        getBillingAccountByUserIdMock.mockResolvedValueOnce({ paddle_customer_id: 'ctm_1' });
        createPaddleCustomerPortalSessionMock.mockRejectedValueOnce('unknown portal failure');
        const fallbackResponse = await handlePaddlePortalRequest(
            authenticatedRequest('/api/paddle/portal'),
        );

        expect(detailedResponse.status).toBe(500);
        await expect(detailedResponse.json()).resolves.toEqual({ error: 'portal lookup failed' });
        expect(fallbackResponse.status).toBe(500);
        await expect(fallbackResponse.json()).resolves.toEqual({
            error: 'Could not create Paddle customer portal session.',
        });
    });

    it('rejects missing and invalid webhook signatures', async () => {
        const missing = await handlePaddleWebhookRequest(request('/api/paddle/webhook', {
            method: 'POST',
            body: '{}',
        }));
        verifyAndParsePaddleWebhookEventMock.mockImplementationOnce(() => {
            throw new Error('bad signature');
        });
        const invalid = await handlePaddleWebhookRequest(signedWebhookRequest('{"bad":true}'));

        expect(missing.status).toBe(400);
        await expect(missing.json()).resolves.toEqual({ error: 'Missing Paddle signature.' });
        expect(invalid.status).toBe(400);
        await expect(invalid.json()).resolves.toEqual({ error: 'Invalid Paddle webhook.' });
    });

    it('uses the capitalized Paddle signature-header fallback', async () => {
        const headersGet = vi.fn((name: string) => {
            if (name === 'paddle-signature') return null;
            if (name === 'Paddle-Signature') return 'ts=456;h1=fallback';
            return null;
        });
        const fakeRequest = {
            method: 'POST',
            headers: { get: headersGet },
            text: vi.fn().mockResolvedValue('{"event":"other"}'),
        } as unknown as Request;
        verifyAndParsePaddleWebhookEventMock.mockReturnValueOnce({
            event_id: 'evt_other',
            event_type: 'transaction.completed',
            occurred_at: '2026-08-05T00:00:00.000Z',
            data: {},
        });

        const response = await handlePaddleWebhookRequest(fakeRequest);

        expect(response.status).toBe(200);
        expect(verifyAndParsePaddleWebhookEventMock).toHaveBeenCalledWith(
            '{"event":"other"}',
            'ts=456;h1=fallback',
            env.paddleNotificationSecretKey,
        );
    });

    it.each([
        'subscription.created',
        'subscription.updated',
        'subscription.activated',
        'subscription.trialing',
        'subscription.canceled',
        'subscription.paused',
        'subscription.resumed',
        'subscription.past_due',
    ])('syncs the supported %s webhook event', async (eventType) => {
        verifyAndParsePaddleWebhookEventMock.mockReturnValueOnce(webhookEvent({
            event_id: `evt_${eventType}`,
            event_type: eventType,
        }));

        const response = await handlePaddleWebhookRequest(signedWebhookRequest());

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ received: true });
        expect(applyPaddleSubscriptionEventMock).toHaveBeenCalledWith(
            { kind: 'admin-client' },
            expect.objectContaining({
                eventId: `evt_${eventType}`,
                eventType,
                userId: 'user-1',
            }),
        );
    });

    it('acknowledges unsupported and malformed event types without projecting them', async () => {
        verifyAndParsePaddleWebhookEventMock
            .mockReturnValueOnce(webhookEvent({ event_type: 'transaction.completed' }))
            .mockReturnValueOnce(webhookEvent({ event_type: undefined }));

        for (let attempt = 0; attempt < 2; attempt += 1) {
            const response = await handlePaddleWebhookRequest(signedWebhookRequest());
            expect(response.status).toBe(200);
            await expect(response.json()).resolves.toEqual({ received: true });
        }
        expect(applyPaddleSubscriptionEventMock).not.toHaveBeenCalled();
    });

    it.each([
        ['duplicate', { received: true, duplicate: true }],
        ['stale', { received: true, stale: true }],
        ['applied', { received: true }],
    ] as const)('returns the %s event-acceptance response', async (acceptance, expectedBody) => {
        applyPaddleSubscriptionEventMock.mockResolvedValueOnce(acceptance);

        const response = await handlePaddleWebhookRequest(signedWebhookRequest());

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual(expectedBody);
    });

    it('falls back from non-string or empty metadata to the customer mapping', async () => {
        getBillingAccountByPaddleCustomerIdMock.mockResolvedValue({ user_id: 'mapped-user' });

        for (const customData of [
            { supabaseUserId: 42 },
            { supabaseUserId: '' },
            null,
            undefined,
        ]) {
            verifyAndParsePaddleWebhookEventMock.mockReturnValueOnce(webhookEvent({
                data: subscription({ custom_data: customData }),
            }));
            const response = await handlePaddleWebhookRequest(signedWebhookRequest());
            expect(response.status).toBe(200);
        }

        expect(getBillingAccountByPaddleCustomerIdMock).toHaveBeenCalledTimes(4);
        expect(buildEntitlementProjectionFromPaddleSubscriptionMock).toHaveBeenLastCalledWith(
            expect.any(Object),
            'mapped-user',
            '2026-08-05T00:00:00.000Z',
        );
    });

    it('fails closed when customer metadata and database mappings cannot resolve a user', async () => {
        verifyAndParsePaddleWebhookEventMock
            .mockReturnValueOnce(webhookEvent({
                data: subscription({ customer_id: null, custom_data: null }),
            }))
            .mockReturnValueOnce(webhookEvent({
                data: subscription({ customer_id: 'ctm_unmapped', custom_data: null }),
            }));
        getBillingAccountByPaddleCustomerIdMock.mockResolvedValueOnce(null);

        const noCustomer = await handlePaddleWebhookRequest(signedWebhookRequest());
        const noMapping = await handlePaddleWebhookRequest(signedWebhookRequest());

        expect(noCustomer.status).toBe(500);
        expect(noMapping.status).toBe(500);
        await expect(noCustomer.json()).resolves.toEqual({
            error: 'Could not process Paddle webhook.',
        });
        await expect(noMapping.json()).resolves.toEqual({
            error: 'Could not process Paddle webhook.',
        });
    });

    it('rejects a subscription event whose entitlement projection lacks occurred_at', async () => {
        buildEntitlementProjectionFromPaddleSubscriptionMock.mockReturnValueOnce({
            userId: 'user-1',
            paddleCustomerId: 'ctm_1',
            paddleSubscriptionId: 'sub_1',
            paddlePriceId: null,
            subscriptionStatus: 'active',
            active: true,
            currentPeriodEnd: null,
            occurredAt: null,
        });

        const response = await handlePaddleWebhookRequest(signedWebhookRequest());

        expect(response.status).toBe(500);
        expect(applyPaddleSubscriptionEventMock).not.toHaveBeenCalled();
    });

    it('converts projection persistence failures into a stable webhook error', async () => {
        applyPaddleSubscriptionEventMock.mockRejectedValueOnce(new Error('database unavailable'));

        const response = await handlePaddleWebhookRequest(signedWebhookRequest());

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({
            error: 'Could not process Paddle webhook.',
        });
    });
});

describe('account handler branch coverage', () => {
    it('rejects non-POST methods on all account endpoints', async () => {
        const responses = await Promise.all([
            handleEntitlementRefreshRequest(request('/api/account/refresh-entitlement')),
            handlePasswordSignUpRequest(request('/api/account/password-signup')),
            handleProfileUpdateRequest(request('/api/account/update-profile')),
        ]);

        expect(responses.map(({ status }) => status)).toEqual([405, 405, 405]);
        expect(getSupabaseServerEnvironmentMock).not.toHaveBeenCalled();
    });

    it('rejects missing, non-Bearer, and empty entitlement authorization values', async () => {
        const responses = await Promise.all([
            handleEntitlementRefreshRequest(request('/api/account/refresh-entitlement', {
                method: 'POST',
            })),
            handleEntitlementRefreshRequest(request('/api/account/refresh-entitlement', {
                method: 'POST',
                headers: { Authorization: 'Basic value' },
            })),
            handleEntitlementRefreshRequest(request('/api/account/refresh-entitlement', {
                method: 'POST',
                headers: { Authorization: 'Bearer    ' },
            })),
        ]);

        expect(responses.map(({ status }) => status)).toEqual([401, 401, 401]);
        expect(authenticateSupabaseUserMock).not.toHaveBeenCalled();
    });

    it('handles a syntactically Bearer but empty token from a raw header adapter', async () => {
        const headersGet = vi.fn((name: string) => (
            name === 'authorization' ? 'Bearer   ' : null
        ));
        const fakeRequest = {
            method: 'POST',
            headers: { get: headersGet },
        } as unknown as Request;

        const response = await handleEntitlementRefreshRequest(fakeRequest);

        expect(response.status).toBe(401);
        expect(authenticateSupabaseUserMock).not.toHaveBeenCalled();
    });

    it('refreshes entitlements through the capitalized authorization fallback', async () => {
        const headersGet = vi.fn((name: string) => {
            if (name === 'authorization') return null;
            if (name === 'Authorization') return 'Bearer capitalized-token';
            return null;
        });
        const fakeRequest = {
            method: 'POST',
            headers: { get: headersGet },
        } as unknown as Request;

        const response = await handleEntitlementRefreshRequest(fakeRequest);

        expect(response.status).toBe(200);
        expect(authenticateSupabaseUserMock).toHaveBeenCalledWith(
            { kind: 'auth-client' },
            'capitalized-token',
        );
        await expect(response.json()).resolves.toMatchObject({
            entitlement: { plan: 'plus' },
        });
    });

    it('returns entitlement refresh Error details and the non-Error fallback', async () => {
        refreshResolvedEntitlementMock
            .mockRejectedValueOnce(new Error('refresh failed'))
            .mockRejectedValueOnce('unknown failure');

        const detailedResponse = await handleEntitlementRefreshRequest(
            authenticatedRequest('/api/account/refresh-entitlement'),
        );
        const fallbackResponse = await handleEntitlementRefreshRequest(
            authenticatedRequest('/api/account/refresh-entitlement'),
        );

        expect(detailedResponse.status).toBe(500);
        await expect(detailedResponse.json()).resolves.toEqual({ error: 'refresh failed' });
        expect(fallbackResponse.status).toBe(500);
        await expect(fallbackResponse.json()).resolves.toEqual({
            error: 'Could not refresh entitlement state.',
        });
    });

    it('rejects malformed and non-string signup usernames before querying Supabase', async () => {
        const malformed = await handlePasswordSignUpRequest(request('/api/account/password-signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{not-json',
        }));
        const nonString = await handlePasswordSignUpRequest(authenticatedRequest(
            '/api/account/password-signup',
            { username: 123, email: 'valid@example.com' },
        ));

        expect(malformed.status).toBe(400);
        expect(nonString.status).toBe(400);
        expect(getSupabasePasswordSignUpAvailabilityMock).not.toHaveBeenCalled();
    });

    it('rejects missing, non-string, whitespace, and malformed signup emails', async () => {
        for (const email of [undefined, 42, '   ', 'bad@', 'has space@example.com']) {
            const response = await handlePasswordSignUpRequest(authenticatedRequest(
                '/api/account/password-signup',
                { username: 'valid_user', email },
            ));
            expect(response.status).toBe(400);
            await expect(response.json()).resolves.toEqual({
                error: 'Enter a valid email address.',
            });
        }
        expect(getSupabasePasswordSignUpAvailabilityMock).not.toHaveBeenCalled();
    });

    it.each([
        ['available', 200, { ok: true }],
        ['email_taken', 200, { ok: true }],
        ['username_taken', 409, {
            error: 'That username is already taken.',
            code: 'username_taken',
        }],
    ] as const)('handles the %s signup availability status', async (
        availability,
        expectedStatus,
        expectedBody,
    ) => {
        getSupabasePasswordSignUpAvailabilityMock.mockResolvedValueOnce(availability);

        const response = await handlePasswordSignUpRequest(request('/api/account/password-signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-vercel-forwarded-for': `198.51.100.${expectedStatus}`,
            },
            body: JSON.stringify({
                username: ' New.User ',
                email: ' NEW@EXAMPLE.COM ',
            }),
        }));

        expect(response.status).toBe(expectedStatus);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        await expect(response.json()).resolves.toEqual(expectedBody);
        expect(getSupabasePasswordSignUpAvailabilityMock).toHaveBeenCalledWith(
            { kind: 'admin-client' },
            { username: 'new_user', email: 'new@example.com' },
        );
    });

    it('returns a stable signup error when environment or availability lookup fails', async () => {
        getSupabasePasswordSignUpAvailabilityMock.mockRejectedValueOnce(new Error('RPC failed'));
        const rpcFailure = await handlePasswordSignUpRequest(request('/api/account/password-signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-real-ip': '198.51.100.31',
            },
            body: JSON.stringify({ username: 'valid_user', email: 'valid@example.com' }),
        }));

        getSupabaseServerEnvironmentMock.mockImplementationOnce(() => {
            throw new Error('environment missing');
        });
        const environmentFailure = await handlePasswordSignUpRequest(request('/api/account/password-signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-forwarded-for': '198.51.100.32',
            },
            body: JSON.stringify({ username: 'valid_user', email: 'valid@example.com' }),
        }));

        for (const response of [rpcFailure, environmentFailure]) {
            expect(response.status).toBe(500);
            await expect(response.json()).resolves.toEqual({
                error: 'Could not prepare the account sign-up.',
            });
        }
    });

    it('uses each client-address fallback and sanitizes forwarded address lists', async () => {
        const headerCases = [
            { 'x-vercel-forwarded-for': ' 203.0.113.40, 10.0.0.1 ' },
            { 'x-real-ip': '203.0.113.41' },
            { 'x-forwarded-for': '203.0.113.42' },
            { 'x-forwarded-for': '   ' },
            { 'x-real-ip': 'x'.repeat(200) },
            {},
        ];

        for (const headers of headerCases) {
            const response = await handlePasswordSignUpRequest(request('/api/account/password-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify({ username: 'address_user', email: 'address@example.com' }),
            }));
            expect(response.status).toBe(200);
        }
        expect(getSupabasePasswordSignUpAvailabilityMock).toHaveBeenCalledTimes(headerCases.length);
    });

    it('rate-limits repeated requests and resets an expired address window', async () => {
        let currentTime = 2_000_000_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => currentTime);
        const createRequest = () => request('/api/account/password-signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-forwarded-for': '198.51.100.55',
            },
            body: JSON.stringify({ username: 'rate_user', email: 'rate@example.com' }),
        });

        for (let attempt = 0; attempt < 10; attempt += 1) {
            expect((await handlePasswordSignUpRequest(createRequest())).status).toBe(200);
        }
        currentTime += 59_999;
        const limited = await handlePasswordSignUpRequest(createRequest());
        expect(limited.status).toBe(429);
        expect(limited.headers.get('Retry-After')).toBe('1');

        currentTime += 2;
        expect((await handlePasswordSignUpRequest(createRequest())).status).toBe(200);
    });

    it('bounds the in-process signup-address map by evicting its oldest live key', async () => {
        vi.resetModules();
        const { handlePasswordSignUpRequest: isolatedHandler } = await import('@/server/accountHandlers');
        vi.spyOn(Date, 'now').mockReturnValue(2_100_000_000_000);

        for (let index = 0; index <= 2_000; index += 1) {
            const response = await isolatedHandler(request('/api/account/password-signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-forwarded-for': `192.0.${Math.floor(index / 256)}.${index % 256}`,
                },
                body: JSON.stringify({ username: 'bounded_map', email: 'bounded@example.com' }),
            }));
            expect(response.status).toBe(200);
        }

        const requestWithNoOldestKey = request('/api/account/password-signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-forwarded-for': '203.0.113.251',
            },
            body: JSON.stringify({ username: 'bounded_map', email: 'bounded@example.com' }),
        });
        const keysSpy = vi.spyOn(Map.prototype, 'keys').mockImplementationOnce(() => ({
            next: () => ({ done: true, value: undefined }),
            [Symbol.iterator]() {
                return this;
            },
        }) as MapIterator<unknown>);
        expect((await isolatedHandler(requestWithNoOldestKey)).status).toBe(200);
        keysSpy.mockRestore();

        expect(getSupabasePasswordSignUpAvailabilityMock).toHaveBeenCalledTimes(2_002);
    }, 20_000);

    it('purges expired signup-address entries when the map reaches capacity', async () => {
        vi.resetModules();
        const { handlePasswordSignUpRequest: isolatedHandler } = await import('@/server/accountHandlers');
        let currentTime = 2_200_000_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

        for (let index = 0; index < 2_000; index += 1) {
            await isolatedHandler(request('/api/account/password-signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-forwarded-for': `198.18.${Math.floor(index / 256)}.${index % 256}`,
                },
                body: JSON.stringify({ username: 'expired_map', email: 'expired@example.com' }),
            }));
        }

        currentTime += 60_001;
        const response = await isolatedHandler(request('/api/account/password-signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-forwarded-for': '203.0.113.250',
            },
            body: JSON.stringify({ username: 'expired_map', email: 'expired@example.com' }),
        }));

        expect(response.status).toBe(200);
    }, 20_000);

    it('rejects missing, malformed, and invalid profile-update payloads', async () => {
        const missingAuth = await handleProfileUpdateRequest(request('/api/account/update-profile', {
            method: 'POST',
        }));
        const malformed = await handleProfileUpdateRequest(request('/api/account/update-profile', {
            method: 'POST',
            headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
            body: '{bad-json',
        }));
        const nonString = await handleProfileUpdateRequest(authenticatedRequest(
            '/api/account/update-profile',
            { username: 42 },
        ));

        expect(missingAuth.status).toBe(401);
        expect(malformed.status).toBe(400);
        expect(nonString.status).toBe(400);
        expect(updateSupabaseUsernameMock).not.toHaveBeenCalled();
    });

    it('normalizes and updates a valid profile username', async () => {
        const response = await handleProfileUpdateRequest(authenticatedRequest(
            '/api/account/update-profile',
            { username: ' Athlete.One ' },
        ));

        expect(response.status).toBe(200);
        expect(updateSupabaseUsernameMock).toHaveBeenCalledWith(
            { kind: 'admin-client' },
            { userId: 'user-1', username: 'athlete_one' },
        );
        await expect(response.json()).resolves.toEqual({
            profile: { id: 'user-1', username: 'athlete_one' },
        });
    });

    it('maps typed username conflicts to 409 and preserves code and message', async () => {
        updateSupabaseUsernameMock.mockRejectedValueOnce(
            new AccountProvisionErrorMock('username_taken', 'That username is already taken.'),
        );

        const response = await handleProfileUpdateRequest(authenticatedRequest(
            '/api/account/update-profile',
            { username: 'claimed_user' },
        ));

        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toEqual({
            error: 'That username is already taken.',
            code: 'username_taken',
        });
    });

    it('returns profile Error details and the non-Error update fallback', async () => {
        updateSupabaseUsernameMock
            .mockRejectedValueOnce(new Error('profile database failed'))
            .mockRejectedValueOnce('unknown update failure');

        const detailed = await handleProfileUpdateRequest(authenticatedRequest(
            '/api/account/update-profile',
            { username: 'valid_user' },
        ));
        const fallback = await handleProfileUpdateRequest(authenticatedRequest(
            '/api/account/update-profile',
            { username: 'valid_user' },
        ));

        expect(detailed.status).toBe(500);
        await expect(detailed.json()).resolves.toEqual({ error: 'profile database failed' });
        expect(fallback.status).toBe(500);
        await expect(fallback.json()).resolves.toEqual({
            error: 'Could not update the profile.',
        });
    });
});
