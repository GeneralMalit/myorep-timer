import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccountStore } from '@/store/useAccountStore';

const getSupabaseClientMock = vi.hoisted(() => vi.fn());
const getSupabaseEnvironmentMock = vi.hoisted(() => vi.fn());
const loadSupabaseAccountStateMock = vi.hoisted(() => vi.fn());
const appAddListenerMock = vi.hoisted(() => vi.fn());
const appListenerRemoveMock = vi.hoisted(() => vi.fn());
const appGetLaunchUrlMock = vi.hoisted(() => vi.fn());
const isNativePlatformMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
    getSupabaseClient: getSupabaseClientMock,
    getSupabaseEnvironment: getSupabaseEnvironmentMock,
    isSupabaseNativeAuthCallbackUrl: (url: string) => url.startsWith('com.generalmalit.myoreptimer://auth/callback'),
    getSupabaseAuthCodeFromUrl: (url: string) => new URL(url).searchParams.get('code'),
}));

vi.mock('@/lib/supabaseAccount', () => ({
    loadSupabaseAccountState: loadSupabaseAccountStateMock,
}));

vi.mock('@capacitor/app', () => ({
    App: {
        addListener: appAddListenerMock,
        getLaunchUrl: appGetLaunchUrlMock,
    },
}));

vi.mock('@capacitor/core', () => ({
    Capacitor: {
        isNativePlatform: isNativePlatformMock,
    },
}));

import SupabaseBootstrap from '@/components/SupabaseBootstrap';

const resetAccountState = () => {
    useAccountStore.getState().clearAccountState();
    useAccountStore.setState({
        bootstrapStatus: 'idle',
        mode: 'guest',
        session: null,
        profile: null,
        entitlement: null,
        syncStatus: 'disabled',
        error: null,
    });
};

describe('SupabaseBootstrap', () => {
    beforeEach(() => {
        isNativePlatformMock.mockReturnValue(false);
        appAddListenerMock.mockResolvedValue({
            remove: appListenerRemoveMock,
        });
        appGetLaunchUrlMock.mockResolvedValue({
            url: undefined,
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        getSupabaseClientMock.mockReset();
        getSupabaseEnvironmentMock.mockReset();
        loadSupabaseAccountStateMock.mockReset();
        appAddListenerMock.mockReset();
        appListenerRemoveMock.mockReset();
        appGetLaunchUrlMock.mockReset();
        resetAccountState();
    });

    it('marks supabase as unavailable when no client is configured', async () => {
        vi.stubEnv('VITE_ENABLE_SUPABASE', 'true');
        getSupabaseEnvironmentMock.mockReturnValue({
            enabled: true,
            configured: true,
            url: 'https://example.supabase.co',
            anonKey: 'anon-key',
            redirectUrl: 'https://app.example.com',
            missing: [],
        });
        getSupabaseClientMock.mockReturnValue(null);

        render(<SupabaseBootstrap />);

        await waitFor(() => {
            expect(useAccountStore.getState().bootstrapStatus).toBe('disabled');
            expect(useAccountStore.getState().mode).toBe('guest');
        });
    });

    it('stays inert when the feature flag is disabled', async () => {
        getSupabaseEnvironmentMock.mockReturnValue({
            enabled: false,
            configured: false,
            url: '',
            anonKey: '',
            redirectUrl: null,
            missing: ['VITE_ENABLE_SUPABASE'],
        });
        getSupabaseClientMock.mockReturnValue(null);

        render(<SupabaseBootstrap />);

        await waitFor(() => {
            expect(useAccountStore.getState().bootstrapStatus).toBe('idle');
            expect(useAccountStore.getState().mode).toBe('guest');
        });
        expect(getSupabaseClientMock).not.toHaveBeenCalled();
    });

    it('boots the session and subscribes to auth changes when supabase is configured', async () => {
        vi.stubEnv('VITE_ENABLE_SUPABASE', 'true');
        getSupabaseEnvironmentMock.mockReturnValue({
            enabled: true,
            configured: true,
            url: 'https://example.supabase.co',
            anonKey: 'anon-key',
            redirectUrl: 'https://app.example.com',
            missing: [],
        });
        const session = {
            user: {
                id: 'user-1',
                email: 'athlete@example.com',
                created_at: '2026-03-01T00:00:00.000Z',
                user_metadata: {
                    full_name: 'Athlete One',
                },
            },
        };
        const unsubscribe = vi.fn();
        const client = {
            auth: {
                getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
                onAuthStateChange: vi.fn().mockReturnValue({
                    data: {
                        subscription: {
                            unsubscribe,
                        },
                    },
                }),
            },
        };
        loadSupabaseAccountStateMock.mockResolvedValue({
            session,
            profile: {
                userId: 'user-1',
                email: 'athlete@example.com',
                displayName: 'Athlete One',
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
            },
            entitlement: {
                userId: 'user-1',
                plan: 'free',
                cloudSyncEnabled: false,
                updatedAt: '2026-03-01T00:00:00.000Z',
                source: 'supabase',
            },
            mode: 'signed-in-free',
            syncStatus: 'disabled',
        });

        getSupabaseClientMock.mockReturnValue(client);

        render(<SupabaseBootstrap />);

        await waitFor(() => {
            expect(useAccountStore.getState().bootstrapStatus).toBe('ready');
            expect(useAccountStore.getState().mode).toBe('signed-in-free');
            expect(useAccountStore.getState().profile?.displayName).toBe('Athlete One');
        });

        expect(client.auth.getSession).toHaveBeenCalledTimes(1);
        expect(client.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
        expect(appAddListenerMock).not.toHaveBeenCalled();
        expect(loadSupabaseAccountStateMock).toHaveBeenCalledWith(client, session);
        expect(unsubscribe).not.toHaveBeenCalled();
    });

    it('settles to a guest-ready state when the first session lookup is empty', async () => {
        vi.stubEnv('VITE_ENABLE_SUPABASE', 'true');
        getSupabaseEnvironmentMock.mockReturnValue({
            enabled: true,
            configured: true,
            url: 'https://example.supabase.co',
            anonKey: 'anon-key',
            redirectUrl: 'https://app.example.com',
            missing: [],
        });
        const unsubscribe = vi.fn();
        const client = {
            auth: {
                getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
                onAuthStateChange: vi.fn().mockReturnValue({
                    data: {
                        subscription: {
                            unsubscribe,
                        },
                    },
                }),
            },
        };
        getSupabaseClientMock.mockReturnValue(client);

        render(<SupabaseBootstrap />);

        await waitFor(() => {
            expect(useAccountStore.getState().bootstrapStatus).toBe('ready');
            expect(useAccountStore.getState().mode).toBe('guest');
            expect(useAccountStore.getState().syncStatus).toBe('disabled');
        });

        expect(loadSupabaseAccountStateMock).not.toHaveBeenCalled();
        expect(client.auth.getSession).toHaveBeenCalledTimes(1);
        expect(client.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
        expect(unsubscribe).not.toHaveBeenCalled();
    });

    it('defaults to signed-in-free when the entitlement row is missing', async () => {
        vi.stubEnv('VITE_ENABLE_SUPABASE', 'true');
        getSupabaseEnvironmentMock.mockReturnValue({
            enabled: true,
            configured: true,
            url: 'https://example.supabase.co',
            anonKey: 'anon-key',
            redirectUrl: 'https://app.example.com',
            missing: [],
        });
        const session = {
            user: {
                id: 'user-2',
                email: 'free@example.com',
                created_at: '2026-03-01T00:00:00.000Z',
                user_metadata: {},
            },
        };
        const client = {
            auth: {
                getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
                onAuthStateChange: vi.fn().mockReturnValue({
                    data: {
                        subscription: {
                            unsubscribe: vi.fn(),
                        },
                    },
                }),
            },
        };
        loadSupabaseAccountStateMock.mockResolvedValue({
            session,
            profile: {
                userId: 'user-2',
                email: 'free@example.com',
                displayName: 'free',
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
            },
            entitlement: {
                userId: 'user-2',
                plan: 'free',
                cloudSyncEnabled: false,
                updatedAt: '2026-03-01T00:00:00.000Z',
                source: 'local',
            },
            mode: 'signed-in-free',
            syncStatus: 'disabled',
        });
        getSupabaseClientMock.mockReturnValue(client);

        render(<SupabaseBootstrap />);

        await waitFor(() => {
            expect(useAccountStore.getState().mode).toBe('signed-in-free');
            expect(useAccountStore.getState().entitlement?.plan).toBe('free');
            expect(useAccountStore.getState().entitlement?.cloudSyncEnabled).toBe(false);
        });
    });

    it('surfaces account bootstrap failures without wiping guest-safe local behavior', async () => {
        vi.stubEnv('VITE_ENABLE_SUPABASE', 'true');
        getSupabaseEnvironmentMock.mockReturnValue({
            enabled: true,
            configured: true,
            url: 'https://example.supabase.co',
            anonKey: 'anon-key',
            redirectUrl: 'https://app.example.com',
            missing: [],
        });
        const session = {
            user: {
                id: 'user-3',
                email: 'error@example.com',
                created_at: '2026-03-01T00:00:00.000Z',
                user_metadata: {},
            },
        };
        const client = {
            auth: {
                getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
                onAuthStateChange: vi.fn().mockReturnValue({
                    data: {
                        subscription: {
                            unsubscribe: vi.fn(),
                        },
                    },
                }),
            },
        };
        loadSupabaseAccountStateMock.mockRejectedValue(new Error('Profile fetch failed'));
        getSupabaseClientMock.mockReturnValue(client);

        render(<SupabaseBootstrap />);

        await waitFor(() => {
            expect(useAccountStore.getState().bootstrapStatus).toBe('error');
            expect(useAccountStore.getState().error).toBe('Profile fetch failed');
            expect(useAccountStore.getState().session?.user.email).toBe('error@example.com');
        });
    });

    it('exchanges a native auth callback code and resolves the session state', async () => {
        vi.stubEnv('VITE_ENABLE_SUPABASE', 'true');
        getSupabaseEnvironmentMock.mockReturnValue({
            enabled: true,
            configured: true,
            url: 'https://example.supabase.co',
            anonKey: 'anon-key',
            redirectUrl: 'https://app.example.com',
            missing: [],
        });
        const session = {
            user: {
                id: 'user-4',
                email: 'native@example.com',
                created_at: '2026-03-01T00:00:00.000Z',
                user_metadata: {},
            },
        };
        const exchangeCodeForSession = vi.fn().mockResolvedValue({
            data: { session },
            error: null,
        });
        const client = {
            auth: {
                getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
                onAuthStateChange: vi.fn().mockReturnValue({
                    data: {
                        subscription: {
                            unsubscribe: vi.fn(),
                        },
                    },
                }),
                exchangeCodeForSession,
            },
        };
        loadSupabaseAccountStateMock.mockResolvedValue({
            session,
            profile: {
                userId: 'user-4',
                email: 'native@example.com',
                displayName: 'Native Athlete',
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
            },
            entitlement: {
                userId: 'user-4',
                plan: 'plus',
                cloudSyncEnabled: true,
                updatedAt: '2026-03-01T00:00:00.000Z',
                source: 'supabase',
            },
            mode: 'signed-in-plus',
            syncStatus: 'idle',
        });
        getSupabaseClientMock.mockReturnValue(client);

        isNativePlatformMock.mockReturnValue(true);
        appAddListenerMock.mockResolvedValue({
            remove: appListenerRemoveMock,
        });

        render(<SupabaseBootstrap />);

        await waitFor(() => {
            expect(appAddListenerMock).toHaveBeenCalledWith('appUrlOpen', expect.any(Function));
        });
        expect(appGetLaunchUrlMock).toHaveBeenCalledTimes(1);

        const handler = appAddListenerMock.mock.calls[0]?.[1] as (event: { url: string }) => Promise<void>;
        await handler({
            url: 'com.generalmalit.myoreptimer://auth/callback?code=abc123',
        });

        await waitFor(() => {
            expect(exchangeCodeForSession).toHaveBeenCalledWith('abc123');
            expect(useAccountStore.getState().bootstrapStatus).toBe('ready');
            expect(useAccountStore.getState().mode).toBe('signed-in-plus');
            expect(useAccountStore.getState().profile?.displayName).toBe('Native Athlete');
        });
    });

    it('completes a native auth callback from the launch URL on cold start', async () => {
        vi.stubEnv('VITE_ENABLE_SUPABASE', 'true');
        getSupabaseEnvironmentMock.mockReturnValue({
            enabled: true,
            configured: true,
            url: 'https://example.supabase.co',
            anonKey: 'anon-key',
            redirectUrl: 'https://app.example.com',
            missing: [],
        });
        const session = {
            user: {
                id: 'user-5',
                email: 'coldstart@example.com',
                created_at: '2026-03-01T00:00:00.000Z',
                user_metadata: {},
            },
        };
        const exchangeCodeForSession = vi.fn().mockResolvedValue({
            data: { session },
            error: null,
        });
        const unsubscribe = vi.fn();
        const client = {
            auth: {
                getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
                onAuthStateChange: vi.fn().mockReturnValue({
                    data: {
                        subscription: {
                            unsubscribe,
                        },
                    },
                }),
                exchangeCodeForSession,
            },
        };
        loadSupabaseAccountStateMock.mockResolvedValue({
            session,
            profile: {
                userId: 'user-5',
                email: 'coldstart@example.com',
                displayName: 'Cold Start Athlete',
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
            },
            entitlement: {
                userId: 'user-5',
                plan: 'plus',
                cloudSyncEnabled: true,
                updatedAt: '2026-03-01T00:00:00.000Z',
                source: 'supabase',
            },
            mode: 'signed-in-plus',
            syncStatus: 'idle',
        });
        getSupabaseClientMock.mockReturnValue(client);

        isNativePlatformMock.mockReturnValue(true);
        appGetLaunchUrlMock.mockResolvedValue({
            url: 'com.generalmalit.myoreptimer://auth/callback?code=coldstart123',
        });

        render(<SupabaseBootstrap />);

        await waitFor(() => {
            expect(exchangeCodeForSession).toHaveBeenCalledWith('coldstart123');
            expect(useAccountStore.getState().bootstrapStatus).toBe('ready');
            expect(useAccountStore.getState().mode).toBe('signed-in-plus');
        });

        expect(appAddListenerMock).toHaveBeenCalledWith('appUrlOpen', expect.any(Function));
        expect(useAccountStore.getState().profile?.displayName).toBe('Cold Start Athlete');
        expect(unsubscribe).not.toHaveBeenCalled();
    });

    it('does not exchange the same native auth code twice when launch and app-open URLs match', async () => {
        vi.stubEnv('VITE_ENABLE_SUPABASE', 'true');
        getSupabaseEnvironmentMock.mockReturnValue({
            enabled: true,
            configured: true,
            url: 'https://example.supabase.co',
            anonKey: 'anon-key',
            redirectUrl: 'https://app.example.com',
            missing: [],
        });
        const session = {
            user: {
                id: 'user-6',
                email: 'dedupe@example.com',
                created_at: '2026-03-01T00:00:00.000Z',
                user_metadata: {},
            },
        };
        const exchangeCodeForSession = vi.fn().mockResolvedValue({
            data: { session },
            error: null,
        });
        const client = {
            auth: {
                getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
                onAuthStateChange: vi.fn().mockReturnValue({
                    data: {
                        subscription: {
                            unsubscribe: vi.fn(),
                        },
                    },
                }),
                exchangeCodeForSession,
            },
        };
        loadSupabaseAccountStateMock.mockResolvedValue({
            session,
            profile: {
                userId: 'user-6',
                email: 'dedupe@example.com',
                displayName: 'Dedupe Athlete',
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
            },
            entitlement: {
                userId: 'user-6',
                plan: 'plus',
                cloudSyncEnabled: true,
                updatedAt: '2026-03-01T00:00:00.000Z',
                source: 'supabase',
            },
            mode: 'signed-in-plus',
            syncStatus: 'idle',
        });
        getSupabaseClientMock.mockReturnValue(client);

        isNativePlatformMock.mockReturnValue(true);
        appGetLaunchUrlMock.mockResolvedValue({
            url: 'com.generalmalit.myoreptimer://auth/callback?code=dupeme',
        });

        render(<SupabaseBootstrap />);

        await waitFor(() => {
            expect(appAddListenerMock).toHaveBeenCalledWith('appUrlOpen', expect.any(Function));
            expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
        });

        const handler = appAddListenerMock.mock.calls[0]?.[1] as (event: { url: string }) => Promise<void>;
        await handler({
            url: 'com.generalmalit.myoreptimer://auth/callback?code=dupeme',
        });

        await waitFor(() => {
            expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
        });
    });

    it('removes the native URL listener on unmount', async () => {
        vi.stubEnv('VITE_ENABLE_SUPABASE', 'true');
        getSupabaseEnvironmentMock.mockReturnValue({
            enabled: true,
            configured: true,
            url: 'https://example.supabase.co',
            anonKey: 'anon-key',
            redirectUrl: 'https://app.example.com',
            missing: [],
        });
        const unsubscribe = vi.fn();
        const client = {
            auth: {
                getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
                onAuthStateChange: vi.fn().mockReturnValue({
                    data: {
                        subscription: {
                            unsubscribe,
                        },
                    },
                }),
                exchangeCodeForSession: vi.fn(),
            },
        };
        getSupabaseClientMock.mockReturnValue(client);
        isNativePlatformMock.mockReturnValue(true);

        const { unmount } = render(<SupabaseBootstrap />);

        await waitFor(() => {
            expect(appAddListenerMock).toHaveBeenCalledWith('appUrlOpen', expect.any(Function));
        });

        unmount();

        expect(appListenerRemoveMock).toHaveBeenCalled();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});
