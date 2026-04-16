import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_NATIVE_REDIRECT_URL = 'com.generalmalit.myoreptimer://auth/callback';

export interface SupabaseEnvironment {
    enabled: boolean;
    configured: boolean;
    url: string;
    anonKey: string;
    redirectUrl: string | null;
    missing: string[];
}

export interface SupabaseRuntimeState extends SupabaseEnvironment {
    status: 'disabled' | 'missing-config' | 'ready';
    label: string;
    detail: string;
}

let cachedClient: SupabaseClient | null = null;
let cachedClientKey: string | null = null;

const readEnv = (): SupabaseEnvironment => {
    const enabled = import.meta.env.VITE_ENABLE_SUPABASE === 'true';
    const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
    const redirectUrl = import.meta.env.VITE_SUPABASE_REDIRECT_URL?.trim() || null;

    const missing = [
        !url ? 'VITE_SUPABASE_URL' : null,
        !anonKey ? 'VITE_SUPABASE_ANON_KEY' : null,
    ].filter((value): value is string => value !== null);

    return {
        enabled,
        configured: enabled && missing.length === 0,
        url,
        anonKey,
        redirectUrl: redirectUrl || null,
        missing,
    };
};

export const getSupabaseEnvironment = (): SupabaseEnvironment => readEnv();

export const isSupabaseConfigured = (): boolean => readEnv().configured;

export const getSupabaseAuthRedirectUrl = (options?: {
    native?: boolean;
    origin?: string | null;
}): string => {
    if (options?.native) {
        return SUPABASE_NATIVE_REDIRECT_URL;
    }

    const env = readEnv();
    return env.redirectUrl
        || options?.origin
        || (typeof window !== 'undefined' ? window.location.origin : SUPABASE_NATIVE_REDIRECT_URL);
};

export const isSupabaseNativeAuthCallbackUrl = (url: string): boolean => {
    try {
        const expected = new URL(SUPABASE_NATIVE_REDIRECT_URL);
        const actual = new URL(url);
        return actual.protocol === expected.protocol
            && actual.host === expected.host
            && actual.pathname === expected.pathname;
    } catch {
        return false;
    }
};

export const getSupabaseAuthCodeFromUrl = (url: string): string | null => {
    try {
        return new URL(url).searchParams.get('code');
    } catch {
        return null;
    }
};

const formatSupabaseHost = (url: string): string => {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
};

export const getSupabaseRuntimeState = (): SupabaseRuntimeState => {
    const env = readEnv();

    if (!env.enabled) {
        return {
            ...env,
            status: 'disabled',
            label: 'Supabase off',
            detail: 'Feature flag disabled',
        };
    }

    if (!env.configured) {
        return {
            ...env,
            status: 'missing-config',
            label: 'Supabase on',
            detail: env.missing.length > 0
                ? `Missing: ${env.missing.join(', ')}`
                : 'Missing Supabase environment values',
        };
    }

    return {
        ...env,
        status: 'ready',
        label: 'Supabase on',
        detail: `Configured for ${formatSupabaseHost(env.url)}`,
    };
};

export const getSupabaseClient = (): SupabaseClient | null => {
    const env = readEnv();
    if (!env.configured) {
        return null;
    }

    const cacheKey = `${env.url}::${env.anonKey}`;
    if (!cachedClient || cachedClientKey !== cacheKey) {
        cachedClient = createClient(env.url, env.anonKey, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true,
                flowType: 'pkce',
            },
        });
        cachedClientKey = cacheKey;
    }

    return cachedClient;
};

export const resetSupabaseClientForTests = (): void => {
    cachedClient = null;
    cachedClientKey = null;
};
