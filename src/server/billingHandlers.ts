import { getBillingEnvironment } from './billingEnv.ts';
import {
    applyPaddleSubscriptionEvent,
    authenticateSupabaseUser,
    createSupabaseAdminClient,
    createSupabaseAuthClient,
    getBillingAccountByPaddleCustomerId,
    getBillingAccountByUserId,
    upsertBillingAccount,
} from './billingData.ts';
import {
    buildEntitlementProjectionFromPaddleSubscription,
    buildPaddleHostedCheckoutUrl,
    createPaddleCheckoutTransaction,
    createPaddleCustomer,
    createPaddleCustomerPortalSession,
    type PaddleSubscription,
    type PaddleWebhookEvent,
    verifyAndParsePaddleWebhookEvent,
} from './paddleBilling.ts';

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
    adminClient: ReturnType<typeof createSupabaseAdminClient>,
): Promise<string> => {
    const metadataUserId = typeof subscription.custom_data?.supabaseUserId === 'string'
        ? subscription.custom_data.supabaseUserId
        : null;

    if (metadataUserId) {
        return metadataUserId;
    }

    if (!subscription.customer_id) {
        throw new Error('Paddle subscription is missing a customer id.');
    }

    const billingAccount = await getBillingAccountByPaddleCustomerId(adminClient, subscription.customer_id);
    if (!billingAccount) {
        throw new Error('No billing account mapping exists for this Paddle customer.');
    }

    return billingAccount.user_id;
};

const syncPaddleSubscriptionProjection = async (
    event: PaddleWebhookEvent<PaddleSubscription>,
): Promise<Response> => {
    const env = getBillingEnvironment();
    const adminClient = createSupabaseAdminClient(env);
    const userId = await resolveUserIdForPaddleSubscription(event.data, adminClient);
    const projection = buildEntitlementProjectionFromPaddleSubscription(event.data, userId, event.occurred_at);
    if (!projection.occurredAt) {
        throw new Error('Paddle subscription event is missing occurred_at.');
    }

    const acceptance = await applyPaddleSubscriptionEvent(adminClient, {
        eventId: event.event_id,
        eventType: event.event_type,
        occurredAt: projection.occurredAt,
        userId: projection.userId,
        paddleCustomerId: projection.paddleCustomerId,
        paddleSubscriptionId: projection.paddleSubscriptionId,
        paddlePriceId: projection.paddlePriceId,
        subscriptionStatus: projection.subscriptionStatus,
        currentPeriodEnd: projection.currentPeriodEnd,
    });

    if (acceptance === 'duplicate') {
        return jsonResponse(200, { received: true, duplicate: true });
    }

    if (acceptance === 'stale') {
        return jsonResponse(200, { received: true, stale: true });
    }

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

    const env = getBillingEnvironment();
    const payload = await request.text();
    let event: PaddleWebhookEvent;
    try {
        event = verifyAndParsePaddleWebhookEvent(payload, signature, env.paddleNotificationSecretKey);
    } catch {
        return jsonResponse(400, { error: 'Invalid Paddle webhook.' });
    }

    try {
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
            return await syncPaddleSubscriptionProjection(event as PaddleWebhookEvent<PaddleSubscription>);
        }

        return jsonResponse(200, { received: true });
    } catch {
        return jsonResponse(500, { error: 'Could not process Paddle webhook.' });
    }
};
