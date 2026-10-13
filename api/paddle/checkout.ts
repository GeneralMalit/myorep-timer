import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

interface BillingEnvironment {
    appUrl: string;
    paddleApiKey: string;
    paddleNotificationSecretKey: string;
    paddlePlusPriceId: string;
    supabaseUrl: string;
    supabaseAnonKey: string;
    supabaseServiceRoleKey: string;
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

interface PaddleBillingUser {
    id: string;
    email: string | null;
}

interface PaddleCustomer {
    id: string;
}

interface PaddleTransaction {
    id: string;
}

interface PaddleEnvelope<T> {
    data: T;
}

const PADDLE_API_BASE = 'https://api.paddle.com';

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

const getBillingEnvironment = (): BillingEnvironment => {
    return {
        appUrl: readEnv('APP_URL'),
        paddleApiKey: readEnv('PADDLE_API_KEY'),
        paddleNotificationSecretKey: readEnv('PADDLE_NOTIFICATION_SECRET_KEY'),
        paddlePlusPriceId: readEnv('PADDLE_PLUS_PRICE_ID'),
        supabaseUrl: readEnvWithFallback(['SUPABASE_URL', 'VITE_SUPABASE_URL']),
        supabaseAnonKey: readEnvWithFallback(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY']),
        supabaseServiceRoleKey: readEnv('SUPABASE_SERVICE_ROLE_KEY'),
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

const authenticateSupabaseUser = async (
    client: SupabaseClient,
    accessToken: string,
): Promise<User> => {
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data.user) {
        throw new Error(error?.message ?? 'Invalid Supabase session.');
    }

    return data.user;
};

const getBillingAccountByUserId = async (
    adminClient: SupabaseClient,
    userId: string,
): Promise<BillingAccountRow | null> => {
    const { data, error } = await adminClient
        .from('billing_accounts')
        .select('user_id, provider, paddle_customer_id, paddle_subscription_id, paddle_price_id, subscription_status, current_period_end, last_event_id, last_event_occurred_at, created_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle<BillingAccountRow>();

    if (error) {
        throw error;
    }

    return data ?? null;
};

const upsertBillingAccount = async (
    adminClient: SupabaseClient,
    account: Partial<BillingAccountRow> & {
        user_id: string;
        provider?: 'paddle';
    },
): Promise<void> => {
    const payload = {
        provider: 'paddle' as const,
        subscription_status: 'inactive',
        ...account,
    };

    const { error } = await adminClient
        .from('billing_accounts')
        .upsert(payload, { onConflict: 'user_id' });

    if (error) {
        throw error;
    }
};

const paddleRequest = async <T>(
    env: BillingEnvironment,
    path: string,
    init: RequestInit = {},
): Promise<T> => {
    const response = await fetch(`${PADDLE_API_BASE}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${env.paddleApiKey}`,
            'Content-Type': 'application/json',
            ...init.headers,
        },
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Paddle request failed with status ${response.status}.`);
    }

    const payload = await response.json() as PaddleEnvelope<T>;
    return payload.data;
};

const createPaddleCustomer = async (
    env: BillingEnvironment,
    user: PaddleBillingUser,
): Promise<PaddleCustomer> => {
    return paddleRequest<PaddleCustomer>(env, '/customers', {
        method: 'POST',
        body: JSON.stringify({
            email: user.email ?? undefined,
            custom_data: {
                supabaseUserId: user.id,
            },
        }),
    });
};

const createPaddleCheckoutTransaction = async (
    env: BillingEnvironment,
    params: {
        customerId: string;
        userId: string;
    },
): Promise<PaddleTransaction> => {
    return paddleRequest<PaddleTransaction>(env, '/transactions', {
        method: 'POST',
        body: JSON.stringify({
            items: [
                {
                    price_id: env.paddlePlusPriceId,
                    quantity: 1,
                },
            ],
            customer_id: params.customerId,
            collection_mode: 'automatic',
            custom_data: {
                supabaseUserId: params.userId,
            },
        }),
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
    const adminClient = createSupabaseServerClient(env.supabaseUrl, env.supabaseServiceRoleKey);
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
        const authClient = createSupabaseServerClient(env.supabaseUrl, env.supabaseAnonKey);
        const adminClient = createSupabaseServerClient(env.supabaseUrl, env.supabaseServiceRoleKey);
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

const handlePaddleCheckoutRequest = async (request: Request): Promise<Response> => {
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
        const checkoutUrl = new URL(context.env.appUrl);
        checkoutUrl.searchParams.set('_ptxn', transaction.id);

        return jsonResponse(200, { url: checkoutUrl.toString() });
    } catch (error: unknown) {
        return jsonResponse(500, {
            error: error instanceof Error ? error.message : 'Could not create Paddle checkout session.',
        });
    }
};

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

const isWebRequest = (request: unknown): request is Request => {
    return typeof Request !== 'undefined' && request instanceof Request;
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

const toWebRequest = (request: Request | NodeApiRequest): Request => {
    if (isWebRequest(request)) {
        return request;
    }

    const headers = createHeaders(request.headers);
    const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? '127.0.0.1';
    const protocol = headers.get('x-forwarded-proto') ?? 'https';
    const url = request.url?.startsWith('http://') || request.url?.startsWith('https://')
        ? request.url
        : `${protocol}://${host}${request.url ?? '/'}`;

    return new Request(url, {
        method: request.method ?? 'GET',
        headers,
    });
};

const sendNodeResponse = async (
    response: NodeApiResponse,
    webResponse: Response,
): Promise<void> => {
    response.statusCode = webResponse.status;
    webResponse.headers.forEach((value, name) => {
        response.setHeader?.(name, value);
    });
    response.end?.(Buffer.from(await webResponse.arrayBuffer()));
};

export default async function handler(
    request: Request | NodeApiRequest,
    response?: NodeApiResponse,
): Promise<Response | void> {
    const webResponse = await handlePaddleCheckoutRequest(toWebRequest(request));

    if (!response) {
        return webResponse;
    }

    await sendNodeResponse(response, webResponse);
}
