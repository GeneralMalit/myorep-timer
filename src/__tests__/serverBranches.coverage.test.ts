import { createHmac } from 'node:crypto';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    deriveUsernameFromEmail,
    isValidUsername,
    normalizeUsername,
} from '@/lib/accountIdentity';
import {
    AccountProvisionError,
    applyPaddleSubscriptionEvent,
    authenticateSupabaseUser,
    createSupabaseAdminClient,
    createSupabaseAuthClient,
    getBillingAccountByPaddleCustomerId,
    getBillingAccountByUserId,
    getSupabasePasswordSignUpAvailability,
    getSupabaseProfileByUserId,
    refreshResolvedEntitlement,
    updateSupabaseUsername,
    upsertBillingAccount,
    upsertSupabaseProfile,
    type BillingAccountRow,
    type EntitlementOverrideRow,
} from '@/server/billingData';
import {
    getBillingEnvironment,
    getSupabaseServerEnvironment,
    type BillingEnvironment,
} from '@/server/billingEnv';
import {
    buildResolvedEntitlement,
    getEntitlementOverrideByUserId,
    syncResolvedEntitlement,
} from '@/server/entitlements';
import {
    buildEntitlementProjectionFromPaddleSubscription,
    buildPaddleHostedCheckoutUrl,
    buildPaddleReturnUrl,
    createPaddleCheckoutTransaction,
    createPaddleCustomer,
    createPaddleCustomerPortalSession,
    isPaddleSubscriptionActive,
    verifyAndParsePaddleWebhookEvent,
    type PaddleSubscription,
} from '@/server/paddleBilling';

const env: BillingEnvironment = {
    appUrl: 'https://myorep.example/account?keep=1',
    paddleApiKey: 'pdl_test_key',
    paddleNotificationSecretKey: 'pdl_notification_secret',
    paddlePlusPriceId: 'pri_plus',
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon-key',
    supabaseServiceRoleKey: 'service-role-key',
};

const asClient = (value: unknown): SupabaseClient => value as SupabaseClient;

const createSelectMaybeSingleClient = (data: unknown, error: unknown = null) => {
    const maybeSingle = vi.fn().mockResolvedValue({ data, error });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    return {
        client: asClient({ from }),
        from,
        select,
        eq,
        maybeSingle,
    };
};

const billingAccount = (overrides: Partial<BillingAccountRow> = {}): BillingAccountRow => ({
    user_id: 'user-1',
    provider: 'paddle',
    paddle_customer_id: 'ctm_1',
    paddle_subscription_id: 'sub_1',
    paddle_price_id: 'pri_plus',
    subscription_status: 'active',
    current_period_end: '2026-09-01T00:00:00.000Z',
    last_event_id: 'evt_1',
    last_event_occurred_at: '2026-08-01T00:00:00.000Z',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
});

const entitlementOverride = (
    overrides: Partial<EntitlementOverrideRow> = {},
): EntitlementOverrideRow => ({
    user_id: 'user-1',
    plan: 'plus',
    cloud_sync_enabled: true,
    reason: 'support',
    granted_by_email: 'admin@example.com',
    expires_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
});

beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('account identity branch coverage', () => {
    it('normalizes punctuation, repeated separators, case, and maximum length', () => {
        expect(normalizeUsername('  __Myo...REP++ Athlete__  ')).toBe('myo_rep_athlete');
        expect(normalizeUsername('A'.repeat(30))).toBe('a'.repeat(24));
        expect(normalizeUsername('___')).toBe('');
    });

    it('validates trimmed canonical usernames and rejects invalid forms', () => {
        expect(isValidUsername(' athlete_1 ')).toBe(true);
        expect(isValidUsername('ab')).toBe(false);
        expect(isValidUsername('Uppercase')).toBe(false);
        expect(isValidUsername('a'.repeat(25))).toBe(false);
    });

    it('derives a normalized local part and falls back for missing or short values', () => {
        expect(deriveUsernameFromEmail('Myo.Rep+Coach@example.com')).toBe('myo_rep_coach');
        expect(deriveUsernameFromEmail('ab@example.com')).toBe('athlete');
        expect(deriveUsernameFromEmail(null)).toBe('athlete');
        expect(deriveUsernameFromEmail(undefined)).toBe('athlete');
    });
});

describe('billing environment branch coverage', () => {
    it('reads and trims the primary server environment variables', () => {
        vi.stubEnv('SUPABASE_URL', ' https://primary.supabase.co ');
        vi.stubEnv('VITE_SUPABASE_URL', 'https://fallback.supabase.co');
        vi.stubEnv('SUPABASE_ANON_KEY', ' anon-primary ');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-fallback');
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', ' service-role ');
        vi.stubEnv('APP_URL', ' https://myorep.example ');
        vi.stubEnv('PADDLE_API_KEY', ' paddle-api ');
        vi.stubEnv('PADDLE_NOTIFICATION_SECRET_KEY', ' notification-secret ');
        vi.stubEnv('PADDLE_PLUS_PRICE_ID', ' price-id ');

        expect(getSupabaseServerEnvironment()).toEqual({
            supabaseUrl: 'https://primary.supabase.co',
            supabaseAnonKey: 'anon-primary',
            supabaseServiceRoleKey: 'service-role',
        });
        expect(getBillingEnvironment()).toEqual({
            appUrl: 'https://myorep.example',
            paddleApiKey: 'paddle-api',
            paddleNotificationSecretKey: 'notification-secret',
            paddlePlusPriceId: 'price-id',
            supabaseUrl: 'https://primary.supabase.co',
            supabaseAnonKey: 'anon-primary',
            supabaseServiceRoleKey: 'service-role',
        });
    });

    it('uses Vite fallbacks when the primary public variables are blank', () => {
        vi.stubEnv('SUPABASE_URL', '   ');
        vi.stubEnv('VITE_SUPABASE_URL', ' https://vite.supabase.co ');
        vi.stubEnv('SUPABASE_ANON_KEY', '');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', ' vite-anon ');
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');

        expect(getSupabaseServerEnvironment()).toMatchObject({
            supabaseUrl: 'https://vite.supabase.co',
            supabaseAnonKey: 'vite-anon',
        });
    });

    it('reports missing private and public environment values', () => {
        vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
        vi.stubEnv('SUPABASE_ANON_KEY', 'anon');
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

        expect(() => getSupabaseServerEnvironment()).toThrow(
            'Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY',
        );

        vi.stubEnv('SUPABASE_URL', '');
        vi.stubEnv('VITE_SUPABASE_URL', '');
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');

        expect(() => getSupabaseServerEnvironment()).toThrow(
            'Expected one of: SUPABASE_URL, VITE_SUPABASE_URL',
        );
    });
});

describe('Paddle billing adapters and projections', () => {
    it('builds hosted checkout and each return URL without retaining transaction state', () => {
        expect(buildPaddleHostedCheckoutUrl(env.appUrl, 'txn_123')).toBe(
            'https://myorep.example/account?keep=1&_ptxn=txn_123',
        );

        for (const status of ['success', 'cancel', 'portal'] as const) {
            const returnUrl = buildPaddleReturnUrl(
                `https://myorep.example/account?keep=1&_ptxn=old#billing`,
                status,
            );
            const parsed = new URL(returnUrl);
            expect(parsed.searchParams.get('_ptxn')).toBeNull();
            expect(parsed.searchParams.get('billing')).toBe(status);
            expect(parsed.hash).toBe('#billing');
        }
    });

    it('creates customers, checkout transactions, and portal sessions through Paddle', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'ctm_1' } }), {
                status: 200,
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'ctm_2' } }), {
                status: 200,
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'txn_1' } }), {
                status: 200,
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                data: {
                    urls: { general: { overview: 'https://vendors.paddle.com/portal/1' } },
                },
            }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(createPaddleCustomer(env, {
            id: 'user-1',
            email: 'ATHLETE@example.com',
        })).resolves.toEqual({ id: 'ctm_1' });
        await expect(createPaddleCustomer(env, {
            id: 'user-2',
            email: null,
        })).resolves.toEqual({ id: 'ctm_2' });
        await expect(createPaddleCheckoutTransaction(env, {
            customerId: 'ctm_1',
            userId: 'user-1',
        })).resolves.toEqual({ id: 'txn_1' });
        await expect(createPaddleCustomerPortalSession(env, 'ctm/with slash')).resolves.toEqual({
            urls: { general: { overview: 'https://vendors.paddle.com/portal/1' } },
        });

        expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.paddle.com/customers', {
            method: 'POST',
            body: JSON.stringify({
                email: 'ATHLETE@example.com',
                custom_data: { supabaseUserId: 'user-1' },
            }),
            headers: {
                Authorization: 'Bearer pdl_test_key',
                'Content-Type': 'application/json',
            },
        });
        expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)).toEqual({
            custom_data: { supabaseUserId: 'user-2' },
        });
        expect(JSON.parse(fetchMock.mock.calls[2]![1]!.body as string)).toEqual({
            items: [{ price_id: 'pri_plus', quantity: 1 }],
            customer_id: 'ctm_1',
            collection_mode: 'automatic',
            custom_data: { supabaseUserId: 'user-1' },
        });
        expect(fetchMock.mock.calls[3]![0]).toBe(
            'https://api.paddle.com/customers/ctm/with slash/portal-sessions',
        );
    });

    it('surfaces Paddle response text and falls back to status when the body is empty', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('Paddle says no', { status: 422 }))
            .mockResolvedValueOnce(new Response('', { status: 503 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(createPaddleCustomer(env, {
            id: 'user-1',
            email: null,
        })).rejects.toThrow('Paddle says no');
        await expect(createPaddleCustomerPortalSession(env, 'ctm_1')).rejects.toThrow(
            'Paddle request failed with status 503.',
        );
    });

    it('verifies a valid signature with whitespace and parses the event', () => {
        const rawBody = JSON.stringify({
            event_id: 'evt_1',
            event_type: 'subscription.active',
            occurred_at: '2026-08-05T00:00:00.000Z',
            data: { id: 'sub_1' },
        });
        const timestamp = '1777777777';
        const digest = createHmac('sha256', env.paddleNotificationSecretKey)
            .update(`${timestamp}:${rawBody}`, 'utf8')
            .digest('hex');

        expect(verifyAndParsePaddleWebhookEvent(
            rawBody,
            ` ignored=value ; h1=${digest} ; ts=${timestamp} `,
            env.paddleNotificationSecretKey,
        )).toMatchObject({
            event_id: 'evt_1',
            data: { id: 'sub_1' },
        });
    });

    it('rejects malformed, truncated, and incorrect Paddle signatures', () => {
        expect(() => verifyAndParsePaddleWebhookEvent('{}', 'h1=abc', 'secret')).toThrow(
            'Malformed Paddle signature header.',
        );
        expect(() => verifyAndParsePaddleWebhookEvent('{}', 'ts=123', 'secret')).toThrow(
            'Malformed Paddle signature header.',
        );
        expect(() => verifyAndParsePaddleWebhookEvent('{}', 'ts=123;h1=zz', 'secret')).toThrow(
            'Invalid Paddle signature.',
        );
        expect(() => verifyAndParsePaddleWebhookEvent(
            '{}',
            `ts=123;h1=${'0'.repeat(64)}`,
            'secret',
        )).toThrow('Invalid Paddle signature.');
    });

    it('lets JSON parsing reject a correctly signed malformed event body', () => {
        const rawBody = '{not-json';
        const timestamp = '123';
        const digest = createHmac('sha256', 'secret')
            .update(`${timestamp}:${rawBody}`, 'utf8')
            .digest('hex');

        expect(() => verifyAndParsePaddleWebhookEvent(
            rawBody,
            `ts=${timestamp};h1=${digest}`,
            'secret',
        )).toThrow(SyntaxError);
    });

    it('recognizes only Paddle active and trialing subscription statuses', () => {
        expect(isPaddleSubscriptionActive('active')).toBe(true);
        expect(isPaddleSubscriptionActive('trialing')).toBe(true);
        expect(isPaddleSubscriptionActive('paused')).toBe(false);
        expect(isPaddleSubscriptionActive('ACTIVE')).toBe(false);
    });

    it('projects full and sparse Paddle subscriptions with safe fallbacks', () => {
        const full: PaddleSubscription = {
            id: 'sub_1',
            customer_id: 'ctm_1',
            status: 'trialing',
            next_billed_at: '2026-09-01T00:00:00.000Z',
            items: [{ price: { id: 'pri_plus' } }],
        };
        expect(buildEntitlementProjectionFromPaddleSubscription(
            full,
            'user-1',
            '2026-08-05T00:00:00.000Z',
        )).toEqual({
            userId: 'user-1',
            paddleCustomerId: 'ctm_1',
            paddleSubscriptionId: 'sub_1',
            paddlePriceId: 'pri_plus',
            subscriptionStatus: 'trialing',
            active: true,
            currentPeriodEnd: '2026-09-01T00:00:00.000Z',
            occurredAt: '2026-08-05T00:00:00.000Z',
        });

        for (const items of [undefined, null, [], [{ price: null }], [{ price: { id: null } }]]) {
            const projection = buildEntitlementProjectionFromPaddleSubscription({
                id: 'sub_sparse',
                customer_id: null,
                status: 'canceled',
                next_billed_at: null,
                items,
            }, 'user-2', null);
            expect(projection).toMatchObject({
                paddleCustomerId: null,
                paddlePriceId: null,
                active: false,
                currentPeriodEnd: null,
                occurredAt: null,
            });
        }
    });
});

describe('Supabase billing data adapters', () => {
    it('constructs stateless auth and admin clients from the intended keys', () => {
        const authClient = createSupabaseAuthClient(env);
        const adminClient = createSupabaseAdminClient(env);

        expect(authClient.supabaseUrl).toBe(env.supabaseUrl);
        expect(adminClient.supabaseUrl).toBe(env.supabaseUrl);
        expect(authClient).not.toBe(adminClient);
    });

    it('authenticates a Supabase user and reports error and empty-user responses', async () => {
        const user = { id: 'user-1' } as User;
        const getUser = vi.fn()
            .mockResolvedValueOnce({ data: { user }, error: null })
            .mockResolvedValueOnce({ data: { user: null }, error: { message: 'expired token' } })
            .mockResolvedValueOnce({ data: { user: null }, error: null });
        const client = asClient({ auth: { getUser } });

        await expect(authenticateSupabaseUser(client, 'valid')).resolves.toBe(user);
        await expect(authenticateSupabaseUser(client, 'expired')).rejects.toThrow('expired token');
        await expect(authenticateSupabaseUser(client, 'empty')).rejects.toThrow(
            'Invalid Supabase session.',
        );
    });

    it('loads profiles, returns null, and propagates profile query failures', async () => {
        const profile = { id: 'user-1', username: 'athlete' };
        const success = createSelectMaybeSingleClient(profile);
        await expect(getSupabaseProfileByUserId(success.client, 'user-1')).resolves.toBe(profile);
        expect(success.from).toHaveBeenCalledWith('profiles');
        expect(success.eq).toHaveBeenCalledWith('id', 'user-1');

        const missing = createSelectMaybeSingleClient(undefined);
        await expect(getSupabaseProfileByUserId(missing.client, 'user-2')).resolves.toBeNull();

        const failure = createSelectMaybeSingleClient(null, new Error('profile query failed'));
        await expect(getSupabaseProfileByUserId(failure.client, 'user-3')).rejects.toThrow(
            'profile query failed',
        );
    });

    it('upserts profiles and propagates Supabase errors', async () => {
        const savedProfile = { id: 'user-1', username: 'new_name' };
        const single = vi.fn()
            .mockResolvedValueOnce({ data: savedProfile, error: null })
            .mockResolvedValueOnce({ data: null, error: new Error('profile upsert failed') });
        const select = vi.fn().mockReturnValue({ single });
        const upsert = vi.fn().mockReturnValue({ select });
        const client = asClient({ from: vi.fn().mockReturnValue({ upsert }) });

        await expect(upsertSupabaseProfile(client, {
            userId: 'user-1',
            email: null,
            username: 'new_name',
        })).resolves.toBe(savedProfile);
        await expect(upsertSupabaseProfile(client, {
            userId: 'user-2',
            email: 'two@example.com',
            username: 'user_two',
        })).rejects.toThrow('profile upsert failed');
        expect(upsert).toHaveBeenNthCalledWith(1, {
            id: 'user-1',
            email: null,
            username: 'new_name',
            display_name: 'new_name',
        }, { onConflict: 'id' });
    });

    it.each(['available', 'email_taken', 'username_taken'] as const)(
        'accepts the %s password-signup RPC result',
        async (availability) => {
            const rpc = vi.fn().mockResolvedValue({ data: availability, error: null });
            const result = await getSupabasePasswordSignUpAvailability(asClient({ rpc }), {
                username: 'athlete_one',
                email: ' ATHLETE@EXAMPLE.COM ',
            });

            expect(result).toBe(availability);
            expect(rpc).toHaveBeenCalledWith('get_password_signup_availability', {
                p_email: 'athlete@example.com',
                p_username: 'athlete_one',
            });
        },
    );

    it('rejects failed and malformed password-signup availability RPC results', async () => {
        const rpc = vi.fn()
            .mockResolvedValueOnce({ data: null, error: new Error('rpc unavailable') })
            .mockResolvedValueOnce({ data: 'maybe', error: null });
        const client = asClient({ rpc });

        await expect(getSupabasePasswordSignUpAvailability(client, {
            username: 'athlete',
            email: 'athlete@example.com',
        })).rejects.toThrow('rpc unavailable');
        await expect(getSupabasePasswordSignUpAvailability(client, {
            username: 'athlete',
            email: 'athlete@example.com',
        })).rejects.toThrow('invalid sign-up availability result');
    });

    it('accepts a complete entitlement refresh and rejects every malformed shape', async () => {
        const valid = {
            user_id: 'user-1',
            plan: 'plus',
            cloud_sync_enabled: true,
            updated_at: '2026-08-05T00:00:00.000Z',
        };
        const malformed = [
            null,
            { ...valid, user_id: 'other-user' },
            { ...valid, plan: 'enterprise' },
            { ...valid, cloud_sync_enabled: 'yes' },
            { ...valid, updated_at: 123 },
        ];
        const rpc = vi.fn()
            .mockResolvedValueOnce({ data: valid, error: null })
            .mockResolvedValueOnce({ data: null, error: new Error('refresh failed') });
        for (const value of malformed) {
            rpc.mockResolvedValueOnce({ data: value, error: null });
        }
        const client = asClient({ rpc });

        await expect(refreshResolvedEntitlement(client, 'user-1')).resolves.toEqual(valid);
        await expect(refreshResolvedEntitlement(client, 'user-1')).rejects.toThrow('refresh failed');
        for (const _value of malformed) {
            await expect(refreshResolvedEntitlement(client, 'user-1')).rejects.toThrow(
                'invalid entitlement refresh result',
            );
        }
    });

    const createUsernameUpdateClient = (options: {
        existing?: { id: string } | null;
        profile?: { email: string | null } | null;
        authUser?: Partial<User> | null;
        authError?: unknown;
        findError?: unknown;
    }) => {
        const findMaybeSingle = vi.fn().mockResolvedValue({
            data: options.existing ?? null,
            error: options.findError ?? null,
        });
        const profileMaybeSingle = vi.fn().mockResolvedValue({
            data: options.profile ?? null,
            error: null,
        });
        const saved = { id: 'user-1', username: 'updated_name' };
        const single = vi.fn().mockResolvedValue({ data: saved, error: null });
        const upsert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({ single }),
        });
        const from = vi.fn()
            .mockReturnValueOnce({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({ maybeSingle: findMaybeSingle }),
                }),
            })
            .mockReturnValueOnce({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({ maybeSingle: profileMaybeSingle }),
                }),
            })
            .mockReturnValueOnce({ upsert });
        const getUserById = vi.fn().mockResolvedValue({
            data: { user: options.authUser ?? null },
            error: options.authError ?? null,
        });

        return {
            client: asClient({ from, auth: { admin: { getUserById } } }),
            from,
            upsert,
            getUserById,
        };
    };

    it('rejects a username owned by another user with a typed provision error', async () => {
        const { client, getUserById } = createUsernameUpdateClient({
            existing: { id: 'user-2' },
        });

        await expect(updateSupabaseUsername(client, {
            userId: 'user-1',
            username: 'claimed_name',
        })).rejects.toMatchObject({
            name: 'AccountProvisionError',
            code: 'username_taken',
            message: 'That username is already taken.',
        });
        expect(getUserById).not.toHaveBeenCalled();
        expect(new AccountProvisionError('code', 'message')).toMatchObject({
            name: 'AccountProvisionError',
            code: 'code',
        });
    });

    it.each([
        {
            label: 'profile email',
            existing: { id: 'user-1' },
            profile: { email: 'profile@example.com' },
            authUser: { id: 'user-1', email: 'auth@example.com' },
            expectedEmail: 'profile@example.com',
        },
        {
            label: 'auth email',
            existing: null,
            profile: null,
            authUser: { id: 'user-1', email: 'auth@example.com' },
            expectedEmail: 'auth@example.com',
        },
        {
            label: 'null fallback',
            existing: null,
            profile: { email: null },
            authUser: { id: 'user-1' },
            expectedEmail: null,
        },
    ])('updates a username using the $label', async ({
        existing,
        profile,
        authUser,
        expectedEmail,
    }) => {
        const { client, upsert } = createUsernameUpdateClient({ existing, profile, authUser });

        await expect(updateSupabaseUsername(client, {
            userId: 'user-1',
            username: 'updated_name',
        })).resolves.toMatchObject({ username: 'updated_name' });
        expect(upsert).toHaveBeenCalledWith({
            id: 'user-1',
            email: expectedEmail,
            username: 'updated_name',
            display_name: 'updated_name',
        }, { onConflict: 'id' });
    });

    it('propagates username lookup and auth-user lookup failures', async () => {
        const findFailure = createUsernameUpdateClient({
            findError: new Error('username lookup failed'),
        });
        await expect(updateSupabaseUsername(findFailure.client, {
            userId: 'user-1',
            username: 'updated_name',
        })).rejects.toThrow('username lookup failed');

        const authFailure = createUsernameUpdateClient({
            authError: new Error('auth lookup failed'),
        });
        await expect(updateSupabaseUsername(authFailure.client, {
            userId: 'user-1',
            username: 'updated_name',
        })).rejects.toThrow('auth lookup failed');

        const missingAuthUser = createUsernameUpdateClient({ authUser: null });
        await expect(updateSupabaseUsername(missingAuthUser.client, {
            userId: 'user-1',
            username: 'updated_name',
        })).rejects.toThrow('Could not load the Supabase user.');
    });

    it('loads billing mappings by user and Paddle customer with null and error handling', async () => {
        for (const [loader, value] of [
            [getBillingAccountByUserId, 'user-1'],
            [getBillingAccountByPaddleCustomerId, 'ctm_1'],
        ] as const) {
            const account = billingAccount();
            const success = createSelectMaybeSingleClient(account);
            await expect(loader(success.client, value)).resolves.toEqual(account);

            const missing = createSelectMaybeSingleClient(undefined);
            await expect(loader(missing.client, value)).resolves.toBeNull();

            const failure = createSelectMaybeSingleClient(null, new Error('billing lookup failed'));
            await expect(loader(failure.client, value)).rejects.toThrow('billing lookup failed');
        }
    });

    it('upserts default and explicit billing state and propagates database errors', async () => {
        const upsert = vi.fn()
            .mockResolvedValueOnce({ error: null })
            .mockResolvedValueOnce({ error: null })
            .mockResolvedValueOnce({ error: new Error('billing upsert failed') });
        const client = asClient({ from: vi.fn().mockReturnValue({ upsert }) });

        await expect(upsertBillingAccount(client, { user_id: 'user-1' })).resolves.toBeUndefined();
        await expect(upsertBillingAccount(client, {
            user_id: 'user-2',
            provider: 'paddle',
            subscription_status: 'active',
        })).resolves.toBeUndefined();
        await expect(upsertBillingAccount(client, { user_id: 'user-3' })).rejects.toThrow(
            'billing upsert failed',
        );
        expect(upsert).toHaveBeenNthCalledWith(1, {
            provider: 'paddle',
            subscription_status: 'inactive',
            user_id: 'user-1',
        }, { onConflict: 'user_id' });
        expect(upsert).toHaveBeenNthCalledWith(2, {
            provider: 'paddle',
            subscription_status: 'active',
            user_id: 'user-2',
        }, { onConflict: 'user_id' });
    });

    it.each(['applied', 'duplicate', 'stale'] as const)(
        'accepts the %s Paddle event RPC result',
        async (acceptance) => {
            const rpc = vi.fn().mockResolvedValue({ data: acceptance, error: null });
            const result = await applyPaddleSubscriptionEvent(asClient({ rpc }), {
                eventId: 'evt_1',
                eventType: 'subscription.updated',
                occurredAt: '2026-08-05T00:00:00.000Z',
                userId: 'user-1',
                paddleCustomerId: null,
                paddleSubscriptionId: 'sub_1',
                paddlePriceId: null,
                subscriptionStatus: 'paused',
                currentPeriodEnd: null,
            });

            expect(result).toBe(acceptance);
            expect(rpc).toHaveBeenCalledWith('apply_paddle_subscription_event', {
                p_event_id: 'evt_1',
                p_event_type: 'subscription.updated',
                p_occurred_at: '2026-08-05T00:00:00.000Z',
                p_user_id: 'user-1',
                p_paddle_customer_id: null,
                p_paddle_subscription_id: 'sub_1',
                p_paddle_price_id: null,
                p_subscription_status: 'paused',
                p_current_period_end: null,
            });
        },
    );

    it('rejects failed and malformed Paddle event RPC results', async () => {
        const rpc = vi.fn()
            .mockResolvedValueOnce({ data: null, error: new Error('event apply failed') })
            .mockResolvedValueOnce({ data: 'ignored', error: null });
        const client = asClient({ rpc });
        const event = {
            eventId: 'evt_1',
            eventType: 'subscription.updated',
            occurredAt: '2026-08-05T00:00:00.000Z',
            userId: 'user-1',
            paddleCustomerId: 'ctm_1',
            paddleSubscriptionId: 'sub_1',
            paddlePriceId: 'pri_1',
            subscriptionStatus: 'active',
            currentPeriodEnd: null,
        };

        await expect(applyPaddleSubscriptionEvent(client, event)).rejects.toThrow(
            'event apply failed',
        );
        await expect(applyPaddleSubscriptionEvent(client, event)).rejects.toThrow(
            'invalid Paddle event acceptance result',
        );
    });
});

describe('resolved entitlement persistence', () => {
    const now = new Date('2026-08-05T12:00:00.000Z');

    it('uses permanent and future overrides while ignoring expired or invalid expirations', () => {
        expect(buildResolvedEntitlement({
            userId: 'user-1',
            override: entitlementOverride({ plan: 'free', cloud_sync_enabled: false }),
            billingAccount: billingAccount(),
            now,
            updatedAt: 'explicit-update',
        })).toEqual({
            user_id: 'user-1',
            plan: 'free',
            cloud_sync_enabled: false,
            updated_at: 'explicit-update',
        });

        expect(buildResolvedEntitlement({
            userId: 'user-1',
            override: entitlementOverride({ expires_at: '2026-08-05T12:00:01.000Z' }),
            now,
        })).toMatchObject({ plan: 'plus', cloud_sync_enabled: true });

        for (const expiresAt of ['2026-08-05T12:00:00.000Z', 'not-a-date']) {
            expect(buildResolvedEntitlement({
                userId: 'user-1',
                override: entitlementOverride({ expires_at: expiresAt }),
                billingAccount: billingAccount({ subscription_status: 'paused' }),
                now,
            })).toEqual({
                user_id: 'user-1',
                plan: 'free',
                cloud_sync_enabled: false,
                updated_at: now.toISOString(),
            });
        }
    });

    it('resolves active, trialing, inactive, and missing billing accounts', () => {
        expect(buildResolvedEntitlement({
            userId: 'user-1',
            billingAccount: billingAccount({ subscription_status: 'active' }),
            now,
        }).plan).toBe('plus');
        expect(buildResolvedEntitlement({
            userId: 'user-1',
            billingAccount: billingAccount({ subscription_status: 'trialing' }),
            now,
        }).cloud_sync_enabled).toBe(true);
        expect(buildResolvedEntitlement({
            userId: 'user-1',
            billingAccount: billingAccount({ subscription_status: 'canceled' }),
            now,
        }).plan).toBe('free');
        expect(buildResolvedEntitlement({ userId: 'user-1', now }).plan).toBe('free');
    });

    it('loads entitlement overrides with null and error handling', async () => {
        const row = entitlementOverride();
        const success = createSelectMaybeSingleClient(row);
        await expect(getEntitlementOverrideByUserId(success.client, 'user-1')).resolves.toEqual(row);

        const missing = createSelectMaybeSingleClient(undefined);
        await expect(getEntitlementOverrideByUserId(missing.client, 'user-2')).resolves.toBeNull();

        const failure = createSelectMaybeSingleClient(null, new Error('override lookup failed'));
        await expect(getEntitlementOverrideByUserId(failure.client, 'user-3')).rejects.toThrow(
            'override lookup failed',
        );
    });

    it('loads omitted dependencies and persists the resolved entitlement', async () => {
        const account = billingAccount();
        const override = entitlementOverride({
            plan: 'free',
            cloud_sync_enabled: false,
        });
        const billingMaybeSingle = vi.fn().mockResolvedValue({ data: account, error: null });
        const overrideMaybeSingle = vi.fn().mockResolvedValue({ data: override, error: null });
        const upsert = vi.fn().mockResolvedValue({ error: null });
        const from = vi.fn((table: string) => {
            if (table === 'billing_accounts') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({ maybeSingle: billingMaybeSingle }),
                    }),
                };
            }
            if (table === 'entitlement_overrides') {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({ maybeSingle: overrideMaybeSingle }),
                    }),
                };
            }
            return { upsert };
        });

        const result = await syncResolvedEntitlement(asClient({ from }), {
            userId: 'user-1',
            now,
        });

        expect(result).toMatchObject({
            user_id: 'user-1',
            plan: 'free',
            cloud_sync_enabled: false,
        });
        expect(from).toHaveBeenCalledWith('billing_accounts');
        expect(from).toHaveBeenCalledWith('entitlement_overrides');
        expect(upsert).toHaveBeenCalledWith(result, { onConflict: 'user_id' });
    });

    it('uses supplied dependencies, preserves updatedAt, and propagates upsert failure', async () => {
        const upsert = vi.fn()
            .mockResolvedValueOnce({ error: null })
            .mockResolvedValueOnce({ error: new Error('entitlement upsert failed') });
        const from = vi.fn().mockReturnValue({ upsert });
        const client = asClient({ from });

        await expect(syncResolvedEntitlement(client, {
            userId: 'user-1',
            billingAccount: null,
            override: null,
            updatedAt: 'database-time',
        })).resolves.toEqual({
            user_id: 'user-1',
            plan: 'free',
            cloud_sync_enabled: false,
            updated_at: 'database-time',
        });
        await expect(syncResolvedEntitlement(client, {
            userId: 'user-1',
            billingAccount: billingAccount(),
            override: null,
        })).rejects.toThrow('entitlement upsert failed');
        expect(from).toHaveBeenCalledTimes(2);
        expect(from).toHaveBeenNthCalledWith(1, 'entitlements');
        expect(from).toHaveBeenNthCalledWith(2, 'entitlements');
    });
});
