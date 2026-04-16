import { describe, expect, it } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import {
    buildAccountStateFromSupabaseRows,
    buildAccountProfileFromSession,
    buildDefaultEntitlement,
    canAccessSessionBuilder,
    hasActivePlusEntitlement,
    resolveAccountMode,
} from '@/utils/account';

const session = {
    user: {
        id: 'user-1',
        email: 'athlete@example.com',
        created_at: '2026-03-01T00:00:00.000Z',
        user_metadata: {
            full_name: 'Athlete One',
        },
    },
} as unknown as Session;

describe('account utils', () => {
    it('builds a profile snapshot from a Supabase session', () => {
        const profile = buildAccountProfileFromSession(session);

        expect(profile).toMatchObject({
            userId: 'user-1',
            email: 'athlete@example.com',
            displayName: 'Athlete One',
            createdAt: '2026-03-01T00:00:00.000Z',
        });
        expect(profile.updatedAt).toMatch(/T/);
    });

    it('creates a free default entitlement with sync disabled', () => {
        expect(buildDefaultEntitlement('user-1')).toMatchObject({
            userId: 'user-1',
            plan: 'free',
            cloudSyncEnabled: false,
            source: 'local',
        });
    });

    it('resolves account mode from session and entitlement', () => {
        expect(resolveAccountMode(null, null)).toBe('guest');
        expect(resolveAccountMode(session, buildDefaultEntitlement('user-1'))).toBe('signed-in-free');
        expect(resolveAccountMode(session, {
            userId: 'user-1',
            plan: 'plus',
            cloudSyncEnabled: true,
            updatedAt: '2026-04-01T00:00:00.000Z',
            source: 'supabase',
        })).toBe('signed-in-plus');
        expect(resolveAccountMode(session, {
            userId: 'user-1',
            plan: 'plus',
            cloudSyncEnabled: false,
            updatedAt: '2026-04-02T00:00:00.000Z',
            source: 'supabase',
        })).toBe('signed-in-free');
    });

    it('defaults missing entitlement rows to signed-in-free', () => {
        const resolved = buildAccountStateFromSupabaseRows(
            session,
            null,
            null,
        );

        expect(resolved.mode).toBe('signed-in-free');
        expect(resolved.entitlement).toMatchObject({
            userId: 'user-1',
            plan: 'free',
            cloudSyncEnabled: false,
        });
    });

    it('treats only active Plus entitlements as unlocked feature access', () => {
        expect(hasActivePlusEntitlement(null)).toBe(false);
        expect(canAccessSessionBuilder({
            userId: 'user-1',
            plan: 'plus',
            cloudSyncEnabled: false,
            updatedAt: '2026-04-02T00:00:00.000Z',
            source: 'supabase',
        })).toBe(false);
        expect(canAccessSessionBuilder({
            userId: 'user-1',
            plan: 'plus',
            cloudSyncEnabled: true,
            updatedAt: '2026-04-02T00:00:00.000Z',
            source: 'supabase',
        })).toBe(true);
    });
});
