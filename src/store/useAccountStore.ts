import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type {
    AccountBootstrapStatus,
    AccountEntitlement,
    AccountMode,
    AccountProfile,
    AccountResolvedState,
    AccountSyncStatus,
} from '@/types/account';
import {
    buildAccountStateFromSession,
    canAccessCloudSync,
    resolveAccountMode,
} from '@/utils/account';

interface AccountState {
    bootstrapStatus: AccountBootstrapStatus;
    mode: AccountMode;
    session: Session | null;
    profile: AccountProfile | null;
    entitlement: AccountEntitlement | null;
    syncStatus: AccountSyncStatus;
    error: string | null;
    setBootstrapStatus: (status: AccountBootstrapStatus) => void;
    applySession: (session: Session | null) => void;
    applyAccountState: (state: AccountResolvedState) => void;
    setEntitlement: (entitlement: AccountEntitlement | null) => void;
    setSyncStatus: (status: AccountSyncStatus) => void;
    markUnavailable: () => void;
    markError: (message: string) => void;
    clearAccountState: () => void;
}

const initialState = {
    bootstrapStatus: 'idle' as const,
    mode: 'guest' as const,
    session: null as Session | null,
    profile: null as AccountProfile | null,
    entitlement: null as AccountEntitlement | null,
    syncStatus: 'disabled' as const,
    error: null as string | null,
};

export const useAccountStore = create<AccountState>()((set) => ({
    ...initialState,
    setBootstrapStatus: (status) => set({ bootstrapStatus: status }),
    applyAccountState: (state) => set({
        session: state.session,
        profile: state.profile,
        entitlement: state.entitlement,
        mode: state.mode,
        syncStatus: state.syncStatus,
        error: null,
    }),
    applySession: (session) => {
        set(buildAccountStateFromSession(session));
    },
    setEntitlement: (entitlement) => set((state) => ({
        entitlement,
        mode: resolveAccountMode(state.session, entitlement),
        syncStatus: state.session && canAccessCloudSync(entitlement) ? 'idle' : 'disabled',
    })),
    setSyncStatus: (status) => set({ syncStatus: status }),
    markUnavailable: () => set({
        ...initialState,
        bootstrapStatus: 'disabled',
    }),
    markError: (message) => set({
        bootstrapStatus: 'error',
        error: message,
        syncStatus: 'error',
    }),
    clearAccountState: () => set({
        ...initialState,
        bootstrapStatus: 'idle',
    }),
}));
