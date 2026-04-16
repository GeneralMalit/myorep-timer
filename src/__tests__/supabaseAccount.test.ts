import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSupabaseAccountState } from '@/lib/supabaseAccount';

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
        expect(resolved.entitlement?.plan).toBe('plus');
        expect(resolved.entitlement?.cloudSyncEnabled).toBe(true);
    });

    it('surfaces entitlement refresh errors before reading Supabase rows', async () => {
        const client = {
            from: vi.fn(),
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

        await expect(loadSupabaseAccountState(client as never, session as never)).rejects.toThrow(
            'Could not refresh entitlement state.',
        );
        expect(client.from).not.toHaveBeenCalled();
    });
});
