import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { SupabaseServerEnvironment } from '@/server/billingEnv';

export interface BillingAccountRow {
    user_id: string;
    provider: 'paddle';
    paddle_customer_id: string | null;
    paddle_subscription_id: string | null;
    paddle_price_id: string | null;
    subscription_status: string;
    current_period_end: string | null;
    last_event_id: string | null;
    last_event_occurred_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface EntitlementOverrideRow {
    user_id: string;
    plan: 'free' | 'plus';
    cloud_sync_enabled: boolean;
    reason: string;
    granted_by_email: string;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
}

const createSupabaseServerClient = (url: string, key: string): SupabaseClient => {
    return createClient(url, key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
};

export const createSupabaseAuthClient = (env: SupabaseServerEnvironment): SupabaseClient => {
    return createSupabaseServerClient(env.supabaseUrl, env.supabaseAnonKey);
};

export const createSupabaseAdminClient = (env: SupabaseServerEnvironment): SupabaseClient => {
    return createSupabaseServerClient(env.supabaseUrl, env.supabaseServiceRoleKey);
};

export const authenticateSupabaseUser = async (
    client: SupabaseClient,
    accessToken: string,
): Promise<User> => {
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data.user) {
        throw new Error(error?.message ?? 'Invalid Supabase session.');
    }

    return data.user;
};

export const getBillingAccountByUserId = async (
    adminClient: SupabaseClient,
    userId: string,
): Promise<BillingAccountRow | null> => {
    const { data, error } = await adminClient
        .from('billing_accounts')
        .select('user_id, provider, paddle_customer_id, paddle_subscription_id, paddle_price_id, subscription_status, current_period_end, last_event_id, last_event_occurred_at, created_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle<BillingAccountRow>();

    if (error) {
        throw error;
    }

    return data ?? null;
};

export const getBillingAccountByPaddleCustomerId = async (
    adminClient: SupabaseClient,
    paddleCustomerId: string,
): Promise<BillingAccountRow | null> => {
    const { data, error } = await adminClient
        .from('billing_accounts')
        .select('user_id, provider, paddle_customer_id, paddle_subscription_id, paddle_price_id, subscription_status, current_period_end, last_event_id, last_event_occurred_at, created_at, updated_at')
        .eq('paddle_customer_id', paddleCustomerId)
        .maybeSingle<BillingAccountRow>();

    if (error) {
        throw error;
    }

    return data ?? null;
};

export const upsertBillingAccount = async (
    adminClient: SupabaseClient,
    account: Partial<BillingAccountRow> & {
        user_id: string;
        provider?: 'paddle';
    },
): Promise<void> => {
    const payload = {
        provider: 'paddle' as const,
        subscription_status: 'inactive',
        ...account,
    };

    const { error } = await adminClient
        .from('billing_accounts')
        .upsert(payload, { onConflict: 'user_id' });

    if (error) {
        throw error;
    }
};
