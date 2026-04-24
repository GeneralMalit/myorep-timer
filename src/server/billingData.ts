import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
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

export const findSupabaseUserByEmail = async (
    adminClient: SupabaseClient,
    email: string,
): Promise<User | null> => {
    const normalizedEmail = email.trim().toLowerCase();
    let page = 1;

    while (page <= 10) {
        const { data, error } = await adminClient.auth.admin.listUsers({
            page,
            perPage: 200,
        });

        if (error) {
            throw error;
        }

        const users = data.users ?? [];
        const match = users.find((user) => user.email?.trim().toLowerCase() === normalizedEmail);
        if (match) {
            return match;
        }

        if (users.length < 200) {
            return null;
        }

        page += 1;
    }

    return null;
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

export const assertSupabasePasswordSignUpAvailable = async (
    adminClient: SupabaseClient,
    payload: {
        username: string;
        email: string;
    },
): Promise<void> => {
    const normalizedEmail = payload.email.trim().toLowerCase();
    const existingUser = await findSupabaseUserByEmail(adminClient, normalizedEmail);
    if (existingUser) {
        throw new AccountProvisionError(
            'account_exists',
            'An account already exists for that email. Sign in or use forgot password.',
        );
    }

    const existingProfile = await findSupabaseProfileByUsername(adminClient, payload.username);
    if (existingProfile) {
        throw new AccountProvisionError(
            'username_taken',
            'That username is already taken.',
        );
    }
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
