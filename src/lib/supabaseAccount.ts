import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AccountResolvedState } from '@/types/account';
import type { SupabaseEntitlementRow, SupabaseProfileRow } from '@/types/sync';
import { buildAccountStateFromSession, buildAccountStateFromSupabaseRows } from '@/utils/account';

type QueryableSupabaseClient = SupabaseClient & {
    from?: SupabaseClient['from'];
};

const hasQuerySupport = (client: SupabaseClient): client is QueryableSupabaseClient => {
    return typeof (client as QueryableSupabaseClient).from === 'function';
};

const refreshResolvedEntitlement = async (session: Session): Promise<void> => {
    if (typeof fetch !== 'function' || !session.access_token) {
        return;
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
        .select('id, email, display_name, created_at, updated_at')
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

    await refreshResolvedEntitlement(session);

    const [profileRow, entitlementRow] = await Promise.all([
        readSupabaseProfile(client, session.user.id),
        readSupabaseEntitlement(client, session.user.id),
    ]);

    return buildAccountStateFromSupabaseRows(session, profileRow, entitlementRow);
};

export const sendSupabaseMagicLink = async (
    client: SupabaseClient,
    email: string,
    redirectTo: string,
): Promise<{ ok: boolean; error?: string }> => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
        return { ok: false, error: 'Email is required.' };
    }

    const { error } = await client.auth.signInWithOtp({
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

export const signOutSupabase = async (
    client: SupabaseClient,
): Promise<{ ok: boolean; error?: string }> => {
    const { error } = await client.auth.signOut();

    if (error) {
        return { ok: false, error: error.message };
    }

    return { ok: true };
};
