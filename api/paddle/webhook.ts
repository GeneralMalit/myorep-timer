import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';

interface SupabaseServerEnvironment {
    supabaseUrl: string;
    supabaseAnonKey: string;
    supabaseServiceRoleKey: string;
}

interface BillingEnvironment extends SupabaseServerEnvironment {
    appUrl: string;
    paddleApiKey: string;
    paddleNotificationSecretKey: string;
    paddlePlusPriceId: string;
}

interface BillingAccountRow {
    user_id: string;
    provider: 'paddle';
    paddle_customer_id: string | null;
    paddle_subscription_id: string | null;
    paddle_price_id: string | null;
    subscription_status: string;
    current_period_end: string | null;
    last_event_id: string | null;
    last_event_occurred_at: string | null;
    created_at: string;
    updated_at: string;
}

type PaddleSubscriptionEventAcceptance = 'applied' | 'duplicate' | 'stale';

interface PaddleEntitlementProjection {
    userId: string;
    paddleCustomerId: string | null;
    paddleSubscriptionId: string;
    paddlePriceId: string | null;
    subscriptionStatus: string;
    active: boolean;
    currentPeriodEnd: string | null;
    occurredAt: string | null;
}

interface PaddleSubscription {
    id: string;
    customer_id: string | null;
    status: string;
    next_billed_at: string | null;
    custom_data?: Record<string, unknown> | null;
    items?: Array<{
        price?: {
            id?: string | null;
        } | null;
    }> | null;
}

interface PaddleWebhookEvent<T = unknown> {
    event_id: string;
    event_type: string;
    occurred_at: string;
    data: T;
}

type HeaderValue = string | string[] | number | undefined;

type NodeApiRequest = {
    method?: string;
    url?: string;
    headers?: Record<string, HeaderValue>;
    body?: unknown;
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type NodeApiResponse = {
    statusCode?: number;
    setHeader?: (name: string, value: string) => void;
    end?: (body?: Buffer) => void;
};

type WebHandler = (request: Request) => Promise<Response>;

const jsonResponse = (status: number, body: Record<string, unknown>): Response => {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
        },
    });
};

const readEnv = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
};

const readEnvWithFallback = (names: string[]): string => {
    for (const name of names) {
        const value = process.env[name]?.trim();
        if (value) {
            return value;
        }
    }

    throw new Error(`Missing required environment variable. Expected one of: ${names.join(', ')}`);
};

const getSupabaseServerEnvironment = (): SupabaseServerEnvironment => {
    return {
        supabaseUrl: readEnvWithFallback(['SUPABASE_URL', 'VITE_SUPABASE_URL']),
        supabaseAnonKey: readEnvWithFallback(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY']),
        supabaseServiceRoleKey: readEnv('SUPABASE_SERVICE_ROLE_KEY'),
    };
};

const getBillingEnvironment = (): BillingEnvironment => {
    return {
        appUrl: readEnv('APP_URL'),
        paddleApiKey: readEnv('PADDLE_API_KEY'),
        paddleNotificationSecretKey: readEnv('PADDLE_NOTIFICATION_SECRET_KEY'),
        paddlePlusPriceId: readEnv('PADDLE_PLUS_PRICE_ID'),
        ...getSupabaseServerEnvironment(),
    };
};

const createSupabaseServerClient = (url: string, key: string): SupabaseClient => {
    return createClient(url, key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
};

const createSupabaseAdminClient = (env: SupabaseServerEnvironment): SupabaseClient => {
    return createSupabaseServerClient(env.supabaseUrl, env.supabaseServiceRoleKey);
};

const getBillingAccountByPaddleCustomerId = async (
    adminClient: SupabaseClient,
    paddleCustomerId: string,
): Promise<BillingAccountRow | null> => {
    const { data, error } = await adminClient
        .from('billing_accounts')
        .select('user_id, provider, paddle_customer_id, paddle_subscription_id, paddle_price_id, subscription_status, current_period_end, last_event_id, last_event_occurred_at, created_at, updated_at')
        .eq('paddle_customer_id', paddleCustomerId)
        .maybeSingle<BillingAccountRow>();

    if (error) {
        throw error;
    }

    return data ?? null;
};

const applyPaddleSubscriptionEvent = async (
    adminClient: SupabaseClient,
    event: {
        eventId: string;
        eventType: string;
        occurredAt: string;
        userId: string;
        paddleCustomerId: string | null;
        paddleSubscriptionId: string;
        paddlePriceId: string | null;
        subscriptionStatus: string;
        currentPeriodEnd: string | null;
    },
): Promise<PaddleSubscriptionEventAcceptance> => {
    const { data, error } = await adminClient.rpc('apply_paddle_subscription_event', {
        p_event_id: event.eventId,
        p_event_type: event.eventType,
        p_occurred_at: event.occurredAt,
        p_user_id: event.userId,
        p_paddle_customer_id: event.paddleCustomerId,
        p_paddle_subscription_id: event.paddleSubscriptionId,
        p_paddle_price_id: event.paddlePriceId,
        p_subscription_status: event.subscriptionStatus,
        p_current_period_end: event.currentPeriodEnd,
    });

    if (error) {
        throw error;
    }

    if (data !== 'applied' && data !== 'duplicate' && data !== 'stale') {
        throw new Error('Supabase returned an invalid Paddle event acceptance result.');
    }

    return data;
};

const parsePaddleSignatureHeader = (signatureHeader: string): { timestamp: string; digest: string } => {
    const pairs = signatureHeader
        .split(';')
        .map((part) => part.trim())
        .map((part) => {
            const [key, value] = part.split('=', 2);
            return [key, value] as const;
        });

    const timestamp = pairs.find(([key]) => key === 'ts')?.[1];
    const digest = pairs.find(([key]) => key === 'h1')?.[1];
    if (!timestamp || !digest) {
        throw new Error('Malformed Paddle signature header.');
    }

    return { timestamp, digest };
};

const verifyAndParsePaddleWebhookEvent = (
    rawBody: string,
    signatureHeader: string,
    notificationSecretKey: string,
): PaddleWebhookEvent => {
    const { timestamp, digest } = parsePaddleSignatureHeader(signatureHeader);
    const signedPayload = `${timestamp}:${rawBody}`;
    const computedDigest = createHmac('sha256', notificationSecretKey)
        .update(signedPayload, 'utf8')
        .digest('hex');

    const incomingBuffer = Buffer.from(digest, 'hex');
    const computedBuffer = Buffer.from(computedDigest, 'hex');
    if (
        incomingBuffer.length !== computedBuffer.length
        || !timingSafeEqual(incomingBuffer, computedBuffer)
    ) {
        throw new Error('Invalid Paddle signature.');
    }

    return JSON.parse(rawBody) as PaddleWebhookEvent;
};

const isPaddleSubscriptionActive = (status: string): boolean => {
    return status === 'active' || status === 'trialing';
};

const buildEntitlementProjectionFromPaddleSubscription = (
    subscription: PaddleSubscription,
    userId: string,
    occurredAt: string | null,
): PaddleEntitlementProjection => {
    const firstItem = subscription.items?.[0];
    const priceId = firstItem?.price?.id ?? null;

    return {
        userId,
        paddleCustomerId: subscription.customer_id ?? null,
        paddleSubscriptionId: subscription.id,
        paddlePriceId: priceId,
        subscriptionStatus: subscription.status,
        active: isPaddleSubscriptionActive(subscription.status),
        currentPeriodEnd: subscription.next_billed_at ?? null,
        occurredAt,
    };
};

const resolveUserIdForPaddleSubscription = async (
    subscription: PaddleSubscription,
    adminClient: SupabaseClient,
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

const handlePaddleWebhookRequest = async (request: Request): Promise<Response> => {
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

const readNodeBody = (request: NodeApiRequest): Promise<Buffer | undefined> => {
    if (request.body !== undefined) {
        if (Buffer.isBuffer(request.body)) {
            return Promise.resolve(request.body);
        }

        if (typeof request.body === 'string') {
            return Promise.resolve(Buffer.from(request.body));
        }

        return Promise.resolve(Buffer.from(JSON.stringify(request.body)));
    }

    if (typeof request.on !== 'function') {
        return Promise.resolve(undefined);
    }

    return new Promise<Buffer | undefined>((resolve, reject) => {
        const chunks: Buffer[] = [];

        request.on?.('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        });
        request.on?.('end', () => {
            resolve(chunks.length > 0 ? Buffer.concat(chunks) : undefined);
        });
        request.on?.('error', reject);
    });
};

const createHeaders = (incomingHeaders: NodeApiRequest['headers']): Headers => {
    const headers = new Headers();

    for (const [name, value] of Object.entries(incomingHeaders ?? {})) {
        if (Array.isArray(value)) {
            for (const item of value) {
                headers.append(name, item);
            }
            continue;
        }

        if (value !== undefined) {
            headers.set(name, String(value));
        }
    }

    return headers;
};

const createRequestUrl = (request: NodeApiRequest, headers: Headers): string => {
    if (request.url?.startsWith('http://') || request.url?.startsWith('https://')) {
        return request.url;
    }

    const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? '127.0.0.1';
    const protocol = headers.get('x-forwarded-proto') ?? 'https';
    return `${protocol}://${host}${request.url ?? '/'}`;
};

const toWebRequest = async (request: Request | NodeApiRequest): Promise<Request> => {
    if (request instanceof Request) {
        return request;
    }

    const method = request.method ?? 'GET';
    const headers = createHeaders(request.headers);
    const body = method === 'GET' || method === 'HEAD'
        ? undefined
        : await readNodeBody(request);

    return new Request(createRequestUrl(request, headers), {
        method,
        headers,
        body,
        duplex: body ? 'half' : undefined,
    } as RequestInit & { duplex?: 'half' });
};

const sendNodeResponse = async (
    nodeResponse: NodeApiResponse,
    webResponse: Response,
): Promise<void> => {
    nodeResponse.statusCode = webResponse.status;

    webResponse.headers.forEach((value, name) => {
        nodeResponse.setHeader?.(name, value);
    });

    nodeResponse.end?.(Buffer.from(await webResponse.arrayBuffer()));
};

const withWebHandler = (handler: WebHandler) => {
    return async (
        request: Request | NodeApiRequest,
        response?: NodeApiResponse,
    ): Promise<Response | void> => {
        let webResponse: Response;

        try {
            const webRequest = await toWebRequest(request);
            webResponse = await handler(webRequest);
        } catch (error) {
            webResponse = new Response(JSON.stringify({
                error: error instanceof Error ? error.message : 'Could not process API request.',
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        }

        if (!response) {
            return webResponse;
        }

        await sendNodeResponse(response, webResponse);
    };
};

export const config = { api: { bodyParser: false } };

export default withWebHandler(handlePaddleWebhookRequest);
