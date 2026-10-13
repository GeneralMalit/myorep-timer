import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type PasswordSignUpAvailability = 'available' | 'email_taken' | 'username_taken';

const USERNAME_MAX_LENGTH = 24;
const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

const normalizeUsername = (value: string): string => {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, USERNAME_MAX_LENGTH);
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

const getSupabasePasswordSignUpAvailability = async (
    adminClient: SupabaseClient,
    payload: {
        username: string;
        email: string;
    },
): Promise<PasswordSignUpAvailability> => {
    const { data, error } = await adminClient.rpc('get_password_signup_availability', {
        p_email: payload.email.trim().toLowerCase(),
        p_username: payload.username,
    });

    if (error) {
        throw error;
    }

    if (data !== 'available' && data !== 'email_taken' && data !== 'username_taken') {
        throw new Error('Supabase returned an invalid sign-up availability result.');
    }

    return data;
};

const jsonResponse = (
    status: number,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
): Response => {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    });
};

const PASSWORD_SIGN_UP_RATE_LIMIT = 10;
const PASSWORD_SIGN_UP_RATE_WINDOW_MS = 60_000;
const PASSWORD_SIGN_UP_RATE_LIMIT_MAX_KEYS = 2_000;

interface PasswordSignUpRateLimitEntry {
    count: number;
    resetAt: number;
}

const passwordSignUpRateLimits = new Map<string, PasswordSignUpRateLimitEntry>();

const getRequestClientAddress = (request: Request): string => {
    const forwardedAddress = request.headers.get('x-vercel-forwarded-for')
        ?? request.headers.get('x-real-ip')
        ?? request.headers.get('x-forwarded-for')
        ?? 'unknown';

    return forwardedAddress.split(',')[0]?.trim().slice(0, 128) || 'unknown';
};

const consumePasswordSignUpRateLimit = (
    request: Request,
    now = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } => {
    if (passwordSignUpRateLimits.size >= PASSWORD_SIGN_UP_RATE_LIMIT_MAX_KEYS) {
        for (const [key, entry] of passwordSignUpRateLimits) {
            if (entry.resetAt <= now) {
                passwordSignUpRateLimits.delete(key);
            }
        }

        if (passwordSignUpRateLimits.size >= PASSWORD_SIGN_UP_RATE_LIMIT_MAX_KEYS) {
            const oldestKey = passwordSignUpRateLimits.keys().next().value as string | undefined;
            if (oldestKey) {
                passwordSignUpRateLimits.delete(oldestKey);
            }
        }
    }

    const key = getRequestClientAddress(request);
    const existingEntry = passwordSignUpRateLimits.get(key);
    if (!existingEntry || existingEntry.resetAt <= now) {
        passwordSignUpRateLimits.set(key, {
            count: 1,
            resetAt: now + PASSWORD_SIGN_UP_RATE_WINDOW_MS,
        });
        return { allowed: true };
    }

    if (existingEntry.count >= PASSWORD_SIGN_UP_RATE_LIMIT) {
        return {
            allowed: false,
            retryAfterSeconds: Math.max(1, Math.ceil((existingEntry.resetAt - now) / 1_000)),
        };
    }

    existingEntry.count += 1;
    return { allowed: true };
};

const parseJsonBody = async (request: Request): Promise<Record<string, unknown> | null> => {
    try {
        return await request.json() as Record<string, unknown>;
    } catch {
        return null;
    }
};

const handlePasswordSignUpRequest = async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed.' });
    }

    const payload = await parseJsonBody(request);
    const username = normalizeUsername(typeof payload?.username === 'string' ? payload.username : '');
    const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';

    if (!USERNAME_PATTERN.test(username.trim())) {
        return jsonResponse(400, {
            error: 'Use 3-24 lowercase letters, numbers, or underscores for your username.',
        });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return jsonResponse(400, { error: 'Enter a valid email address.' });
    }

    const rateLimit = consumePasswordSignUpRateLimit(request);
    if (!rateLimit.allowed) {
        return jsonResponse(429, {
            error: 'Too many sign-up attempts. Please try again later.',
        }, {
            'Cache-Control': 'no-store',
            'Retry-After': String(rateLimit.retryAfterSeconds),
        });
    }

    try {
        const env = {
            supabaseUrl: readEnvWithFallback(['SUPABASE_URL', 'VITE_SUPABASE_URL']),
            supabaseAnonKey: readEnvWithFallback(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY']),
            supabaseServiceRoleKey: readEnv('SUPABASE_SERVICE_ROLE_KEY'),
        };
        const adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
        const availability = await getSupabasePasswordSignUpAvailability(adminClient, {
            username,
            email,
        });

        if (availability === 'username_taken') {
            return jsonResponse(409, {
                error: 'That username is already taken.',
                code: 'username_taken',
            }, {
                'Cache-Control': 'no-store',
            });
        }

        // Supabase Auth owns email-enumeration-safe signup behavior. An existing
        // email therefore receives the same preflight response as a new email.
        return jsonResponse(200, { ok: true }, { 'Cache-Control': 'no-store' });
    } catch {
        return jsonResponse(500, {
            error: 'Could not prepare the account sign-up.',
        }, { 'Cache-Control': 'no-store' });
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

export default async function handler(
    request: Request | NodeApiRequest,
    response?: NodeApiResponse,
): Promise<Response | void> {
    let webResponse: Response;

    try {
        const webRequest = await toWebRequest(request);
        webResponse = await handlePasswordSignUpRequest(webRequest);
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
}
