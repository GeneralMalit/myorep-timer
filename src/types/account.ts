import type { Session } from '@supabase/supabase-js';

export type AccountBootstrapStatus = 'idle' | 'bootstrapping' | 'ready' | 'disabled' | 'error';
export type AccountMode = 'guest' | 'signed-in-free' | 'signed-in-plus';
export type AccountPlan = 'free' | 'plus';
export type AccountSyncStatus = 'disabled' | 'idle' | 'syncing' | 'error';
export type AccountSyncSurfaceStatus =
    | 'sync-off'
    | 'sync-available'
    | 'enable-sync'
    | 'first-sync-required'
    | 'syncing'
    | 'last-synced'
    | 'auth-expired'
    | 'sync-error'
    | 'sync-paused'
    | 'offline';
export type FirstSyncChoice = 'upload-local' | 'replace-local';

export interface AccountActionResult {
    ok: boolean;
    message: string;
}

export interface AccountProfile {
    userId: string;
    email: string | null;
    displayName: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface AccountEntitlement {
    userId: string;
    plan: AccountPlan;
    cloudSyncEnabled: boolean;
    updatedAt: string;
    source: 'local' | 'supabase';
}

export interface AccountResolvedState {
    session: Session | null;
    profile: AccountProfile | null;
    entitlement: AccountEntitlement | null;
    mode: AccountMode;
    syncStatus: AccountSyncStatus;
}

export interface AccountSyncSnapshot {
    status: AccountSyncSurfaceStatus;
    detail?: string | null;
    lastSyncedAt?: string | null;
    lastAttemptedAt?: string | null;
    isOnline?: boolean;
    isPaused?: boolean;
}

export interface AccountSyncActions {
    onEnableSync?: (choice: FirstSyncChoice) => AccountActionResult | void | Promise<AccountActionResult | void>;
    onSyncNow?: () => AccountActionResult | void | Promise<AccountActionResult | void>;
    onRetrySync?: () => AccountActionResult | void | Promise<AccountActionResult | void>;
    onResumeSync?: () => AccountActionResult | void | Promise<AccountActionResult | void>;
    onReauthenticate?: () => AccountActionResult | void | Promise<AccountActionResult | void>;
    onDisableSync?: () => AccountActionResult | void | Promise<AccountActionResult | void>;
}

export interface AccountSnapshot {
    bootstrapStatus: AccountBootstrapStatus;
    mode: AccountMode;
    session: Session | null;
    profile: AccountProfile | null;
    entitlement: AccountEntitlement | null;
    syncStatus: AccountSyncStatus;
    error: string | null;
}
