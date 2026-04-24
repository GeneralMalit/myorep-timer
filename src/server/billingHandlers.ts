import { getBillingEnvironment } from '@/server/billingEnv';
import {
    authenticateSupabaseUser,
    createSupabaseAdminClient,
    createSupabaseAuthClient,
    getBillingAccountByPaddleCustomerId,
    getBillingAccountByUserId,
    upsertBillingAccount,
} from '@/server/billingData';
import { syncResolvedEntitlement } from '@/server/entitlements';
import {
    buildEntitlementProjectionFromPaddleSubscription,
    buildPaddleHostedCheckoutUrl,
    createPaddleCheckoutTransaction,
    createPaddleCustomer,
    createPaddleCustomerPortalSession,
    type PaddleSubscription,
    type PaddleWebhookEvent,
    verifyAndParsePaddleWebhookEvent,
} from '@/server/paddleBilling';

const jsonResponse = (status: number, body: Record<string, unknown>): Response => {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
        },
    });
};

const getAccessToken = (request: Request): string | null => {
    const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
    if (!header?.startsWith('Bearer ')) {
        return null;
    }

    const token = header.slice('Bearer '.length).trim();
    return token || null;
};

const ensurePaddleCustomerId = async (
    user: { id: string; email: string | null },
): Promise<string> => {
    const env = getBillingEnvironment();
    const adminClient = createSupabaseAdminClient(env);
    const existingAccount = await getBillingAccountByUserId(adminClient, user.id);
    if (existingAccount?.paddle_customer_id) {
        return existingAccount.paddle_customer_id;
    }

    const customer = await createPaddleCustomer(env, user);
    await upsertBillingAccount(adminClient, {
        user_id: user.id,
        paddle_customer_id: customer.id,
    });

    return customer.id;
};

const createAuthenticatedBillingContext = async (request: Request) => {
    const accessToken = getAccessToken(request);
    if (!accessToken) {
        return {
            ok: false as const,
            response: jsonResponse(401, {
                error: 'Sign in first to manage Plus billing.',
            }),
        };
    }

    try {
        const env = getBillingEnvironment();
        const authClient = createSupabaseAuthClient(env);
        const adminClient = createSupabaseAdminClient(env);
        const user = await authenticateSupabaseUser(authClient, accessToken);

        return {
            ok: true as const,
            env,
            adminClient,
            user,
        };
    } catch (error: unknown) {
        return {
            ok: false as const,
            response: jsonResponse(401, {
                error: error instanceof Error ? error.message : 'Invalid Supabase session.',
            }),
        };
    }
};

export const handlePaddleCheckoutRequest = async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed.' });
    }

    const context = await createAuthenticatedBillingContext(request);
    if (!context.ok) {
        return context.response;
    }

    try {
        const paddleCustomerId = await ensurePaddleCustomerId({
            id: context.user.id,
            email: context.user.email ?? null,
        });
        const transaction = await createPaddleCheckoutTransaction(context.env, {
            customerId: paddleCustomerId,
            userId: context.user.id,
        });

        return jsonResponse(200, {
            url: buildPaddleHostedCheckoutUrl(context.env.appUrl, transaction.id),
        });
    } catch (error: unknown) {
        return jsonResponse(500, {
            error: error instanceof Error ? error.message : 'Could not create Paddle checkout session.',
        });
    }
};

export const handlePaddlePortalRequest = async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed.' });
    }

    const context = await createAuthenticatedBillingContext(request);
    if (!context.ok) {
        return context.response;
    }

    try {
        const billingAccount = await getBillingAccountByUserId(context.adminClient, context.user.id);
        const paddleCustomerId = billingAccount?.paddle_customer_id;
        if (!paddleCustomerId) {
            return jsonResponse(400, {
                error: 'No Paddle billing account was found for this user yet.',
            });
        }

        const portalSession = await createPaddleCustomerPortalSession(context.env, paddleCustomerId);
        const portalUrl = portalSession.urls?.general?.overview;
        if (!portalUrl) {
            return jsonResponse(500, {
                error: 'Paddle customer portal did not return a management URL.',
            });
        }

        return jsonResponse(200, { url: portalUrl });
    } catch (error: unknown) {
        return jsonResponse(500, {
            error: error instanceof Error ? error.message : 'Could not create Paddle customer portal session.',
        });
    }
};

const resolveUserIdForPaddleSubscription = async (
    subscription: PaddleSubscription,
    requestEventId: string,
): Promise<{ userId: string; duplicate: boolean }> => {
    const env = getBillingEnvironment();
    const adminClient = createSupabaseAdminClient(env);
    const metadataUserId = typeof subscription.custom_data?.supabaseUserId === 'string'
        ? subscription.custom_data.supabaseUserId
        : null;

    if (metadataUserId) {
        const existingAccount = await getBillingAccountByUserId(adminClient, metadataUserId);
        return {
            userId: metadataUserId,
            duplicate: existingAccount?.last_event_id === requestEventId,
        };
    }

    if (!subscription.customer_id) {
        throw new Error('Paddle subscription is missing a customer id.');
    }

    const billingAccount = await getBillingAccountByPaddleCustomerId(adminClient, subscription.customer_id);
    if (!billingAccount) {
        throw new Error('No billing account mapping exists for this Paddle customer.');
    }

    return {
        userId: billingAccount.user_id,
        duplicate: billingAccount.last_event_id === requestEventId,
    };
};

const syncPaddleSubscriptionProjection = async (
    event: PaddleWebhookEvent<PaddleSubscription>,
): Promise<Response> => {
    const env = getBillingEnvironment();
    const adminClient = createSupabaseAdminClient(env);
    const { userId, duplicate } = await resolveUserIdForPaddleSubscription(event.data, event.event_id);
    if (duplicate) {
        return jsonResponse(200, { received: true, duplicate: true });
    }

    const projection = buildEntitlementProjectionFromPaddleSubscription(event.data, userId, event.occurred_at);
    const updatedAt = new Date().toISOString();

    await upsertBillingAccount(adminClient, {
        user_id: projection.userId,
        paddle_customer_id: projection.paddleCustomerId,
        paddle_subscription_id: projection.paddleSubscriptionId,
        paddle_price_id: projection.paddlePriceId,
        subscription_status: projection.subscriptionStatus,
        current_period_end: projection.currentPeriodEnd,
        last_event_id: event.event_id,
        last_event_occurred_at: projection.occurredAt,
        updated_at: updatedAt,
    });
    await syncResolvedEntitlement(adminClient, {
        userId: projection.userId,
        updatedAt,
    });

    return jsonResponse(200, { received: true });
};

export const handlePaddleWebhookRequest = async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed.' });
    }

    const signature = request.headers.get('paddle-signature') ?? request.headers.get('Paddle-Signature');
    if (!signature) {
        return jsonResponse(400, { error: 'Missing Paddle signature.' });
    }

    try {
        const env = getBillingEnvironment();
        const payload = await request.text();
        const event = verifyAndParsePaddleWebhookEvent(payload, signature, env.paddleNotificationSecretKey);

        if (
            event.event_type === 'subscription.created'
            || event.event_type === 'subscription.updated'
            || event.event_type === 'subscription.activated'
            || event.event_type === 'subscription.trialing'
            || event.event_type === 'subscription.canceled'
            || event.event_type === 'subscription.paused'
            || event.event_type === 'subscription.resumed'
            || event.event_type === 'subscription.past_due'
        ) {
            return syncPaddleSubscriptionProjection(event as PaddleWebhookEvent<PaddleSubscription>);
        }

        return jsonResponse(200, { received: true });
    } catch (error: unknown) {
        return jsonResponse(400, {
            error: error instanceof Error ? error.message : 'Could not process Paddle webhook.',
        });
    }
};
