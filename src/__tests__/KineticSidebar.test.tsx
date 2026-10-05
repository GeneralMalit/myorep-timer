import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import KineticSidebar from '@/components/kinetic/KineticSidebar';
import type { AccountSnapshot } from '@/types/account';

const baseProps = {
    currentTheme: 'theme-default',
    setTheme: vi.fn(),
    setShowSettings: vi.fn(),
    onOpenProtocolIntel: vi.fn(),
    showSettings: false,
    isCollapsed: false,
    toggleSidebar: vi.fn(),
    appPhase: 'setup' as const,
    savedWorkouts: [],
    onSaveCurrent: vi.fn(),
    onSaveAsCurrent: vi.fn(),
    onLoadWorkout: vi.fn(),
    onRenameWorkout: vi.fn(),
    onDeleteWorkout: vi.fn(),
    onExportLibrary: vi.fn(),
    onImportLibrary: vi.fn(),
    importSummary: null,
    clearImportSummary: vi.fn(),
    savedSessions: [],
    onCreateSession: vi.fn(),
    onLoadSession: vi.fn(),
    onDuplicateSession: vi.fn(),
    onRenameSession: vi.fn(),
    onDeleteSession: vi.fn(),
};

const guestAccount: AccountSnapshot = {
    bootstrapStatus: 'ready',
    mode: 'guest',
    session: null,
    profile: null,
    entitlement: null,
    syncStatus: 'disabled',
    error: null,
    requiresPasswordReset: false,
};

const restoringPlusAccount: AccountSnapshot = {
    ...guestAccount,
    bootstrapStatus: 'bootstrapping',
    mode: 'signed-in-plus',
    entitlement: {
        userId: 'user-1',
        plan: 'plus',
        cloudSyncEnabled: true,
        updatedAt: '2026-03-01T00:00:00.000Z',
        source: 'supabase',
    },
};

describe('KineticSidebar', () => {
    it('does not trust cached Plus state until account restoration finishes', () => {
        const { rerender } = render(
            <KineticSidebar
                {...baseProps}
                account={restoringPlusAccount}
                onSignOut={vi.fn()}
            />,
        );

        const accountRegion = screen.getByRole('region', { name: 'Account' });
        expect(accountRegion).toHaveTextContent(/restoring account/i);
        expect(accountRegion).toHaveTextContent(/\bloading\b/i);
        expect(accountRegion).not.toHaveTextContent(/\bplus\b/i);
        expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();

        rerender(
            <KineticSidebar
                {...baseProps}
                account={{ ...restoringPlusAccount, bootstrapStatus: 'ready' }}
                onSignOut={vi.fn()}
            />,
        );

        expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    });

    it('restores guest auth controls only after account resolution', () => {
        const onToggleAccountCardCollapsed = vi.fn();
        const restoringGuestAccount = { ...guestAccount, bootstrapStatus: 'idle' as const };
        const { rerender } = render(
            <KineticSidebar
                {...baseProps}
                account={restoringGuestAccount}
                onToggleAccountCardCollapsed={onToggleAccountCardCollapsed}
            />,
        );

        const accountRegion = screen.getByRole('region', { name: 'Account' });
        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(accountRegion).toHaveTextContent(/restoring account/i);
        expect(accountRegion).toHaveTextContent(/\bloading\b/i);
        expect(accountRegion).not.toHaveTextContent(/\bguest\b/i);
        expect(screen.queryByRole('button', { name: /sign in with password/i })).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
        expect(onToggleAccountCardCollapsed).not.toHaveBeenCalled();

        rerender(
            <KineticSidebar
                {...baseProps}
                account={guestAccount}
                onToggleAccountCardCollapsed={onToggleAccountCardCollapsed}
            />,
        );

        expect(screen.getByRole('button', { name: /sign in with password/i })).toBeInTheDocument();
        expect(onToggleAccountCardCollapsed).toHaveBeenCalledTimes(1);

    });

    it('does not render the Classic theme selector in the Kinetic Console rail', () => {
        render(<KineticSidebar {...baseProps} />);

        expect(screen.getByTestId('kinetic-sidebar')).toBeInTheDocument();
        expect(screen.queryByText('Themes')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /deep purple|ocean blue|crimson fire|neon forest/i })).not.toBeInTheDocument();
    });
});
