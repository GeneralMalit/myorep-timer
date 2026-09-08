import { getSupabaseServerEnvironment } from './billingEnv.ts';
import {
    AccountProvisionError,
    authenticateSupabaseUser,
    createSupabaseAdminClient,
    createSupabaseAuthClient,
    getSupabasePasswordSignUpAvailability,
    refreshResolvedEntitlement,
    updateSupabaseUsername,
} from './billingData.ts';
import { isValidUsername, normalizeUsername } from '../lib/accountIdentity.ts';

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
        const entitlement = await refreshResolvedEntitlement(adminClient, user.id);

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
    const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';

    if (!isValidUsername(username)) {
        return jsonResponse(400, {
            error: 'Use 3-24 lowercase letters, numbers, or underscores for your username.',
        });
    }

    if (!isEmailLike(email)) {
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
        const env = getSupabaseServerEnvironment();
        const adminClient = createSupabaseAdminClient(env);
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
    } catch (error: unknown) {
        return jsonResponse(500, {
            error: 'Could not prepare the account sign-up.',
        }, { 'Cache-Control': 'no-store' });
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
