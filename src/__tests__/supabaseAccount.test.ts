import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    loadSupabaseAccountState,
    resendSupabaseSignUpConfirmation,
    sendSupabasePasswordReset,
    signInSupabaseWithPassword,
    signUpSupabaseWithPassword,
    updateSupabaseUsername,
    updateSupabasePassword,
} from '@/lib/supabaseAccount';

describe('supabaseAccount', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    it('refreshes the resolved entitlement before reading account rows', async () => {
        const maybeSingleProfile = vi.fn().mockResolvedValue({
                data: {
                    id: 'user-1',
                    email: 'athlete@example.com',
                    username: 'athlete_one',
                    display_name: 'Athlete',
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-16T00:00:00.000Z',
            },
            error: null,
        });
        const maybeSingleEntitlement = vi.fn().mockResolvedValue({
            data: {
                user_id: 'user-1',
                plan: 'plus',
                cloud_sync_enabled: true,
                updated_at: '2026-04-16T00:00:00.000Z',
            },
            error: null,
        });
        const client = {
            from: vi.fn((table: string) => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: table === 'profiles' ? maybeSingleProfile : maybeSingleEntitlement,
                    })),
                })),
            })),
        };
        const session = {
            access_token: 'access-token',
            user: {
                id: 'user-1',
                email: 'athlete@example.com',
                created_at: '2026-04-01T00:00:00.000Z',
                user_metadata: {},
            },
        };

        fetchMock.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({}),
        });

        const resolved = await loadSupabaseAccountState(client as never, session as never);

        expect(fetchMock).toHaveBeenCalledWith('/api/account/refresh-entitlement', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer access-token',
            },
        });
        expect(resolved.mode).toBe('signed-in-plus');
        expect(resolved.profile?.username).toBe('athlete_one');
        expect(resolved.entitlement?.plan).toBe('plus');
        expect(resolved.entitlement?.cloudSyncEnabled).toBe(true);
    });

    it('uses the refreshed entitlement payload when the row read is still missing', async () => {
        const maybeSingleProfile = vi.fn().mockResolvedValue({
            data: {
                id: 'user-1',
                email: 'athlete@example.com',
                username: 'athlete_one',
                display_name: 'Athlete',
                created_at: '2026-04-01T00:00:00.000Z',
                updated_at: '2026-04-16T00:00:00.000Z',
            },
            error: null,
        });
        const maybeSingleEntitlement = vi.fn().mockResolvedValue({
            data: null,
            error: null,
        });
        const client = {
            from: vi.fn((table: string) => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: table === 'profiles' ? maybeSingleProfile : maybeSingleEntitlement,
                    })),
                })),
            })),
        };
        const session = {
            access_token: 'access-token',
            user: {
                id: 'user-1',
                email: 'athlete@example.com',
                created_at: '2026-04-01T00:00:00.000Z',
                user_metadata: {},
            },
        };

        fetchMock.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({
                entitlement: {
                    user_id: 'user-1',
                    plan: 'plus',
                    cloud_sync_enabled: true,
                    updated_at: '2026-04-16T00:00:00.000Z',
                },
            }),
        });

        const resolved = await loadSupabaseAccountState(client as never, session as never);

        expect(resolved.mode).toBe('signed-in-plus');
        expect(resolved.entitlement?.plan).toBe('plus');
        expect(resolved.entitlement?.cloudSyncEnabled).toBe(true);
    });

    it('falls back to the persisted entitlement row when refresh fails', async () => {
        const maybeSingleProfile = vi.fn().mockResolvedValue({
            data: {
                id: 'user-1',
                email: 'athlete@example.com',
                username: 'athlete_one',
                display_name: 'Athlete',
                created_at: '2026-04-01T00:00:00.000Z',
                updated_at: '2026-04-16T00:00:00.000Z',
            },
            error: null,
        });
        const maybeSingleEntitlement = vi.fn().mockResolvedValue({
            data: {
                user_id: 'user-1',
                plan: 'plus',
                cloud_sync_enabled: true,
                updated_at: '2026-04-16T00:00:00.000Z',
            },
            error: null,
        });
        const client = {
            from: vi.fn((table: string) => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: table === 'profiles' ? maybeSingleProfile : maybeSingleEntitlement,
                    })),
                })),
            })),
        };
        const session = {
            access_token: 'access-token',
            user: {
                id: 'user-1',
                email: 'athlete@example.com',
                created_at: '2026-04-01T00:00:00.000Z',
                user_metadata: {},
            },
        };

        fetchMock.mockResolvedValue({
            ok: false,
            status: 500,
            json: vi.fn().mockResolvedValue({
                error: 'Could not refresh entitlement state.',
            }),
        });

        const resolved = await loadSupabaseAccountState(client as never, session as never);

        expect(client.from).toHaveBeenCalledTimes(2);
        expect(resolved.mode).toBe('signed-in-plus');
        expect(resolved.entitlement?.plan).toBe('plus');
        expect(resolved.entitlement?.cloudSyncEnabled).toBe(true);
    });

    it('signs in with password through Supabase auth', async () => {
        const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
        const client = {
            auth: {
                signInWithPassword,
            },
        };

        const result = await signInSupabaseWithPassword(client as never, ' athlete@example.com ', 'very-secure-pass');

        expect(signInWithPassword).toHaveBeenCalledWith({
            email: 'athlete@example.com',
            password: 'very-secure-pass',
        });
        expect(result).toEqual({ ok: true });
    });

    it('creates a password account through Supabase sign-up and requires email verification before login', async () => {
        const signUp = vi.fn().mockResolvedValue({
            data: { session: null },
            error: null,
        });
        const client = {
            auth: {
                signUp,
                signOut: vi.fn(),
            },
        };

        fetchMock.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ ok: true }),
        });

        const result = await signUpSupabaseWithPassword(
            client as never,
            'athlete_one',
            ' athlete@example.com ',
            'very-secure-pass',
            'https://app.example.com/auth/callback',
        );

        expect(fetchMock).toHaveBeenCalledWith('/api/account/password-signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: 'athlete_one',
                email: 'athlete@example.com',
            }),
        });
        expect(signUp).toHaveBeenCalledWith({
            email: 'athlete@example.com',
            password: 'very-secure-pass',
            options: {
                emailRedirectTo: 'https://app.example.com/auth/callback',
                data: {
                    username: 'athlete_one',
                },
            },
        });
        expect(result).toEqual({ ok: true, requiresEmailVerification: true });
    });

    it('resends the signup confirmation email through Supabase auth', async () => {
        const resend = vi.fn().mockResolvedValue({ error: null });
        const client = {
            auth: {
                resend,
            },
        };

        const result = await resendSupabaseSignUpConfirmation(
            client as never,
            ' athlete@example.com ',
            'https://app.example.com/auth/callback',
        );

        expect(resend).toHaveBeenCalledWith({
            type: 'signup',
            email: 'athlete@example.com',
            options: {
                emailRedirectTo: 'https://app.example.com/auth/callback',
            },
        });
        expect(result).toEqual({ ok: true });
    });

    it('updates the current username through the trusted profile endpoint', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({}),
        });

        const result = await updateSupabaseUsername({
            access_token: 'access-token',
            user: {
                id: 'user-1',
            },
        } as never, 'Athlete One');

        expect(fetchMock).toHaveBeenCalledWith('/api/account/update-profile', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer access-token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: 'athlete_one',
            }),
        });
        expect(result).toEqual({ ok: true });
    });

    it('sends password reset emails through Supabase auth', async () => {
        const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
        const client = {
            auth: {
                resetPasswordForEmail,
            },
        };

        const result = await sendSupabasePasswordReset(
            client as never,
            ' athlete@example.com ',
            'https://app.example.com/reset',
        );

        expect(resetPasswordForEmail).toHaveBeenCalledWith('athlete@example.com', {
            redirectTo: 'https://app.example.com/reset',
        });
        expect(result).toEqual({ ok: true });
    });

    it('updates the current user password through Supabase auth', async () => {
        const updateUser = vi.fn().mockResolvedValue({ error: null });
        const client = {
            auth: {
                updateUser,
            },
        };

        const result = await updateSupabasePassword(client as never, ' very-secure-pass ');

        expect(updateUser).toHaveBeenCalledWith({
            password: 'very-secure-pass',
        });
        expect(result).toEqual({ ok: true });
    });
});
