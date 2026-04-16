import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    openBillingPortal,
    refreshBillingEntitlementState,
    startBillingCheckout,
} from '@/lib/billing';

const getSupabaseClientMock = vi.hoisted(() => vi.fn());
const loadSupabaseAccountStateMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
    getSupabaseClient: getSupabaseClientMock,
}));

vi.mock('@/lib/supabaseAccount', () => ({
    loadSupabaseAccountState: loadSupabaseAccountStateMock,
}));

describe('billing client helpers', () => {
    const originalLocation = window.location;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn());
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: {
                ...originalLocation,
                assign: vi.fn(),
            },
        });
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: originalLocation,
        });
    });

    it('requires a signed-in Supabase session before starting checkout', async () => {
        getSupabaseClientMock.mockReturnValue({
            auth: {
                getSession: vi.fn().mockResolvedValue({
                    data: { session: null },
                    error: null,
                }),
            },
        });

        await expect(startBillingCheckout()).resolves.toMatchObject({
            ok: false,
            message: 'Sign in first to manage Plus billing.',
        });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('requests a billing URL and redirects the browser for portal management', async () => {
        getSupabaseClientMock.mockReturnValue({
            auth: {
                getSession: vi.fn().mockResolvedValue({
                    data: {
                        session: {
                            access_token: 'access-token',
                        },
                    },
                    error: null,
                }),
            },
        });
        vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
            url: 'https://vendors.paddle.com/customer-portal/test_123',
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        }));

        await expect(openBillingPortal()).resolves.toMatchObject({
            ok: true,
            message: 'Redirecting to subscription management.',
        });
        expect(fetch).toHaveBeenCalledWith('/api/paddle/portal', expect.objectContaining({
            method: 'POST',
            headers: {
                Authorization: 'Bearer access-token',
            },
        }));
        expect(window.location.assign).toHaveBeenCalledWith('https://vendors.paddle.com/customer-portal/test_123');
    });

    it('reloads account state after a successful billing round trip', async () => {
        const session = {
            user: {
                id: 'user-1',
            },
        };
        const resolvedState = {
            session,
            profile: {
                userId: 'user-1',
            },
            entitlement: {
                userId: 'user-1',
                plan: 'plus',
                cloudSyncEnabled: true,
                updatedAt: '2026-04-14T00:00:00.000Z',
                source: 'supabase',
            },
            mode: 'signed-in-plus',
            syncStatus: 'idle',
        };

        getSupabaseClientMock.mockReturnValue({
            auth: {
                getSession: vi.fn().mockResolvedValue({
                    data: { session },
                    error: null,
                }),
            },
        });
        loadSupabaseAccountStateMock.mockResolvedValue(resolvedState);

        await expect(refreshBillingEntitlementState()).resolves.toEqual(resolvedState);
        expect(loadSupabaseAccountStateMock).toHaveBeenCalledWith(expect.any(Object), session);
    });
});
