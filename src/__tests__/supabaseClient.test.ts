import { afterEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({
    createClient: createClientMock,
}));

describe('supabase client config', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
        createClientMock.mockReset();
    });

    it('returns null when supabase env vars are missing', async () => {
        const { getSupabaseClient, getSupabaseEnvironment, getSupabaseRuntimeState } = await import('@/lib/supabase');

        expect(getSupabaseEnvironment().enabled).toBe(false);
        expect(getSupabaseEnvironment().configured).toBe(false);
        expect(getSupabaseRuntimeState()).toMatchObject({
            status: 'disabled',
            label: 'Supabase off',
            detail: 'Feature flag disabled',
        });
        expect(getSupabaseClient()).toBeNull();
        expect(createClientMock).not.toHaveBeenCalled();
    });

    it('returns null when the feature flag is disabled even if env vars are present', async () => {
        vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');

        const { getSupabaseClient, getSupabaseEnvironment, getSupabaseRuntimeState } = await import('@/lib/supabase');

        expect(getSupabaseEnvironment()).toMatchObject({
            enabled: false,
            configured: false,
            url: 'https://example.supabase.co',
            anonKey: 'anon-key',
        });
        expect(getSupabaseRuntimeState()).toMatchObject({
            status: 'disabled',
            label: 'Supabase off',
            detail: 'Feature flag disabled',
        });
        expect(getSupabaseClient()).toBeNull();
        expect(createClientMock).not.toHaveBeenCalled();
    });

    it('creates and caches a configured supabase client', async () => {
        vi.stubEnv('VITE_ENABLE_SUPABASE', 'true');
        vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
        vi.stubEnv('VITE_SUPABASE_REDIRECT_URL', 'https://app.example.com');

        const fakeClient = { auth: {} };
        createClientMock.mockReturnValue(fakeClient);

        const { getSupabaseClient, getSupabaseEnvironment, getSupabaseRuntimeState } = await import('@/lib/supabase');

        expect(getSupabaseEnvironment()).toMatchObject({
            enabled: true,
            configured: true,
            url: 'https://example.supabase.co',
            anonKey: 'anon-key',
            redirectUrl: 'https://app.example.com',
        });
        expect(getSupabaseRuntimeState()).toMatchObject({
            status: 'ready',
            label: 'Supabase on',
            detail: 'Configured for example.supabase.co',
        });

        expect(getSupabaseClient()).toBe(fakeClient);
        expect(getSupabaseClient()).toBe(fakeClient);
        expect(createClientMock).toHaveBeenCalledTimes(1);
        expect(createClientMock).toHaveBeenCalledWith('https://example.supabase.co', 'anon-key', expect.any(Object));
    });

    it('selects the native custom-scheme callback when requested', async () => {
        const { getSupabaseAuthRedirectUrl, SUPABASE_NATIVE_REDIRECT_URL } = await import('@/lib/supabase');

        expect(getSupabaseAuthRedirectUrl({ native: true, origin: 'https://app.example.com' })).toBe(SUPABASE_NATIVE_REDIRECT_URL);
    });

    it('prefers the configured web redirect', async () => {
        vi.stubEnv('VITE_ENABLE_SUPABASE', 'true');
        vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
        vi.stubEnv('VITE_SUPABASE_REDIRECT_URL', 'https://app.example.com');

        const { getSupabaseAuthRedirectUrl } = await import('@/lib/supabase');

        expect(getSupabaseAuthRedirectUrl({ origin: 'https://origin.example.com' })).toBe('https://app.example.com');
    });

    it('falls back to the provided origin when no web redirect is configured', async () => {
        vi.stubEnv('VITE_ENABLE_SUPABASE', 'true');
        vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');

        const { getSupabaseAuthRedirectUrl } = await import('@/lib/supabase');

        expect(getSupabaseAuthRedirectUrl({ origin: 'https://origin.example.com' })).toBe('https://origin.example.com');
    });
});
