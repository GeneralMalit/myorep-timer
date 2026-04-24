import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    handlePaddleCheckoutRequest,
    handlePaddlePortalRequest,
    handlePaddleWebhookRequest,
} from '@/server/billingHandlers';

const getBillingEnvironmentMock = vi.hoisted(() => vi.fn());
const createSupabaseAuthClientMock = vi.hoisted(() => vi.fn());
const createSupabaseAdminClientMock = vi.hoisted(() => vi.fn());
const authenticateSupabaseUserMock = vi.hoisted(() => vi.fn());
const getBillingAccountByUserIdMock = vi.hoisted(() => vi.fn());
const getBillingAccountByPaddleCustomerIdMock = vi.hoisted(() => vi.fn());
const upsertBillingAccountMock = vi.hoisted(() => vi.fn());
const syncResolvedEntitlementMock = vi.hoisted(() => vi.fn());
const createPaddleCustomerMock = vi.hoisted(() => vi.fn());
const createPaddleCheckoutTransactionMock = vi.hoisted(() => vi.fn());
const createPaddleCustomerPortalSessionMock = vi.hoisted(() => vi.fn());
const buildPaddleHostedCheckoutUrlMock = vi.hoisted(() => vi.fn());
const verifyAndParsePaddleWebhookEventMock = vi.hoisted(() => vi.fn());
const buildEntitlementProjectionFromPaddleSubscriptionMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/billingEnv', () => ({
    getBillingEnvironment: getBillingEnvironmentMock,
}));

vi.mock('@/server/billingData', () => ({
    createSupabaseAuthClient: createSupabaseAuthClientMock,
    createSupabaseAdminClient: createSupabaseAdminClientMock,
    authenticateSupabaseUser: authenticateSupabaseUserMock,
    getBillingAccountByUserId: getBillingAccountByUserIdMock,
    getBillingAccountByPaddleCustomerId: getBillingAccountByPaddleCustomerIdMock,
    upsertBillingAccount: upsertBillingAccountMock,
}));

vi.mock('@/server/entitlements', () => ({
    syncResolvedEntitlement: syncResolvedEntitlementMock,
}));

vi.mock('@/server/paddleBilling', () => ({
    createPaddleCustomer: createPaddleCustomerMock,
    createPaddleCheckoutTransaction: createPaddleCheckoutTransactionMock,
    createPaddleCustomerPortalSession: createPaddleCustomerPortalSessionMock,
    buildPaddleHostedCheckoutUrl: buildPaddleHostedCheckoutUrlMock,
    verifyAndParsePaddleWebhookEvent: verifyAndParsePaddleWebhookEventMock,
    buildEntitlementProjectionFromPaddleSubscription: buildEntitlementProjectionFromPaddleSubscriptionMock,
}));

const env = {
    appUrl: 'https://myorep.app/account',
    paddleApiKey: 'pdl_test_123',
    paddleNotificationSecretKey: 'pdl_ntfset_123',
    paddlePlusPriceId: 'pri_plus',
    supabaseUrl: 'https://supabase.example.co',
    supabaseAnonKey: 'anon-key',
    supabaseServiceRoleKey: 'service-role',
};

const createJsonRequest = (path: string, init?: RequestInit) => {
    return new Request(`https://example.test${path}`, init);
};

describe('billingHandlers', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        getBillingEnvironmentMock.mockReturnValue(env);
        createSupabaseAuthClientMock.mockReturnValue({ kind: 'auth-client' });
        createSupabaseAdminClientMock.mockReturnValue({ kind: 'admin-client' });
        authenticateSupabaseUserMock.mockResolvedValue({
            id: 'user-1',
            email: 'athlete@example.com',
        });
        getBillingAccountByUserIdMock.mockResolvedValue(null);
        getBillingAccountByPaddleCustomerIdMock.mockResolvedValue(null);
        upsertBillingAccountMock.mockResolvedValue(undefined);
        syncResolvedEntitlementMock.mockResolvedValue(undefined);
        createPaddleCustomerMock.mockResolvedValue({
            id: 'ctm_123',
        });
        createPaddleCheckoutTransactionMock.mockResolvedValue({
            id: 'txn_123',
        });
        createPaddleCustomerPortalSessionMock.mockResolvedValue({
            urls: {
                general: {
                    overview: 'https://vendors.paddle.com/customer-portal/test_123',
                },
            },
        });
        buildPaddleHostedCheckoutUrlMock.mockReturnValue('https://myorep.app/account?_ptxn=txn_123');
        buildEntitlementProjectionFromPaddleSubscriptionMock.mockReturnValue({
            userId: 'user-1',
            paddleCustomerId: 'ctm_123',
            paddleSubscriptionId: 'sub_123',
            paddlePriceId: 'pri_plus',
            subscriptionStatus: 'active',
            active: true,
            currentPeriodEnd: '2026-05-01T00:00:00.000Z',
            occurredAt: '2026-04-16T00:00:00.000Z',
        });
    });

    it('rejects checkout requests without an authenticated user', async () => {
        const response = await handlePaddleCheckoutRequest(createJsonRequest('/api/paddle/checkout', {
            method: 'POST',
        }));

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({
            error: 'Sign in first to manage Plus billing.',
        });
        expect(authenticateSupabaseUserMock).not.toHaveBeenCalled();
    });

    it('creates a checkout transaction for an authenticated user and persists the Paddle customer mapping', async () => {
        const response = await handlePaddleCheckoutRequest(createJsonRequest('/api/paddle/checkout', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer access-token',
            },
        }));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            url: 'https://myorep.app/account?_ptxn=txn_123',
        });
        expect(authenticateSupabaseUserMock).toHaveBeenCalledWith({ kind: 'auth-client' }, 'access-token');
        expect(createPaddleCustomerMock).toHaveBeenCalledWith(env, {
            id: 'user-1',
            email: 'athlete@example.com',
        });
        expect(upsertBillingAccountMock).toHaveBeenCalledWith({ kind: 'admin-client' }, expect.objectContaining({
            user_id: 'user-1',
            paddle_customer_id: 'ctm_123',
        }));
        expect(createPaddleCheckoutTransactionMock).toHaveBeenCalledWith(env, {
            customerId: 'ctm_123',
            userId: 'user-1',
        });
        expect(buildPaddleHostedCheckoutUrlMock).toHaveBeenCalledWith(env.appUrl, 'txn_123');
    });

    it('returns a helpful portal error when the user does not have a Paddle customer yet', async () => {
        getBillingAccountByUserIdMock.mockResolvedValueOnce({
            user_id: 'user-1',
            paddle_customer_id: null,
        });

        const response = await handlePaddlePortalRequest(createJsonRequest('/api/paddle/portal', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer access-token',
            },
        }));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            error: 'No Paddle billing account was found for this user yet.',
        });
        expect(createPaddleCustomerPortalSessionMock).not.toHaveBeenCalled();
    });

    it('projects Paddle subscription updates into Supabase entitlements', async () => {
        verifyAndParsePaddleWebhookEventMock.mockReturnValue({
            event_id: 'evt_123',
            event_type: 'subscription.updated',
            occurred_at: '2026-04-16T00:00:00.000Z',
            data: {
                id: 'sub_123',
                customer_id: 'ctm_123',
                custom_data: {
                    supabaseUserId: 'user-1',
                },
                status: 'active',
                items: [
                    {
                        price: {
                            id: 'pri_plus',
                        },
                    },
                ],
                next_billed_at: '2026-05-01T00:00:00.000Z',
            },
        });
        getBillingAccountByUserIdMock.mockResolvedValueOnce({
            user_id: 'user-1',
            paddle_customer_id: 'ctm_123',
            last_event_id: null,
        });

        const response = await handlePaddleWebhookRequest(createJsonRequest('/api/paddle/webhook', {
            method: 'POST',
            headers: {
                'paddle-signature': 'ts=123;h1=abc',
            },
            body: '{"event_id":"evt_123"}',
        }));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ received: true });
        expect(verifyAndParsePaddleWebhookEventMock).toHaveBeenCalledWith(
            '{"event_id":"evt_123"}',
            'ts=123;h1=abc',
            env.paddleNotificationSecretKey,
        );
        expect(buildEntitlementProjectionFromPaddleSubscriptionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'sub_123',
            }),
            'user-1',
            '2026-04-16T00:00:00.000Z',
        );
        expect(upsertBillingAccountMock).toHaveBeenCalledWith({ kind: 'admin-client' }, expect.objectContaining({
            user_id: 'user-1',
            paddle_customer_id: 'ctm_123',
            paddle_subscription_id: 'sub_123',
            paddle_price_id: 'pri_plus',
            subscription_status: 'active',
            last_event_id: 'evt_123',
            last_event_occurred_at: '2026-04-16T00:00:00.000Z',
        }));
        expect(syncResolvedEntitlementMock).toHaveBeenCalledWith({ kind: 'admin-client' }, expect.objectContaining({
            userId: 'user-1',
        }));
    });

    it('treats repeated webhook events as idempotent', async () => {
        verifyAndParsePaddleWebhookEventMock.mockReturnValue({
            event_id: 'evt_123',
            event_type: 'subscription.updated',
            occurred_at: '2026-04-16T00:00:00.000Z',
            data: {
                id: 'sub_123',
                customer_id: 'ctm_123',
                custom_data: {
                    supabaseUserId: 'user-1',
                },
                status: 'active',
                items: [],
                next_billed_at: null,
            },
        });
        getBillingAccountByUserIdMock.mockResolvedValueOnce({
            user_id: 'user-1',
            paddle_customer_id: 'ctm_123',
            last_event_id: 'evt_123',
        });

        const response = await handlePaddleWebhookRequest(createJsonRequest('/api/paddle/webhook', {
            method: 'POST',
            headers: {
                'paddle-signature': 'ts=123;h1=abc',
            },
            body: '{"event_id":"evt_123"}',
        }));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            received: true,
            duplicate: true,
        });
        expect(upsertBillingAccountMock).not.toHaveBeenCalled();
        expect(syncResolvedEntitlementMock).not.toHaveBeenCalled();
    });
});
