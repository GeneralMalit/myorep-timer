import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Plan = 'free' | 'plus';

interface BillingAccountRow {
    subscription_status: string;
}

interface EntitlementOverrideRow {
    plan: Plan;
    cloud_sync_enabled: boolean;
    expires_at: string | null;
}

interface SupabaseEntitlementRow {
    user_id: string;
    plan: Plan;
    cloud_sync_enabled: boolean;
    updated_at: string;
}

const jsonResponse = (status: number, body: Record<string, unknown>): Response => {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
        },
    });
};

type NodeApiRequest = {
    method?: string;
    url?: string;
    headers?: Record<string, string | string[] | number | undefined>;
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

const createSupabaseClient = (key: string): SupabaseClient => {
    return createClient(readEnvWithFallback(['SUPABASE_URL', 'VITE_SUPABASE_URL']), key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
};

const createAuthClient = (): SupabaseClient => {
    return createSupabaseClient(readEnvWithFallback(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY']));
};

const createAdminClient = (): SupabaseClient => {
    return createSupabaseClient(readEnv('SUPABASE_SERVICE_ROLE_KEY'));
};

const getAccessToken = (request: Request): string | null => {
    const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
    if (!header?.startsWith('Bearer ')) {
        return null;
    }

    const token = header.slice('Bearer '.length).trim();
    return token || null;
};

const isPaddleSubscriptionActive = (status: string): boolean => {
    return status === 'active' || status === 'trialing';
};

const getActiveOverride = async (
    adminClient: SupabaseClient,
    userId: string,
): Promise<EntitlementOverrideRow | null> => {
    const { data, error } = await adminClient
        .from('entitlement_overrides')
        .select('plan, cloud_sync_enabled, expires_at')
        .eq('user_id', userId)
        .maybeSingle<EntitlementOverrideRow>();

    if (error) {
        throw error;
    }

    if (!data) {
        return null;
    }

    if (!data.expires_at || new Date(data.expires_at).getTime() > Date.now()) {
        return data;
    }

    return null;
};

const getBillingAccount = async (
    adminClient: SupabaseClient,
    userId: string,
): Promise<BillingAccountRow | null> => {
    const { data, error } = await adminClient
        .from('billing_accounts')
        .select('subscription_status')
        .eq('user_id', userId)
        .maybeSingle<BillingAccountRow>();

    if (error) {
        throw error;
    }

    return data ?? null;
};

const resolveEntitlement = async (
    adminClient: SupabaseClient,
    userId: string,
): Promise<SupabaseEntitlementRow> => {
    const [override, billingAccount] = await Promise.all([
        getActiveOverride(adminClient, userId),
        getBillingAccount(adminClient, userId),
    ]);
    const updatedAt = new Date().toISOString();

    if (override) {
        return {
            user_id: userId,
            plan: override.plan,
            cloud_sync_enabled: override.cloud_sync_enabled,
            updated_at: updatedAt,
        };
    }

    const isActive = billingAccount ? isPaddleSubscriptionActive(billingAccount.subscription_status) : false;
    return {
        user_id: userId,
        plan: isActive ? 'plus' : 'free',
        cloud_sync_enabled: isActive,
        updated_at: updatedAt,
    };
};

const refreshEntitlement = async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed.' });
    }

    const accessToken = getAccessToken(request);
    if (!accessToken) {
        return jsonResponse(401, { error: 'Sign in first to refresh your account state.' });
    }

    try {
        const authClient = createAuthClient();
        const adminClient = createAdminClient();
        const { data, error } = await authClient.auth.getUser(accessToken);
        if (error || !data.user) {
            throw new Error(error?.message ?? 'Invalid Supabase session.');
        }

        const entitlement = await resolveEntitlement(adminClient, data.user.id);
        const { error: upsertError } = await adminClient
            .from('entitlements')
            .upsert(entitlement, { onConflict: 'user_id' });

        if (upsertError) {
            throw upsertError;
        }

        return jsonResponse(200, { entitlement });
    } catch (error: unknown) {
        return jsonResponse(500, {
            error: error instanceof Error ? error.message : 'Could not refresh entitlement state.',
        });
    }
};

export default async function handler(
    request: Request | NodeApiRequest,
    response?: NodeApiResponse,
): Promise<Response | void> {
    const webResponse = await refreshEntitlement(toWebRequest(request));

    if (!response) {
        return webResponse;
    }

    await sendNodeResponse(response, webResponse);
}
