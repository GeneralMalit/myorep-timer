import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

interface SupabaseProfileRow {
    id: string;
    email: string | null;
    username: string;
    display_name: string | null;
    created_at: string;
    updated_at: string;
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

const getSupabaseProfileByUserId = async (
    adminClient: SupabaseClient,
    userId: string,
): Promise<SupabaseProfileRow | null> => {
    const { data, error } = await adminClient
        .from('profiles')
        .select('id, email, username, display_name, created_at, updated_at')
        .eq('id', userId)
        .maybeSingle<SupabaseProfileRow>();

    if (error) {
        throw error;
    }

    return data ?? null;
};

const findSupabaseProfileByUsername = async (
    adminClient: SupabaseClient,
    username: string,
): Promise<{ id: string } | null> => {
    const { data, error } = await adminClient
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle<{ id: string }>();

    if (error) {
        throw error;
    }

    return data ?? null;
};

const getAuthUserById = async (
    adminClient: SupabaseClient,
    userId: string,
): Promise<User> => {
    const { data, error } = await adminClient.auth.admin.getUserById(userId);
    if (error || !data.user) {
        throw error ?? new Error('Could not load the Supabase user.');
    }

    return data.user;
};

const upsertSupabaseProfile = async (
    adminClient: SupabaseClient,
    profile: {
        userId: string;
        email: string | null;
        username: string;
    },
) => {
    const { data, error } = await adminClient
        .from('profiles')
        .upsert({
            id: profile.userId,
            email: profile.email,
            username: profile.username,
            display_name: profile.username,
        }, { onConflict: 'id' })
        .select('id, email, username, display_name, created_at, updated_at')
        .single();

    if (error) {
        throw error;
    }

    return data;
};

class AccountProvisionError extends Error {
    code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = 'AccountProvisionError';
        this.code = code;
    }
}

const updateSupabaseUsername = async (
    adminClient: SupabaseClient,
    payload: {
        userId: string;
        username: string;
    },
) => {
    const existingProfile = await findSupabaseProfileByUsername(adminClient, payload.username);
    if (existingProfile && existingProfile.id !== payload.userId) {
        throw new AccountProvisionError(
            'username_taken',
            'That username is already taken.',
        );
    }

    const [profile, authUser] = await Promise.all([
        getSupabaseProfileByUserId(adminClient, payload.userId),
        getAuthUserById(adminClient, payload.userId),
    ]);

    return upsertSupabaseProfile(adminClient, {
        userId: payload.userId,
        email: profile?.email ?? authUser.email ?? null,
        username: payload.username,
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

const parseJsonBody = async (request: Request): Promise<Record<string, unknown> | null> => {
    try {
        return await request.json() as Record<string, unknown>;
    } catch {
        return null;
    }
};

const handleProfileUpdateRequest = async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed.' });
    }

    const accessToken = getAccessToken(request);
    if (!accessToken) {
        return jsonResponse(401, { error: 'Sign in first to update your account.' });
    }

    const payload = await parseJsonBody(request);
    const username = normalizeUsername(typeof payload?.username === 'string' ? payload.username : '');
    if (!USERNAME_PATTERN.test(username.trim())) {
        return jsonResponse(400, {
            error: 'Use 3-24 lowercase letters, numbers, or underscores for your username.',
        });
    }

    try {
        const env = {
            supabaseUrl: readEnvWithFallback(['SUPABASE_URL', 'VITE_SUPABASE_URL']),
            supabaseAnonKey: readEnvWithFallback(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY']),
            supabaseServiceRoleKey: readEnv('SUPABASE_SERVICE_ROLE_KEY'),
        };
        const authClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
        const adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
        const user = await authenticateSupabaseUser(authClient, accessToken);
        const profile = await updateSupabaseUsername(adminClient, {
            userId: user.id,
            username,
        });

        return jsonResponse(200, { profile });
    } catch (error: unknown) {
        if (error instanceof AccountProvisionError) {
            return jsonResponse(409, {
                error: error.message,
                code: error.code,
            });
        }

        return jsonResponse(500, {
            error: error instanceof Error ? error.message : 'Could not update the profile.',
        });
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

export default async function handler(
    request: Request | NodeApiRequest,
    response?: NodeApiResponse,
): Promise<Response | void> {
    let webResponse: Response;

    try {
        const webRequest = await toWebRequest(request);
        webResponse = await handleProfileUpdateRequest(webRequest);
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
