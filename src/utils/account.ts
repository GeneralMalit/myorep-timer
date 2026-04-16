import type { Session } from '@supabase/supabase-js';
import type { AccountEntitlement, AccountMode, AccountPlan, AccountProfile, AccountResolvedState } from '@/types/account';
import type { SupabaseEntitlementRow, SupabaseProfileRow } from '@/types/sync';

export const hasActivePlusEntitlement = (entitlement: AccountEntitlement | null | undefined): boolean => {
    return entitlement?.plan === 'plus' && entitlement.cloudSyncEnabled;
};

export const canAccessCloudSync = (entitlement: AccountEntitlement | null | undefined): boolean => {
    return hasActivePlusEntitlement(entitlement);
};

export const canAccessSessionBuilder = (entitlement: AccountEntitlement | null | undefined): boolean => {
    return hasActivePlusEntitlement(entitlement);
};

const resolveDisplayName = (session: Session): string | null => {
    const metadata = session.user.user_metadata as Record<string, unknown> | undefined;
    const candidate = typeof metadata?.full_name === 'string'
        ? metadata.full_name
        : typeof metadata?.name === 'string'
            ? metadata.name
            : typeof metadata?.username === 'string'
                ? metadata.username
                : session.user.email?.split('@')[0] ?? null;

    return candidate ? candidate.trim() || null : null;
};

export const buildAccountProfileFromSession = (session: Session): AccountProfile => {
    const nowIso = new Date().toISOString();
    return {
        userId: session.user.id,
        email: session.user.email ?? null,
        displayName: resolveDisplayName(session),
        createdAt: session.user.created_at ?? nowIso,
        updatedAt: nowIso,
    };
};

export const buildAccountProfileFromSupabaseRow = (row: SupabaseProfileRow): AccountProfile => {
    return {
        userId: row.id,
        email: row.email,
        displayName: row.display_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
};

export const buildDefaultEntitlement = (
    userId: string,
    plan: AccountPlan = 'free',
): AccountEntitlement => {
    const nowIso = new Date().toISOString();
    return {
        userId,
        plan,
        cloudSyncEnabled: plan === 'plus',
        updatedAt: nowIso,
        source: 'local',
    };
};

export const buildAccountEntitlementFromSupabaseRow = (row: SupabaseEntitlementRow): AccountEntitlement => {
    return {
        userId: row.user_id,
        plan: row.plan,
        cloudSyncEnabled: row.cloud_sync_enabled,
        updatedAt: row.updated_at,
        source: 'supabase',
    };
};

export const buildSupabaseEntitlement = (
    userId: string,
    plan: AccountPlan,
    cloudSyncEnabled: boolean,
): AccountEntitlement => {
    return {
        userId,
        plan,
        cloudSyncEnabled,
        updatedAt: new Date().toISOString(),
        source: 'supabase',
    };
};

export const buildAccountStateFromSession = (session: Session | null): AccountResolvedState => {
    if (!session) {
        return {
            session: null,
            profile: null,
            entitlement: null,
            mode: 'guest',
            syncStatus: 'disabled',
        };
    }

    const entitlement = buildDefaultEntitlement(session.user.id);
    return {
        session,
        profile: buildAccountProfileFromSession(session),
        entitlement,
        mode: resolveAccountMode(session, entitlement),
        syncStatus: entitlement.cloudSyncEnabled ? 'idle' : 'disabled',
    };
};

export const buildAccountStateFromSupabaseRows = (
    session: Session,
    profileRow: SupabaseProfileRow | null,
    entitlementRow: SupabaseEntitlementRow | null,
): AccountResolvedState => {
    const profile = profileRow ? buildAccountProfileFromSupabaseRow(profileRow) : buildAccountProfileFromSession(session);
    const entitlement = entitlementRow
        ? buildAccountEntitlementFromSupabaseRow(entitlementRow)
        : buildDefaultEntitlement(session.user.id);

    return {
        session,
        profile,
        entitlement,
        mode: resolveAccountMode(session, entitlement),
        syncStatus: entitlement.cloudSyncEnabled ? 'idle' : 'disabled',
    };
};

export const resolveAccountMode = (
    session: Session | null,
    entitlement: AccountEntitlement | null,
): AccountMode => {
    if (!session) {
        return 'guest';
    }

    if (hasActivePlusEntitlement(entitlement)) {
        return 'signed-in-plus';
    }

    return 'signed-in-free';
};
