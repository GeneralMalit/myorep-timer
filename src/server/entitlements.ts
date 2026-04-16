import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseEntitlementRow } from '@/types/sync';
import {
    getBillingAccountByUserId,
    type BillingAccountRow,
    type EntitlementOverrideRow,
} from '@/server/billingData';
import { isPaddleSubscriptionActive } from '@/server/paddleBilling';

export interface EffectiveEntitlementInput {
    userId: string;
    billingAccount?: BillingAccountRow | null;
    override?: EntitlementOverrideRow | null;
    now?: Date;
    updatedAt?: string;
}

const selectActiveOverride = (
    override: EntitlementOverrideRow | null | undefined,
    now: Date,
): EntitlementOverrideRow | null => {
    if (!override) {
        return null;
    }

    if (!override.expires_at) {
        return override;
    }

    return new Date(override.expires_at).getTime() > now.getTime() ? override : null;
};

export const buildResolvedEntitlement = ({
    userId,
    billingAccount,
    override,
    now = new Date(),
    updatedAt,
}: EffectiveEntitlementInput): SupabaseEntitlementRow => {
    const activeOverride = selectActiveOverride(override, now);
    if (activeOverride) {
        return {
            user_id: userId,
            plan: activeOverride.plan,
            cloud_sync_enabled: activeOverride.cloud_sync_enabled,
            updated_at: updatedAt ?? now.toISOString(),
        };
    }

    const isActive = billingAccount ? isPaddleSubscriptionActive(billingAccount.subscription_status) : false;
    return {
        user_id: userId,
        plan: isActive ? 'plus' : 'free',
        cloud_sync_enabled: isActive,
        updated_at: updatedAt ?? now.toISOString(),
    };
};

export const getEntitlementOverrideByUserId = async (
    adminClient: SupabaseClient,
    userId: string,
): Promise<EntitlementOverrideRow | null> => {
    const { data, error } = await adminClient
        .from('entitlement_overrides')
        .select('user_id, plan, cloud_sync_enabled, reason, granted_by_email, expires_at, created_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle<EntitlementOverrideRow>();

    if (error) {
        throw error;
    }

    return data ?? null;
};

export const syncResolvedEntitlement = async (
    adminClient: SupabaseClient,
    params: {
        userId: string;
        billingAccount?: BillingAccountRow | null;
        override?: EntitlementOverrideRow | null;
        now?: Date;
        updatedAt?: string;
    },
): Promise<SupabaseEntitlementRow> => {
    const [billingAccount, override] = await Promise.all([
        params.billingAccount === undefined
            ? getBillingAccountByUserId(adminClient, params.userId)
            : Promise.resolve(params.billingAccount),
        params.override === undefined
            ? getEntitlementOverrideByUserId(adminClient, params.userId)
            : Promise.resolve(params.override),
    ]);

    const resolved = buildResolvedEntitlement({
        userId: params.userId,
        billingAccount,
        override,
        now: params.now,
        updatedAt: params.updatedAt,
    });

    const { error } = await adminClient
        .from('entitlements')
        .upsert(resolved, { onConflict: 'user_id' });

    if (error) {
        throw error;
    }

    return resolved;
};
