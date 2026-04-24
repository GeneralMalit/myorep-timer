import { describe, expect, it } from 'vitest';
import { buildResolvedEntitlement } from '@/server/entitlements';

describe('entitlement resolution', () => {
    it('defaults to free when no billing account or override exists', () => {
        const resolved = buildResolvedEntitlement({
            userId: 'user-1',
            now: new Date('2026-04-16T10:00:00.000Z'),
        });

        expect(resolved).toMatchObject({
            user_id: 'user-1',
            plan: 'free',
            cloud_sync_enabled: false,
        });
    });

    it('uses billing-derived plus when the subscription is active and no override exists', () => {
        const resolved = buildResolvedEntitlement({
            userId: 'user-1',
            billingAccount: {
                user_id: 'user-1',
                provider: 'paddle',
                paddle_customer_id: 'ctm_123',
                paddle_subscription_id: 'sub_123',
                paddle_price_id: 'pri_123',
                subscription_status: 'active',
                current_period_end: null,
                last_event_id: null,
                last_event_occurred_at: null,
                created_at: '2026-04-01T00:00:00.000Z',
                updated_at: '2026-04-16T00:00:00.000Z',
            },
        });

        expect(resolved).toMatchObject({
            user_id: 'user-1',
            plan: 'plus',
            cloud_sync_enabled: true,
        });
    });

    it('lets an active plus override win over a free billing state', () => {
        const resolved = buildResolvedEntitlement({
            userId: 'user-1',
            billingAccount: {
                user_id: 'user-1',
                provider: 'paddle',
                paddle_customer_id: null,
                paddle_subscription_id: null,
                paddle_price_id: null,
                subscription_status: 'inactive',
                current_period_end: null,
                last_event_id: null,
                last_event_occurred_at: null,
                created_at: '2026-04-01T00:00:00.000Z',
                updated_at: '2026-04-16T00:00:00.000Z',
            },
            override: {
                user_id: 'user-1',
                plan: 'plus',
                cloud_sync_enabled: true,
                reason: 'phase7 testing',
                granted_by_email: 'generalmalit07@gmail.com',
                expires_at: '2026-05-01T00:00:00.000Z',
                created_at: '2026-04-16T00:00:00.000Z',
                updated_at: '2026-04-16T00:00:00.000Z',
            },
            now: new Date('2026-04-16T10:00:00.000Z'),
        });

        expect(resolved).toMatchObject({
            user_id: 'user-1',
            plan: 'plus',
            cloud_sync_enabled: true,
        });
    });

    it('lets an active free override relock a paid plus entitlement', () => {
        const resolved = buildResolvedEntitlement({
            userId: 'user-1',
            billingAccount: {
                user_id: 'user-1',
                provider: 'paddle',
                paddle_customer_id: 'ctm_123',
                paddle_subscription_id: 'sub_123',
                paddle_price_id: 'pri_123',
                subscription_status: 'active',
                current_period_end: null,
                last_event_id: null,
                last_event_occurred_at: null,
                created_at: '2026-04-01T00:00:00.000Z',
                updated_at: '2026-04-16T00:00:00.000Z',
            },
            override: {
                user_id: 'user-1',
                plan: 'free',
                cloud_sync_enabled: false,
                reason: 'phase7 relock testing',
                granted_by_email: 'generalmalit07@gmail.com',
                expires_at: null,
                created_at: '2026-04-16T00:00:00.000Z',
                updated_at: '2026-04-16T00:00:00.000Z',
            },
        });

        expect(resolved).toMatchObject({
            user_id: 'user-1',
            plan: 'free',
            cloud_sync_enabled: false,
        });
    });

    it('ignores expired overrides and falls back to billing state', () => {
        const resolved = buildResolvedEntitlement({
            userId: 'user-1',
            billingAccount: {
                user_id: 'user-1',
                provider: 'paddle',
                paddle_customer_id: null,
                paddle_subscription_id: null,
                paddle_price_id: null,
                subscription_status: 'inactive',
                current_period_end: null,
                last_event_id: null,
                last_event_occurred_at: null,
                created_at: '2026-04-01T00:00:00.000Z',
                updated_at: '2026-04-16T00:00:00.000Z',
            },
            override: {
                user_id: 'user-1',
                plan: 'plus',
                cloud_sync_enabled: true,
                reason: 'expired test',
                granted_by_email: 'generalmalit07@gmail.com',
                expires_at: '2026-04-15T23:59:59.000Z',
                created_at: '2026-04-16T00:00:00.000Z',
                updated_at: '2026-04-16T00:00:00.000Z',
            },
            now: new Date('2026-04-16T10:00:00.000Z'),
        });

        expect(resolved).toMatchObject({
            user_id: 'user-1',
            plan: 'free',
            cloud_sync_enabled: false,
        });
    });
});
