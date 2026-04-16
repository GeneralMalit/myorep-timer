import { getSupabaseServerEnvironment } from '@/server/billingEnv';
import {
    authenticateSupabaseUser,
    createSupabaseAdminClient,
    createSupabaseAuthClient,
} from '@/server/billingData';
import { syncResolvedEntitlement } from '@/server/entitlements';

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

export const handleEntitlementRefreshRequest = async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed.' });
    }

    const accessToken = getAccessToken(request);
    if (!accessToken) {
        return jsonResponse(401, { error: 'Sign in first to refresh your account state.' });
    }

    try {
        const env = getSupabaseServerEnvironment();
        const authClient = createSupabaseAuthClient(env);
        const adminClient = createSupabaseAdminClient(env);
        const user = await authenticateSupabaseUser(authClient, accessToken);
        const entitlement = await syncResolvedEntitlement(adminClient, { userId: user.id });

        return jsonResponse(200, { entitlement });
    } catch (error: unknown) {
        return jsonResponse(500, {
            error: error instanceof Error ? error.message : 'Could not refresh entitlement state.',
        });
    }
};
