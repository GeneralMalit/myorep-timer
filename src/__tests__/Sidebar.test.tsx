import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Sidebar from '@/components/Sidebar';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import type { SidebarProps } from '@/components/Sidebar';
import type { AccountSnapshot } from '@/types/account';
import type { SavedLibraryImportSummary } from '@/types/savedLibrary';
import { SavedWorkout } from '@/types/savedWorkouts';
import { SavedSession } from '@/types/savedSessions';

const baseWorkout: SavedWorkout = {
    id: 'w-1',
    name: 'Push Day',
    sets: '3',
    reps: '12',
    seconds: '3',
    rest: '20',
    myoReps: '4',
    myoWorkSecs: '2',
    timesUsed: 2,
    lastUsedAt: '2026-03-01T00:00:00.000Z',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
};

const baseSession: SavedSession = {
    id: 's-1',
    name: 'Push Session',
    nodes: [
        {
            id: 'n-1',
            type: 'workout',
            name: 'Push Set',
            config: {
                sets: '2',
                reps: '10',
                seconds: '3',
                rest: '20',
                myoReps: '4',
                myoWorkSecs: '2',
            },
            sourceWorkoutId: null,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
        },
    ],
    timesUsed: 0,
    lastUsedAt: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
};

const baseProps = {
    currentTheme: 'theme-default',
    setTheme: vi.fn(),
    setShowSettings: vi.fn(),
    onOpenProtocolIntel: vi.fn(),
    showSettings: false,
    isCollapsed: false,
    toggleSidebar: vi.fn(),
    appPhase: 'setup' as const,
    savedWorkouts: [baseWorkout],
    onSaveCurrent: vi.fn(),
    onSaveAsCurrent: vi.fn(),
    onLoadWorkout: vi.fn(),
    onRenameWorkout: vi.fn(),
    onDeleteWorkout: vi.fn(),
    onExportLibrary: vi.fn(),
    onImportLibrary: vi.fn(),
    importSummary: null,
    clearImportSummary: vi.fn(),
    savedSessions: [baseSession],
    onCreateSession: vi.fn(),
    onLoadSession: vi.fn(),
    onDuplicateSession: vi.fn(),
    onRenameSession: vi.fn(),
    onDeleteSession: vi.fn(),
    onUpgradeToPlus: vi.fn().mockResolvedValue({
        ok: true,
        message: 'Redirecting to secure checkout.',
    }),
    onManageSubscription: vi.fn().mockResolvedValue({
        ok: true,
        message: 'Redirecting to subscription management.',
    }),
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

const signedInFreeAccount: AccountSnapshot = {
    bootstrapStatus: 'ready',
    mode: 'signed-in-free',
    session: {
        user: {
            id: 'user-1',
            email: 'athlete@example.com',
        },
    } as AccountSnapshot['session'],
    profile: {
        userId: 'user-1',
        username: 'athlete_one',
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
    syncStatus: 'disabled',
    error: null,
    requiresPasswordReset: false,
};

const signedInPlusAccount: AccountSnapshot = {
    ...signedInFreeAccount,
    mode: 'signed-in-plus',
    entitlement: {
        userId: 'user-1',
        plan: 'plus',
        cloudSyncEnabled: true,
        updatedAt: '2026-03-01T00:00:00.000Z',
        source: 'supabase',
    },
    syncStatus: 'idle',
};

const errorAccount: AccountSnapshot = {
    ...guestAccount,
    bootstrapStatus: 'error',
    error: 'Account bootstrap failed.',
    syncStatus: 'error',
};

const bootstrappingAccount: AccountSnapshot = {
    bootstrapStatus: 'bootstrapping',
    mode: 'guest',
    session: null,
    profile: null,
    entitlement: null,
    syncStatus: 'syncing',
    error: null,
    requiresPasswordReset: false,
};

const disabledAccount: AccountSnapshot = {
    ...guestAccount,
    bootstrapStatus: 'disabled',
};

const renderMobileSidebar = (props: Partial<SidebarProps> = {}) => {
    return render(
        <Sidebar
            {...baseProps}
            {...props}
            isMobileViewport
        />,
    );
};

describe('Sidebar', () => {
    beforeEach(() => {
        useWorkoutStore.setState((state) => ({
            settings: {
                ...state.settings,
                prepTime: 5,
            },
        }));
    });

    it('renders saved workouts and saved sessions and triggers actions', () => {
        render(<Sidebar {...baseProps} />);

        expect(screen.getByText('Saved Workouts')).toBeInTheDocument();
        expect(screen.getByText('Saved Sessions')).toBeInTheDocument();
        expect(screen.getByText('Push Day')).toBeInTheDocument();
        expect(screen.getByText('Push Session')).toBeInTheDocument();
        expect(screen.getByText('1:03')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
        fireEvent.click(screen.getByRole('button', { name: /^save as$/i }));
        fireEvent.click(screen.getByRole('button', { name: /export/i }));

        fireEvent.click(screen.getByTitle('Load'));
        fireEvent.click(screen.getByTitle('Rename'));
        fireEvent.click(screen.getByTitle('Delete'));

        expect(baseProps.onSaveCurrent).toHaveBeenCalled();
        expect(baseProps.onSaveAsCurrent).toHaveBeenCalled();
        expect(baseProps.onExportLibrary).toHaveBeenCalled();
        expect(baseProps.onLoadWorkout).toHaveBeenCalledWith('w-1');
        expect(baseProps.onRenameWorkout).toHaveBeenCalledWith('w-1');
        expect(baseProps.onDeleteWorkout).toHaveBeenCalledWith('w-1');
    });

    it('disables setup-only actions during timer mode and handles file import', async () => {
        const onImportLibrary = vi.fn();
        const importSummary: SavedLibraryImportSummary = {
            workouts: { imported: 1, renamed: 0, skipped: 0 },
            sessions: { imported: 0, renamed: 0, skipped: 0 },
            errors: [],
        };

        render(
            <Sidebar
                {...baseProps}
                appPhase="timer"
                onImportLibrary={onImportLibrary}
                importSummary={importSummary}
                savedSessions={[]}
            />,
        );

        expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /import/i })).toBeDisabled();
        expect(screen.getByTitle('Load')).toBeDisabled();

        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        const file = new File([
            JSON.stringify({ schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z', workouts: [] }),
        ], 'workouts.json', { type: 'application/json' });

        fireEvent.change(fileInput, { target: { files: [file] } });

        await waitFor(() => {
            expect(onImportLibrary).toHaveBeenCalled();
        });

        expect(screen.getByText(/Workouts: 1 imported/i)).toBeInTheDocument();
    });

    it('renders collapsed mode', () => {
        render(
            <Sidebar
                {...baseProps}
                isCollapsed
                savedWorkouts={[]}
                savedSessions={[]}
            />,
        );

        expect(screen.queryByText('Saved Workouts')).not.toBeInTheDocument();
        expect(screen.queryByText('Saved Sessions')).not.toBeInTheDocument();
        expect(screen.queryByText(/sign in for cloud sync/i)).not.toBeInTheDocument();
        expect(document.querySelector('input[type="file"]')).toBeNull();
    });

    it('keeps the guest account card readable in the narrow mobile drawer', () => {
        renderMobileSidebar({
            account: guestAccount,
            onResendSignUpConfirmation: vi.fn(),
        });

        const sidebar = screen.getByRole('complementary', { name: /sidebar/i });
        expect(sidebar.className).toContain('w-[min(22rem,calc(100vw-1rem))]');
        expect(screen.getByText(/sign in for cloud sync/i)).toBeInTheDocument();
        expect(screen.getByText(/^information$/i)).toBeInTheDocument();
        expect(screen.queryByText(/library \/ mobile drawer/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /sign in with password/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /resend confirmation link/i })).toBeInTheDocument();
    });

    it('supports password sign-in as the default guest flow', async () => {
        const onSignInWithPassword = vi.fn().mockResolvedValue({
            ok: true,
            message: 'Signed in with password.',
        });

        render(
            <Sidebar
                {...baseProps}
                account={guestAccount}
                onSignInWithPassword={onSignInWithPassword}
            />,
        );

        expect(screen.getByRole('button', { name: /sign in with password/i })).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText(/email/i), {
            target: { value: 'athlete@example.com' },
        });
        fireEvent.change(screen.getByLabelText(/^password$/i), {
            target: { value: 'very-secure-pass' },
        });
        fireEvent.click(screen.getByRole('button', { name: /sign in with password/i }));

        await waitFor(() => {
            expect(onSignInWithPassword).toHaveBeenCalledWith('athlete@example.com', 'very-secure-pass');
        });
        expect(screen.getByText(/signed in with password/i)).toBeInTheDocument();
    });

    it('supports password sign-up and shows confirmation-link success messaging', async () => {
        const onSignUpWithPassword = vi.fn().mockResolvedValue({
            ok: true,
            message: 'Account created. Check your email for the confirmation magic link before signing in with your password.',
        });

        render(
            <Sidebar
                {...baseProps}
                account={guestAccount}
                onSignUpWithPassword={onSignUpWithPassword}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
        fireEvent.change(screen.getByLabelText(/username/i), {
            target: { value: 'athlete_one' },
        });
        fireEvent.change(screen.getByLabelText(/email/i), {
            target: { value: 'athlete@example.com' },
        });
        fireEvent.change(screen.getByLabelText(/^password$/i), {
            target: { value: 'very-secure-pass' },
        });
        fireEvent.change(screen.getByLabelText(/confirm password/i), {
            target: { value: 'very-secure-pass' },
        });
        fireEvent.click(screen.getByRole('button', { name: /create account/i }));

        await waitFor(() => {
            expect(onSignUpWithPassword).toHaveBeenCalledWith('athlete_one', 'athlete@example.com', 'very-secure-pass');
        });
        expect(screen.getByText(/check your email for the confirmation magic link/i)).toBeInTheDocument();
    });

    it('resends the signup confirmation link from the guest account card', async () => {
        const onResendSignUpConfirmation = vi.fn().mockResolvedValue({
            ok: true,
            message: 'Confirmation magic link sent to athlete@example.com.',
        });

        render(
            <Sidebar
                {...baseProps}
                account={guestAccount}
                onResendSignUpConfirmation={onResendSignUpConfirmation}
            />,
        );

        fireEvent.change(screen.getByLabelText(/email/i), {
            target: { value: 'athlete@example.com' },
        });
        fireEvent.click(screen.getByRole('button', { name: /resend confirmation link/i }));

        await waitFor(() => {
            expect(onResendSignUpConfirmation).toHaveBeenCalledWith('athlete@example.com');
        });
        expect(screen.getByText(/confirmation magic link sent to athlete@example.com/i)).toBeInTheDocument();
    });

    it('supports forgot-password as a fallback auth path', async () => {
        const onSendPasswordReset = vi.fn().mockResolvedValue({
            ok: true,
            message: 'Password reset sent to athlete@example.com.',
        });

        render(
            <Sidebar
                {...baseProps}
                account={guestAccount}
                onSendPasswordReset={onSendPasswordReset}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /forgot password/i }));
        fireEvent.change(screen.getByLabelText(/email/i), {
            target: { value: 'athlete@example.com' },
        });
        fireEvent.click(screen.getByRole('button', { name: /send reset email/i }));

        await waitFor(() => {
            expect(onSendPasswordReset).toHaveBeenCalledWith('athlete@example.com');
        });
        expect(screen.getByText(/password reset sent to athlete@example.com/i)).toBeInTheDocument();
    });

    it('shows the password recovery form when recovery mode is active', async () => {
        const onUpdatePassword = vi.fn().mockResolvedValue({
            ok: true,
            message: 'Password updated.',
        });

        render(
            <Sidebar
                {...baseProps}
                account={{
                    ...guestAccount,
                    requiresPasswordReset: true,
                }}
                onUpdatePassword={onUpdatePassword}
            />,
        );

        expect(screen.getByText(/^set a new password$/i)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText(/new password/i), {
            target: { value: 'very-secure-pass' },
        });
        fireEvent.change(screen.getByLabelText(/confirm password/i), {
            target: { value: 'very-secure-pass' },
        });
        fireEvent.click(screen.getByRole('button', { name: /update password/i }));

        await waitFor(() => {
            expect(onUpdatePassword).toHaveBeenCalledWith('very-secure-pass');
        });
        expect(screen.getByText(/password updated/i)).toBeInTheDocument();
    });

    it('renders a signed-in free account card and signs out without affecting other sidebar actions', async () => {
        const onSignOut = vi.fn().mockResolvedValue({
            ok: true,
            message: 'Signed out.',
        });

        render(
            <Sidebar
                {...baseProps}
                account={signedInFreeAccount}
                onSignOut={onSignOut}
                canAccessSessionBuilder={false}
            />,
        );

        expect(screen.getByText(/@athlete_one/i)).toBeInTheDocument();
        expect(screen.getByText(/free \| athlete@example.com/i)).toBeInTheDocument();
        expect(screen.queryByText(/your public handle stays lowercase and unique/i)).not.toBeInTheDocument();
        expect(screen.getByText(/cloud sync locked/i)).toBeInTheDocument();
        expect(screen.getByText(/session builder is part of plus/i)).toBeInTheDocument();
        fireEvent.click(screen.getAllByRole('button', { name: /upgrade to plus/i })[0]);

        await waitFor(() => {
            expect(baseProps.onUpgradeToPlus).toHaveBeenCalledTimes(1);
        });

        fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

        await waitFor(() => {
            expect(onSignOut).toHaveBeenCalledTimes(1);
        });
        expect(screen.getByText(/signed out\./i)).toBeInTheDocument();

        fireEvent.click(screen.getByTitle('Load'));
        expect(baseProps.onLoadWorkout).toHaveBeenCalledWith('w-1');
    });

    it('keeps signed-in account actions reachable in the narrow mobile drawer', async () => {
        const onSignOut = vi.fn().mockResolvedValue({
            ok: true,
            message: 'Signed out.',
        });

        const { rerender } = render(
            <Sidebar
                {...baseProps}
                isMobileViewport
                account={signedInFreeAccount}
                onSignOut={onSignOut}
                canAccessSessionBuilder={false}
            />,
        );

        const sidebar = screen.getByRole('complementary', { name: /sidebar/i });
        expect(sidebar.className).toContain('w-[min(22rem,calc(100vw-1rem))]');
        expect(screen.getByText(/cloud sync locked/i)).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /upgrade to plus/i }).length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled();

        fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

        await waitFor(() => {
            expect(onSignOut).toHaveBeenCalledTimes(1);
        });

        rerender(
            <Sidebar
                {...baseProps}
                isMobileViewport
                account={signedInPlusAccount}
                onSignOut={onSignOut}
            />,
        );

        expect(screen.getByText(/cloud sync available/i)).toBeInTheDocument();
        expect(screen.getByText(/@athlete_one/i)).toBeInTheDocument();
        expect(screen.getByText(/plus \| athlete@example.com/i)).toBeInTheDocument();
        expect(screen.queryByText(/your public handle stays lowercase and unique/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /manage subscription/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled();
    });

    it('lets signed-in users collapse the account card while keeping guest auth expanded', () => {
        const { rerender } = render(
            <Sidebar
                {...baseProps}
                account={signedInFreeAccount}
                isAccountCardCollapsed
                onToggleAccountCardCollapsed={vi.fn()}
            />,
        );

        expect(screen.getByRole('button', { name: /show/i })).toBeInTheDocument();
        expect(screen.queryByText(/cloud sync locked/i)).not.toBeInTheDocument();
        expect(screen.getByText(/signed in - athlete_one/i)).toBeInTheDocument();
        expect(screen.getByText(/^free$/i)).toBeInTheDocument();

        rerender(
            <Sidebar
                {...baseProps}
                account={guestAccount}
                isAccountCardCollapsed
                onToggleAccountCardCollapsed={vi.fn()}
            />,
        );

        expect(screen.getByText(/sign in for cloud sync/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /show/i })).not.toBeInTheDocument();
    });

    it('renders signed-in plus and error account states clearly', () => {
        const { rerender } = render(
            <Sidebar
                {...baseProps}
                account={signedInPlusAccount}
                onSignOut={vi.fn()}
            />,
        );

        expect(screen.getByText(/cloud sync available/i)).toBeInTheDocument();
        expect(screen.getByText(/^@athlete_one$/i)).toBeInTheDocument();
        expect(screen.getByText(/plus \| athlete@example.com/i)).toBeInTheDocument();
        expect(screen.queryByText(/your public handle stays lowercase and unique/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /manage subscription/i })).toBeInTheDocument();

        rerender(
            <Sidebar
                {...baseProps}
                account={errorAccount}
            />,
        );

        expect(screen.getByText(/account error/i)).toBeInTheDocument();
        expect(screen.getByText(/account bootstrap failed/i)).toBeInTheDocument();
        expect(screen.getByText(/sync unavailable/i)).toBeInTheDocument();
    });

    it('keeps sync status controls readable in the narrow mobile drawer', async () => {
        const onSyncNow = vi.fn().mockResolvedValue({
            ok: true,
            message: 'Synced now.',
        });

        const { rerender } = render(
            <Sidebar
                {...baseProps}
                isMobileViewport
                account={signedInPlusAccount}
                syncSnapshot={{
                    status: 'last-synced',
                    detail: 'Cloud sync is on for this device.',
                    lastSyncedAt: '2026-03-02T10:00:00.000Z',
                    isOnline: true,
                }}
                syncActions={{ onSyncNow }}
            />,
        );

        expect(screen.getAllByText(/^last synced$/i).length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /sync now/i }));

        await waitFor(() => {
            expect(onSyncNow).toHaveBeenCalledTimes(1);
        });

        rerender(
            <Sidebar
                {...baseProps}
                isMobileViewport
                account={signedInPlusAccount}
                syncSnapshot={{
                    status: 'syncing',
                    detail: 'Syncing changes now.',
                    isOnline: true,
                }}
                syncActions={{ onSyncNow }}
            />,
        );

        expect(screen.getAllByText(/^syncing$/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/syncing changes now/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^syncing$/i })).toBeDisabled();
    });

    it('uses the manual sync action once cloud sync is already enabled and does not open the first-sync chooser', async () => {
        const onSyncNow = vi.fn().mockResolvedValue({
            ok: true,
            message: 'Synced now.',
        });

        render(
            <Sidebar
                {...baseProps}
                account={signedInPlusAccount}
                syncSnapshot={{
                    status: 'last-synced',
                    detail: 'Cloud sync is on for this device.',
                    lastSyncedAt: '2026-03-02T10:00:00.000Z',
                    isOnline: true,
                }}
                syncActions={{ onSyncNow }}
                onSignOut={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /sync now/i }));

        await waitFor(() => {
            expect(onSyncNow).toHaveBeenCalledTimes(1);
        });

        expect(screen.queryByRole('dialog', { name: /choose first sync direction/i })).not.toBeInTheDocument();
        expect(screen.getByText(/synced now\./i)).toBeInTheDocument();
    });

    it.each([
        ['enable-sync', /enable sync/i, 'Cloud sync is available on Plus, but it stays off until you enable it on this device.'],
        ['first-sync-required', /run first sync/i, 'Pick whether this device uploads its local library or replaces it with cloud data.'],
    ])('opens a first-sync chooser when %s is the active sync state', async (status, trigger, detail) => {
        const onEnableSync = vi.fn().mockImplementation((choice?: FirstSyncChoice) => (
            choice
                ? {
                    ok: true,
                    message: 'This device uploaded its local library to cloud sync.',
                }
                : {
                    ok: false,
                    message: 'Choose whether this device uploads its local library or replaces it with cloud data.',
                    requiresChoice: true,
                }
        ));

        render(
            <Sidebar
                {...baseProps}
                account={signedInPlusAccount}
                syncSnapshot={{
                    status: status as 'enable-sync' | 'first-sync-required',
                    detail,
                    isOnline: true,
                }}
                syncActions={{ onEnableSync }}
                onSignOut={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: trigger }));
        await waitFor(() => {
            expect(screen.getByRole('dialog', { name: /choose first sync direction/i })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /upload local to cloud/i }));

        await waitFor(() => {
            expect(onEnableSync).toHaveBeenCalledWith('upload-local');
        });
        expect(screen.getByText(/uploaded its local library to cloud sync/i)).toBeInTheDocument();
    });

    it('keeps empty enable states chooser-free when sync can resolve without a first-sync decision', () => {
        render(
            <Sidebar
                {...baseProps}
                account={signedInPlusAccount}
                syncSnapshot={{
                    status: 'sync-available',
                    detail: 'Cloud sync is available and ready to switch on.',
                    isOnline: true,
                }}
                syncActions={{ onEnableSync: vi.fn() }}
                onSignOut={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /enable sync/i }));

        expect(screen.queryByRole('dialog', { name: /choose first sync direction/i })).not.toBeInTheDocument();
    });

    it('confirms turning sync off before calling the disable action', async () => {
        const onDisableSync = vi.fn().mockResolvedValue({
            ok: true,
            message: 'Cloud sync turned off for this device.',
        });

        render(
            <Sidebar
                {...baseProps}
                account={signedInPlusAccount}
                syncSnapshot={{
                    status: 'last-synced',
                    detail: 'Cloud sync is on for this device.',
                    lastSyncedAt: '2026-03-02T10:00:00.000Z',
                    isOnline: true,
                }}
                syncActions={{
                    onSyncNow: vi.fn(),
                    onDisableSync,
                }}
                onSignOut={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /turn sync off/i }));
        const dialog = screen.getByRole('dialog', { name: /turn sync off on this device/i });

        fireEvent.click(within(dialog).getByRole('button', { name: /turn sync off/i }));

        await waitFor(() => {
            expect(onDisableSync).toHaveBeenCalledTimes(1);
        });
        expect(screen.getByText(/cloud sync turned off for this device/i)).toBeInTheDocument();
    });

    it('renders bootstrap and local-only sync states from the account snapshot', () => {
        const { rerender } = render(
            <Sidebar
                {...baseProps}
                account={bootstrappingAccount}
            />,
        );

        expect(screen.getByText(/checking account/i)).toBeInTheDocument();
        expect(screen.getByText(/loading your session and entitlement state/i)).toBeInTheDocument();
        expect(screen.getByText(/syncing account state/i)).toBeInTheDocument();

        rerender(
            <Sidebar
                {...baseProps}
                account={disabledAccount}
            />,
        );

        expect(screen.getByText(/local only/i)).toBeInTheDocument();
        expect(screen.getByText(/supabase is off, so the app stays local-only/i)).toBeInTheDocument();
        expect(screen.queryByText(/syncing account state/i)).not.toBeInTheDocument();
    });
});
