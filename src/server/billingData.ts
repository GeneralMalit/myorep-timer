import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { SupabaseEntitlementRow } from '../types/sync.ts';
import type { SupabaseServerEnvironment } from './billingEnv.ts';

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

export type PaddleSubscriptionEventAcceptance = 'applied' | 'duplicate' | 'stale';

export type PasswordSignUpAvailability = 'available' | 'email_taken' | 'username_taken';

export class AccountProvisionError extends Error {
    code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = 'AccountProvisionError';
        this.code = code;
    }
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

export const getSupabaseProfileByUserId = async (
    adminClient: SupabaseClient,
    userId: string,
): Promise<{ id: string; email: string | null; username: string; display_name: string | null; created_at: string; updated_at: string } | null> => {
    const { data, error } = await adminClient
        .from('profiles')
        .select('id, email, username, display_name, created_at, updated_at')
        .eq('id', userId)
        .maybeSingle();

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
        .maybeSingle();

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

export const upsertSupabaseProfile = async (
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

export const getSupabasePasswordSignUpAvailability = async (
    adminClient: SupabaseClient,
    payload: {
        username: string;
        email: string;
    },
): Promise<PasswordSignUpAvailability> => {
    const { data, error } = await adminClient.rpc('get_password_signup_availability', {
        p_email: payload.email.trim().toLowerCase(),
        p_username: payload.username,
    });

    if (error) {
        throw error;
    }

    if (data !== 'available' && data !== 'email_taken' && data !== 'username_taken') {
        throw new Error('Supabase returned an invalid sign-up availability result.');
    }

    return data;
};

export const refreshResolvedEntitlement = async (
    adminClient: SupabaseClient,
    userId: string,
): Promise<SupabaseEntitlementRow> => {
    const { data, error } = await adminClient.rpc('refresh_resolved_entitlement', {
        p_user_id: userId,
    });

    if (error) {
        throw error;
    }

    const entitlement = data as Partial<SupabaseEntitlementRow> | null;
    if (
        !entitlement
        || entitlement.user_id !== userId
        || (entitlement.plan !== 'free' && entitlement.plan !== 'plus')
        || typeof entitlement.cloud_sync_enabled !== 'boolean'
        || typeof entitlement.updated_at !== 'string'
    ) {
        throw new Error('Supabase returned an invalid entitlement refresh result.');
    }

    return entitlement as SupabaseEntitlementRow;
};

export const updateSupabaseUsername = async (
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

export const applyPaddleSubscriptionEvent = async (
    adminClient: SupabaseClient,
    event: {
        eventId: string;
        eventType: string;
        occurredAt: string;
        userId: string;
        paddleCustomerId: string | null;
        paddleSubscriptionId: string;
        paddlePriceId: string | null;
        subscriptionStatus: string;
        currentPeriodEnd: string | null;
    },
): Promise<PaddleSubscriptionEventAcceptance> => {
    const { data, error } = await adminClient.rpc('apply_paddle_subscription_event', {
        p_event_id: event.eventId,
        p_event_type: event.eventType,
        p_occurred_at: event.occurredAt,
        p_user_id: event.userId,
        p_paddle_customer_id: event.paddleCustomerId,
        p_paddle_subscription_id: event.paddleSubscriptionId,
        p_paddle_price_id: event.paddlePriceId,
        p_subscription_status: event.subscriptionStatus,
        p_current_period_end: event.currentPeriodEnd,
    });

    if (error) {
        throw error;
    }

    if (data !== 'applied' && data !== 'duplicate' && data !== 'stale') {
        throw new Error('Supabase returned an invalid Paddle event acceptance result.');
    }

    return data;
};
