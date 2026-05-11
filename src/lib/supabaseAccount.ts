import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AccountResolvedState } from '@/types/account';
import type { SupabaseEntitlementRow, SupabaseProfileRow } from '@/types/sync';
import { buildAccountStateFromSession, buildAccountStateFromSupabaseRows } from '@/utils/account';
import { normalizeUsername } from '@/lib/accountIdentity';

type QueryableSupabaseClient = SupabaseClient & {
    from?: SupabaseClient['from'];
};

const hasQuerySupport = (client: SupabaseClient): client is QueryableSupabaseClient => {
    return typeof (client as QueryableSupabaseClient).from === 'function';
};

const refreshResolvedEntitlement = async (session: Session): Promise<SupabaseEntitlementRow | null> => {
    if (typeof fetch !== 'function' || !session.access_token) {
        return null;
    }

    const response = await fetch('/api/account/refresh-entitlement', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${session.access_token}`,
        },
    });

    if (!response.ok) {
        let message = `Entitlement refresh failed with status ${response.status}.`;
        try {
            const payload = await response.json() as { error?: string };
            if (payload.error?.trim()) {
                message = payload.error;
            }
        } catch {
            // Fall back to the default message above.
        }

        throw new Error(message);
    }

    try {
        const payload = await response.json() as { entitlement?: SupabaseEntitlementRow | null };
        return payload.entitlement ?? null;
    } catch {
        return null;
    }
};

const readSupabaseProfile = async (
    client: SupabaseClient,
    userId: string,
): Promise<SupabaseProfileRow | null> => {
    if (!hasQuerySupport(client)) {
        return null;
    }

    const { data, error } = await client
        .from('profiles')
        .select('id, email, username, display_name, created_at, updated_at')
        .eq('id', userId)
        .maybeSingle<SupabaseProfileRow>();

    if (error) {
        throw error;
    }

    return data ?? null;
};

const readSupabaseEntitlement = async (
    client: SupabaseClient,
    userId: string,
): Promise<SupabaseEntitlementRow | null> => {
    if (!hasQuerySupport(client)) {
        return null;
    }

    const { data, error } = await client
        .from('entitlements')
        .select('user_id, plan, cloud_sync_enabled, updated_at')
        .eq('user_id', userId)
        .maybeSingle<SupabaseEntitlementRow>();

    if (error) {
        throw error;
    }

    return data ?? null;
};

export const loadSupabaseAccountState = async (
    client: SupabaseClient,
    session: Session,
): Promise<AccountResolvedState> => {
    if (!hasQuerySupport(client)) {
        return buildAccountStateFromSession(session);
    }

    let refreshedEntitlement: SupabaseEntitlementRow | null = null;
    try {
        refreshedEntitlement = await refreshResolvedEntitlement(session);
    } catch {
        // Refresh is opportunistic. We still want to read the persisted
        // Supabase rows so a transient API failure does not force the user
        // into the free path.
    }

    const [profileRow, entitlementRow] = await Promise.all([
        readSupabaseProfile(client, session.user.id),
        readSupabaseEntitlement(client, session.user.id),
    ]);

    return buildAccountStateFromSupabaseRows(session, profileRow, entitlementRow ?? refreshedEntitlement);
};

export const signInSupabaseWithPassword = async (
    client: SupabaseClient,
    email: string,
    password: string,
): Promise<{ ok: boolean; error?: string }> => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password.trim()) {
        return { ok: false, error: 'Email and password are required.' };
    }

    const { error } = await client.auth.signInWithPassword({
        email: normalizedEmail,
        password,
    });

    if (error) {
        return { ok: false, error: error.message };
    }

    return { ok: true };
};

export const signUpSupabaseWithPassword = async (
    client: SupabaseClient,
    username: string,
    email: string,
    password: string,
    redirectTo: string,
): Promise<{ ok: boolean; error?: string; requiresEmailVerification?: boolean }> => {
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = email.trim();
    if (!normalizedUsername || !normalizedEmail || !password.trim()) {
        return { ok: false, error: 'Username, email, and password are required.' };
    }

    const response = await fetch('/api/account/password-signup', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            username: normalizedUsername,
            email: normalizedEmail,
        }),
    });

    if (!response.ok) {
        let errorMessage = 'Could not create your account.';
        try {
            const payload = await response.json() as { error?: string };
            if (payload.error?.trim()) {
                errorMessage = payload.error;
            }
        } catch {
            // fall back to the default message above
        }

        return { ok: false, error: errorMessage };
    }

    const { data, error } = await client.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
            emailRedirectTo: redirectTo,
            data: {
                username: normalizedUsername,
            },
        },
    });

    if (error) {
        return { ok: false, error: error.message };
    }

    if (data.session) {
        await client.auth.signOut();
        return {
            ok: false,
            error: 'Supabase email confirmation must be enabled before new accounts can require the magic link.',
        };
    }

    return { ok: true, requiresEmailVerification: true };
};

export const resendSupabaseSignUpConfirmation = async (
    client: SupabaseClient,
    email: string,
    redirectTo: string,
): Promise<{ ok: boolean; error?: string }> => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
        return { ok: false, error: 'Email is required.' };
    }

    const { error } = await client.auth.resend({
        type: 'signup',
        email: normalizedEmail,
        options: {
            emailRedirectTo: redirectTo,
        },
    });

    if (error) {
        return { ok: false, error: error.message };
    }

    return { ok: true };
};

export const updateSupabaseUsername = async (
    session: Session,
    username: string,
): Promise<{ ok: boolean; error?: string }> => {
    if (typeof fetch !== 'function' || !session.access_token) {
        return { ok: false, error: 'Sign in first to update your account.' };
    }

    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) {
        return { ok: false, error: 'Username is required.' };
    }

    const response = await fetch('/api/account/update-profile', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            username: normalizedUsername,
        }),
    });

    if (!response.ok) {
        let errorMessage = 'Could not update your username.';
        try {
            const payload = await response.json() as { error?: string };
            if (payload.error?.trim()) {
                errorMessage = payload.error;
            }
        } catch {
            // fall back to default
        }

        return { ok: false, error: errorMessage };
    }

    return { ok: true };
};

export const sendSupabasePasswordReset = async (
    client: SupabaseClient,
    email: string,
    redirectTo: string,
): Promise<{ ok: boolean; error?: string }> => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
        return { ok: false, error: 'Email is required.' };
    }

    const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo,
    });

    if (error) {
        return { ok: false, error: error.message };
    }

    return { ok: true };
};

export const updateSupabasePassword = async (
    client: SupabaseClient,
    password: string,
): Promise<{ ok: boolean; error?: string }> => {
    const normalizedPassword = password.trim();
    if (!normalizedPassword) {
        return { ok: false, error: 'A new password is required.' };
    }

    const { error } = await client.auth.updateUser({
        password: normalizedPassword,
    });

    if (error) {
        return { ok: false, error: error.message };
    }

    return { ok: true };
};

export const signOutSupabase = async (
    client: SupabaseClient,
): Promise<{ ok: boolean; error?: string }> => {
    const { error } = await client.auth.signOut();

    if (error) {
        return { ok: false, error: error.message };
    }

    return { ok: true };
};
