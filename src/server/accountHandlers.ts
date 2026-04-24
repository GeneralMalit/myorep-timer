import { getSupabaseServerEnvironment } from './billingEnv.ts';
import {
    AccountProvisionError,
    authenticateSupabaseUser,
    assertSupabasePasswordSignUpAvailable,
    createSupabaseAdminClient,
    createSupabaseAuthClient,
    updateSupabaseUsername,
} from './billingData.ts';
import { syncResolvedEntitlement } from './entitlements.ts';
import { isValidUsername, normalizeUsername } from '../lib/accountIdentity.ts';

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

const isEmailLike = (value: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
};

const parseJsonBody = async (request: Request): Promise<Record<string, unknown> | null> => {
    try {
        return await request.json() as Record<string, unknown>;
    } catch {
        return null;
    }
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

export const handlePasswordSignUpRequest = async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed.' });
    }

    const payload = await parseJsonBody(request);
    const username = normalizeUsername(typeof payload?.username === 'string' ? payload.username : '');
    const email = typeof payload?.email === 'string' ? payload.email.trim() : '';

    if (!isValidUsername(username)) {
        return jsonResponse(400, {
            error: 'Use 3-24 lowercase letters, numbers, or underscores for your username.',
        });
    }

    if (!isEmailLike(email)) {
        return jsonResponse(400, { error: 'Enter a valid email address.' });
    }

    try {
        const env = getSupabaseServerEnvironment();
        const adminClient = createSupabaseAdminClient(env);
        await assertSupabasePasswordSignUpAvailable(adminClient, {
            username,
            email,
        });

        return jsonResponse(200, { ok: true });
    } catch (error: unknown) {
        if (error instanceof AccountProvisionError) {
            return jsonResponse(409, {
                error: error.message,
                code: error.code,
            });
        }

        return jsonResponse(500, {
            error: error instanceof Error ? error.message : 'Could not prepare the account sign-up.',
        });
    }
};

export const handleProfileUpdateRequest = async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed.' });
    }

    const accessToken = getAccessToken(request);
    if (!accessToken) {
        return jsonResponse(401, { error: 'Sign in first to update your account.' });
    }

    const payload = await parseJsonBody(request);
    const username = normalizeUsername(typeof payload?.username === 'string' ? payload.username : '');
    if (!isValidUsername(username)) {
        return jsonResponse(400, {
            error: 'Use 3-24 lowercase letters, numbers, or underscores for your username.',
        });
    }

    try {
        const env = getSupabaseServerEnvironment();
        const authClient = createSupabaseAuthClient(env);
        const adminClient = createSupabaseAdminClient(env);
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
