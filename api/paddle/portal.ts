import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

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

interface PaddlePortalSession {
    urls?: {
        general?: {
            overview?: string;
        };
    };
}

const PADDLE_API_BASE = 'https://api.paddle.com';

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

    const payload = await response.json() as { data: T };
    return payload.data;
};

const getAccessToken = (request: Request): string | null => {
    const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
    if (!header?.startsWith('Bearer ')) {
        return null;
    }

    const token = header.slice('Bearer '.length).trim();
    return token || null;
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
        const env: BillingEnvironment = {
            appUrl: readEnv('APP_URL'),
            paddleApiKey: readEnv('PADDLE_API_KEY'),
            paddleNotificationSecretKey: readEnv('PADDLE_NOTIFICATION_SECRET_KEY'),
            paddlePlusPriceId: readEnv('PADDLE_PLUS_PRICE_ID'),
            supabaseUrl: readEnvWithFallback(['SUPABASE_URL', 'VITE_SUPABASE_URL']),
            supabaseAnonKey: readEnvWithFallback(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY']),
            supabaseServiceRoleKey: readEnv('SUPABASE_SERVICE_ROLE_KEY'),
        };
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
        const on = request.on;
        if (typeof on !== 'function') {
            resolve(undefined);
            return;
        }

        on('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        });
        on('end', () => {
            resolve(chunks.length > 0 ? Buffer.concat(chunks) : undefined);
        });
        on('error', reject);
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

const withWebHandler = (handler: (request: Request) => Promise<Response>) => {
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

const handlePaddlePortalRequest = async (request: Request): Promise<Response> => {
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

        const portalSession = await paddleRequest<PaddlePortalSession>(
            context.env,
            `/customers/${paddleCustomerId}/portal-sessions`,
            { method: 'POST' },
        );
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

export default withWebHandler(handlePaddlePortalRequest);
