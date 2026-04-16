import { createClient } from '@supabase/supabase-js';

const ALLOWED_ADMIN_EMAIL = 'generalmalit07@gmail.com';
const ACTIVE_BILLING_STATUSES = new Set(['active', 'trialing']);

const usage = [
    'Usage:',
    '  npm run admin:grant-plus -- --email user@example.com --reason "phase7 testing" [--expires-at 2026-05-01T00:00:00.000Z] [--plan plus|free]',
    '  npm run admin:revoke-plus -- --email user@example.com',
    '  npm run admin:list-overrides',
    '',
    'Required env:',
    '  SUPABASE_SERVICE_ROLE_KEY',
    '  SUPABASE_URL or VITE_SUPABASE_URL',
    '',
    `Admin identity is fixed to ${ALLOWED_ADMIN_EMAIL}.`,
].join('\n');

const exitWithUsage = (code = 1) => {
    console.log(usage);
    process.exit(code);
};

const normalizeEmail = (value) => value.trim().toLowerCase();

const requireEnv = (name) => {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
};

const requireAnyEnv = (names) => {
    for (const name of names) {
        const value = process.env[name]?.trim();
        if (value) {
            return value;
        }
    }

    throw new Error(`Missing required environment variable. Expected one of: ${names.join(', ')}`);
};

const createSupabaseAdmin = () => {
    return createClient(
        requireAnyEnv(['SUPABASE_URL', 'VITE_SUPABASE_URL']),
        requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        },
    );
};

const parseArgs = () => {
    const [command, ...rest] = process.argv.slice(2);
    if (!command || command === '--help' || command === '-h') {
        exitWithUsage(0);
    }

    const options = new Map();
    for (let index = 0; index < rest.length; index += 1) {
        const token = rest[index];
        if (!token.startsWith('--')) {
            continue;
        }

        const key = token.slice(2);
        const next = rest[index + 1];
        if (!next || next.startsWith('--')) {
            options.set(key, 'true');
            continue;
        }

        options.set(key, next);
        index += 1;
    }

    return {
        command,
        email: options.get('email') ?? '',
        reason: options.get('reason') ?? 'phase7 testing',
        expiresAt: options.get('expires-at') ?? null,
        plan: options.get('plan') ?? 'plus',
    };
};

const resolveUserByEmail = async (client, email) => {
    const targetEmail = normalizeEmail(email);
    let page = 1;
    const perPage = 100;

    while (true) {
        const { data, error } = await client.auth.admin.listUsers({ page, perPage });
        if (error) {
            throw error;
        }

        const user = data.users.find((entry) => normalizeEmail(entry.email ?? '') === targetEmail);
        if (user) {
            return user;
        }

        if (data.users.length < perPage) {
            return null;
        }

        page += 1;
    }
};

const getBillingAccount = async (client, userId) => {
    const { data, error } = await client
        .from('billing_accounts')
        .select('user_id, subscription_status')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data ?? null;
};

const getEntitlementOverride = async (client, userId) => {
    const { data, error } = await client
        .from('entitlement_overrides')
        .select('user_id, plan, cloud_sync_enabled, reason, granted_by_email, expires_at, created_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data ?? null;
};

const isOverrideActive = (override) => {
    if (!override) {
        return false;
    }

    if (!override.expires_at) {
        return true;
    }

    return new Date(override.expires_at).getTime() > Date.now();
};

const buildResolvedEntitlement = (userId, billingAccount, override) => {
    if (isOverrideActive(override)) {
        return {
            user_id: userId,
            plan: override.plan,
            cloud_sync_enabled: override.cloud_sync_enabled,
            updated_at: new Date().toISOString(),
        };
    }

    const activeBilling = billingAccount && ACTIVE_BILLING_STATUSES.has(billingAccount.subscription_status);
    return {
        user_id: userId,
        plan: activeBilling ? 'plus' : 'free',
        cloud_sync_enabled: Boolean(activeBilling),
        updated_at: new Date().toISOString(),
    };
};

const syncResolvedEntitlement = async (client, userId) => {
    const [billingAccount, override] = await Promise.all([
        getBillingAccount(client, userId),
        getEntitlementOverride(client, userId),
    ]);

    const resolved = buildResolvedEntitlement(userId, billingAccount, override);
    const { error } = await client
        .from('entitlements')
        .upsert(resolved, { onConflict: 'user_id' });

    if (error) {
        throw error;
    }

    return {
        override,
        resolved,
        billingAccount,
    };
};

const upsertOverride = async (client, payload) => {
    const { error } = await client
        .from('entitlement_overrides')
        .upsert(payload, { onConflict: 'user_id' });

    if (error) {
        throw error;
    }
};

const deleteOverride = async (client, userId) => {
    const { error } = await client
        .from('entitlement_overrides')
        .delete()
        .eq('user_id', userId);

    if (error) {
        throw error;
    }
};

const listAllUsers = async (client) => {
    const users = [];
    let page = 1;
    const perPage = 100;

    while (true) {
        const { data, error } = await client.auth.admin.listUsers({ page, perPage });
        if (error) {
            throw error;
        }

        users.push(...data.users);
        if (data.users.length < perPage) {
            break;
        }

        page += 1;
    }

    return users;
};

const runGrant = async ({ email, reason, expiresAt, plan }) => {
    if (!email.trim()) {
        throw new Error('Grant requires --email.');
    }

    if (plan !== 'plus' && plan !== 'free') {
        throw new Error('Grant only supports --plan plus or --plan free.');
    }

    if (!reason.trim()) {
        throw new Error('Grant requires a non-empty --reason.');
    }

    if (expiresAt) {
        const parsed = new Date(expiresAt);
        if (Number.isNaN(parsed.getTime())) {
            throw new Error('Expected --expires-at to be an ISO timestamp.');
        }
    }

    const client = createSupabaseAdmin();
    const user = await resolveUserByEmail(client, email);
    if (!user) {
        throw new Error(`Could not find a Supabase user with email ${email}.`);
    }

    await upsertOverride(client, {
        user_id: user.id,
        plan,
        cloud_sync_enabled: plan === 'plus',
        reason,
        granted_by_email: ALLOWED_ADMIN_EMAIL,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
    });

    const result = await syncResolvedEntitlement(client, user.id);
    console.log(JSON.stringify({
        ok: true,
        action: 'grant',
        user: {
            id: user.id,
            email: user.email ?? null,
        },
        override: result.override,
        resolved_entitlement: result.resolved,
        billing_account: result.billingAccount,
    }, null, 2));
};

const runRevoke = async ({ email }) => {
    if (!email.trim()) {
        throw new Error('Revoke requires --email.');
    }

    const client = createSupabaseAdmin();
    const user = await resolveUserByEmail(client, email);
    if (!user) {
        throw new Error(`Could not find a Supabase user with email ${email}.`);
    }

    await deleteOverride(client, user.id);
    const result = await syncResolvedEntitlement(client, user.id);

    console.log(JSON.stringify({
        ok: true,
        action: 'revoke',
        user: {
            id: user.id,
            email: user.email ?? null,
        },
        override: result.override,
        resolved_entitlement: result.resolved,
        billing_account: result.billingAccount,
    }, null, 2));
};

const runList = async () => {
    const client = createSupabaseAdmin();
    const [overrideQuery, users] = await Promise.all([
        client
            .from('entitlement_overrides')
            .select('user_id, plan, cloud_sync_enabled, reason, granted_by_email, expires_at, created_at, updated_at')
            .order('updated_at', { ascending: false }),
        listAllUsers(client),
    ]);

    if (overrideQuery.error) {
        throw overrideQuery.error;
    }

    const emailByUserId = new Map(users.map((user) => [user.id, user.email ?? null]));
    const rows = overrideQuery.data.map((row) => ({
        user_email: emailByUserId.get(row.user_id) ?? null,
        user_id: row.user_id,
        plan: row.plan,
        cloud_sync_enabled: row.cloud_sync_enabled,
        reason: row.reason,
        granted_by_email: row.granted_by_email,
        expires_at: row.expires_at,
        active: isOverrideActive(row),
        updated_at: row.updated_at,
    }));

    console.table(rows);
    console.log(JSON.stringify({
        ok: true,
        overrides: rows.length,
        allowlisted_admin_email: ALLOWED_ADMIN_EMAIL,
    }, null, 2));
};

const main = async () => {
    const args = parseArgs();

    switch (args.command) {
        case 'grant':
            await runGrant(args);
            return;
        case 'revoke':
            await runRevoke(args);
            return;
        case 'list':
            await runList();
            return;
        default:
            exitWithUsage(1);
    }
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
