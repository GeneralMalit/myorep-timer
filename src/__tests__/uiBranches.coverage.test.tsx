import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountCard from '@/components/AccountCard';
import ConcentricTimer from '@/components/ConcentricTimer';
import ProtocolIntelModal from '@/components/ProtocolIntelModal';
import SessionCanvas from '@/components/SessionCanvas';
import SettingsPanel from '@/components/SettingsPanel';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import type { AccountSnapshot, AccountSyncActions, AccountSyncSnapshot } from '@/types/account';
import type { SessionNode } from '@/types/savedSessions';

const audioMocks = vi.hoisted(() => ({
    init: vi.fn(),
    speak: vi.fn(),
}));

vi.mock('@/utils/audioEngine', () => ({
    audioEngine: {
        init: audioMocks.init,
        speak: audioMocks.speak,
    },
}));

vi.mock('@/components/SessionNodeCard', () => ({
    default: (props: {
        node: SessionNode;
        isActive: boolean;
        isDragging: boolean;
        isMobile?: boolean;
        canMoveLeft: boolean;
        canMoveRight: boolean;
        onSelect: () => void;
        onEdit: () => void;
        onDelete: () => void;
        onMoveLeft: () => void;
        onMoveRight: () => void;
        onDragStart: () => void;
        onDragEnd: () => void;
    }) => (
        <div
            data-testid={`node-${props.node.id}`}
            data-active={String(props.isActive)}
            data-dragging={String(props.isDragging)}
            data-mobile={String(Boolean(props.isMobile))}
            draggable
            onClick={props.onSelect}
            onDragStart={props.onDragStart}
            onDragEnd={props.onDragEnd}
        >
            <button type="button" onClick={(event) => { event.stopPropagation(); props.onEdit(); }}>edit {props.node.id}</button>
            <button type="button" onClick={(event) => { event.stopPropagation(); props.onDelete(); }}>delete {props.node.id}</button>
            <button type="button" disabled={!props.canMoveLeft} onClick={props.onMoveLeft}>left {props.node.id}</button>
            <button type="button" disabled={!props.canMoveRight} onClick={props.onMoveRight}>right {props.node.id}</button>
        </div>
    ),
}));

const originalSettings = { ...useWorkoutStore.getState().settings };

const profile = {
    userId: 'user-1',
    username: 'athlete_one',
    email: 'athlete@example.com',
    displayName: 'Athlete One',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
};

const guestAccount: AccountSnapshot = {
    bootstrapStatus: 'ready',
    mode: 'guest',
    session: null,
    profile: null,
    entitlement: null,
    syncStatus: 'idle',
    error: null,
    requiresPasswordReset: false,
};

const signedFreeAccount: AccountSnapshot = {
    ...guestAccount,
    mode: 'signed-in-free',
    profile,
    entitlement: {
        userId: 'user-1',
        plan: 'free',
        cloudSyncEnabled: false,
        updatedAt: '2026-01-01T00:00:00.000Z',
        source: 'supabase',
    },
};

const signedPlusAccount: AccountSnapshot = {
    ...signedFreeAccount,
    mode: 'signed-in-plus',
    entitlement: {
        ...signedFreeAccount.entitlement!,
        plan: 'plus',
        cloudSyncEnabled: true,
    },
};

type MediaController = {
    media: MediaQueryList;
    emit: (matches: boolean) => void;
};

const installMatchMedia = (initialMatches: boolean, modern = true): MediaController => {
    let listener: ((event: MediaQueryListEvent | MediaQueryList) => void) | undefined;
    const media = {
        matches: initialMatches,
        media: '(max-width: 767px)',
        onchange: null,
        addListener: vi.fn((callback: (event: MediaQueryListEvent | MediaQueryList) => void) => {
            listener = callback;
        }),
        removeListener: vi.fn(),
        addEventListener: modern
            ? vi.fn((_event: string, callback: (event: MediaQueryListEvent | MediaQueryList) => void) => {
                listener = callback;
            })
            : undefined,
        removeEventListener: modern ? vi.fn() : undefined,
        dispatchEvent: vi.fn(() => false),
    } as unknown as MediaQueryList;

    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: vi.fn(() => media),
    });

    return {
        media,
        emit: (matches: boolean) => {
            Object.defineProperty(media, 'matches', { configurable: true, value: matches });
            listener?.({ matches } as MediaQueryListEvent);
        },
    };
};

const workoutNode = (id: string, name: string): SessionNode => ({
    id,
    type: 'workout',
    name,
    config: {
        sets: '2',
        reps: '10',
        seconds: '3',
        rest: '15',
        myoReps: '4',
        myoWorkSecs: '2',
    },
    sourceWorkoutId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
});

const restNode = (id: string, name: string): SessionNode => ({
    id,
    type: 'rest',
    name,
    seconds: '20',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(() => {
    vi.restoreAllMocks();
    audioMocks.init.mockReset();
    audioMocks.speak.mockReset();
    installMatchMedia(false);
    useWorkoutStore.setState({
        seconds: '3',
        myoWorkSecs: '2',
        currentRep: 1,
        settings: { ...originalSettings },
    });
});

describe('AccountCard branch coverage', () => {
    it('validates every guest password flow and handles success and error results', async () => {
        const onSignIn = vi.fn().mockResolvedValue({ ok: false, message: 'Credentials rejected.' });
        const onSignUp = vi.fn().mockResolvedValue({ ok: true, message: 'Account created.' });
        const onReset = vi.fn().mockResolvedValue({ ok: false, message: 'Reset unavailable.' });
        const onResend = vi.fn().mockResolvedValue({ ok: true, message: 'Confirmation resent.' });

        render(
            <AccountCard
                account={guestAccount}
                onSignInWithPassword={onSignIn}
                onSignUpWithPassword={onSignUp}
                onSendPasswordReset={onReset}
                onResendSignUpConfirmation={onResend}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /sign in with password/i }));
        expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: ' athlete@example.com ' } });
        fireEvent.click(screen.getByRole('button', { name: /sign in with password/i }));
        expect(screen.getByText('Enter your password.')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'valid-pass' } });
        fireEvent.click(screen.getByRole('button', { name: /sign in with password/i }));
        await screen.findByText('Credentials rejected.');
        expect(onSignIn).toHaveBeenCalledWith('athlete@example.com', 'valid-pass');

        fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
        fireEvent.click(screen.getByRole('button', { name: /create account/i }));
        expect(screen.getByText(/use 3-24 lowercase/i)).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'Athlete_TWO!' } });
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'bad-email' } });
        fireEvent.click(screen.getByRole('button', { name: /create account/i }));
        expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new@example.com' } });
        fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: /create account/i }));
        expect(screen.getByText('Create a password first.')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'short' } });
        fireEvent.click(screen.getByRole('button', { name: /create account/i }));
        expect(screen.getByText('Use at least 8 characters for your password.')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'long-enough' } });
        fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'different' } });
        fireEvent.click(screen.getByRole('button', { name: /create account/i }));
        expect(screen.getByText('Password confirmation does not match.')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'long-enough' } });
        fireEvent.click(screen.getByRole('button', { name: /create account/i }));
        await screen.findByText('Account created.');
        expect(onSignUp).toHaveBeenCalledWith('athlete_two', 'new@example.com', 'long-enough');
        expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'invalid' } });
        fireEvent.click(screen.getByRole('button', { name: /resend confirmation/i }));
        expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: /resend confirmation/i }));
        await screen.findByText('Confirmation resent.');

        fireEvent.click(screen.getByRole('button', { name: /forgot password/i }));
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'invalid' } });
        fireEvent.click(screen.getByRole('button', { name: /send reset email/i }));
        expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'reset@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: /send reset email/i }));
        await screen.findByText('Reset unavailable.');
        expect(onReset).toHaveBeenCalledWith('reset@example.com');
        fireEvent.click(screen.getByRole('button', { name: /back to sign in/i }));
    });

    it('covers recovery validation and a successful password update', async () => {
        const onUpdatePassword = vi.fn().mockResolvedValue({ ok: true, message: 'Password recovered.' });
        render(
            <AccountCard
                account={{ ...guestAccount, requiresPasswordReset: true }}
                onUpdatePassword={onUpdatePassword}
            />,
        );

        expect(screen.getByText('Set a new password')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /update password/i }));
        expect(screen.getByText('Enter a new password.')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'short' } });
        fireEvent.click(screen.getByRole('button', { name: /update password/i }));
        expect(screen.getByText(/at least 8 characters for your new password/i)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'recovered-pass' } });
        fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'no-match' } });
        fireEvent.click(screen.getByRole('button', { name: /update password/i }));
        expect(screen.getByText('Password confirmation does not match.')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'recovered-pass' } });
        fireEvent.click(screen.getByRole('button', { name: /update password/i }));
        await screen.findByText('Password recovered.');
        expect(onUpdatePassword).toHaveBeenCalledWith('recovered-pass');
    });

    it('handles collapse, username editing, billing, sign-out, and bootstrap edge states', async () => {
        const onToggle = vi.fn();
        const onUsername = vi.fn().mockResolvedValue({ ok: true, message: 'Username changed.' });
        const onUpgrade = vi.fn().mockResolvedValue({ ok: false, message: 'Checkout unavailable.' });
        const onManage = vi.fn().mockResolvedValue({ ok: true, message: 'Portal opened.' });
        const onSignOut = vi.fn().mockResolvedValue({ ok: true, message: 'Signed out safely.' });
        const { rerender } = render(
            <AccountCard
                account={signedFreeAccount}
                isCollapsed
                onToggleCollapsed={onToggle}
                onUpdateUsername={onUsername}
                onUpgradeToPlus={onUpgrade}
                onSignOut={onSignOut}
            />,
        );

        expect(screen.getByText('Signed In - athlete_one')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /show/i }));
        expect(onToggle).toHaveBeenCalledOnce();

        rerender(
            <AccountCard
                account={signedFreeAccount}
                onToggleCollapsed={onToggle}
                onUpdateUsername={onUsername}
                onUpgradeToPlus={onUpgrade}
                onSignOut={onSignOut}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: /^change$/i }));
        const usernameInput = document.getElementById('account-username-update') as HTMLInputElement;
        fireEvent.change(usernameInput, { target: { value: 'x' } });
        fireEvent.click(screen.getByRole('button', { name: /save username/i }));
        expect(screen.getByText(/use 3-24 lowercase/i)).toBeInTheDocument();
        fireEvent.change(usernameInput, { target: { value: 'athlete_one' } });
        fireEvent.click(screen.getByRole('button', { name: /save username/i }));
        expect(screen.getByText(/already up to date/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^change$/i }));
        fireEvent.change(document.getElementById('account-username-update')!, { target: { value: 'athlete_new' } });
        fireEvent.click(screen.getByRole('button', { name: /save username/i }));
        await screen.findByText('Username changed.');
        expect(onUsername).toHaveBeenCalledWith('athlete_new');

        fireEvent.click(screen.getByRole('button', { name: /^change$/i }));
        fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
        fireEvent.click(screen.getByRole('button', { name: /upgrade to plus/i }));
        await screen.findByText('Checkout unavailable.');
        fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
        await screen.findByText('Signed out safely.');

        rerender(
            <AccountCard
                account={signedPlusAccount}
                onManageSubscription={onManage}
                onSignOut={onSignOut}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: /manage subscription/i }));
        await screen.findByText('Portal opened.');

        rerender(<AccountCard account={{ ...guestAccount, bootstrapStatus: 'bootstrapping', syncStatus: 'syncing' }} />);
        expect(screen.getByText('Checking account')).toBeInTheDocument();
        expect(screen.getByText('Syncing account state')).toBeInTheDocument();
        rerender(<AccountCard account={{ ...guestAccount, bootstrapStatus: 'disabled' }} />);
        expect(screen.getByText('Local only')).toBeInTheDocument();
        rerender(<AccountCard account={{ ...guestAccount, bootstrapStatus: 'error', syncStatus: 'error', error: null }} />);
        expect(screen.getByText('Account error')).toBeInTheDocument();
        expect(screen.getByText('We could not load the account state.')).toBeInTheDocument();
        expect(screen.getByText('Sync unavailable')).toBeInTheDocument();
    });

    it('exercises sync actions, first-sync choices, confirmation dialogs, timestamps, and status icons', async () => {
        const onEnableSync = vi.fn(async (choice?: string) => (
            choice
                ? { ok: true, message: `Selected ${choice}.` }
                : { ok: false, message: 'Choose a direction.', requiresChoice: true }
        ));
        const onSyncNow = vi.fn().mockResolvedValue({ ok: true, message: 'Synced now.' });
        const onRetrySync = vi.fn().mockResolvedValue({ ok: false, message: 'Retry failed.' });
        const onResumeSync = vi.fn().mockResolvedValue(undefined);
        const onDisableSync = vi.fn().mockResolvedValue({ ok: true, message: 'Sync disabled.' });
        const actions: AccountSyncActions = {
            onEnableSync,
            onSyncNow,
            onRetrySync,
            onResumeSync,
            onDisableSync,
        };
        const firstSync: AccountSyncSnapshot = { status: 'first-sync-required', detail: ' ', lastSyncedAt: null };
        const { rerender } = render(
            <AccountCard account={signedPlusAccount} syncSnapshot={firstSync} syncActions={actions} />,
        );

        fireEvent.click(screen.getByRole('button', { name: /run first sync/i }));
        const firstDialog = await screen.findByRole('dialog', { name: /choose first sync direction/i });
        fireEvent.pointerDown(within(firstDialog).getByText(/decide whether/i));
        expect(firstDialog).toBeInTheDocument();
        fireEvent.pointerDown(firstDialog);
        expect(screen.queryByRole('dialog', { name: /choose first sync direction/i })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /run first sync/i }));
        fireEvent.click(await screen.findByRole('button', { name: /use cloud on this device/i }));
        await screen.findByText('Selected replace-local.');
        expect(onEnableSync).toHaveBeenNthCalledWith(2);
        expect(onEnableSync).toHaveBeenNthCalledWith(3, 'replace-local');

        rerender(
            <AccountCard
                account={signedPlusAccount}
                syncSnapshot={{ status: 'last-synced', detail: null, lastSyncedAt: '2026-01-02T03:04:00.000Z' }}
                syncActions={actions}
            />,
        );
        expect(screen.getAllByText(/last synced/i)[0]).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /sync now/i }));
        await screen.findByText('Synced now.');
        fireEvent.click(screen.getByRole('button', { name: /turn sync off/i }));
        const disableDialog = screen.getByRole('dialog', { name: /turn sync off on this device/i });
        fireEvent.click(within(disableDialog).getByRole('button', { name: /^cancel$/i }));
        fireEvent.click(screen.getByRole('button', { name: /turn sync off/i }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /turn sync off/i }));
        await screen.findByText('Sync disabled.');

        const cases: Array<[AccountSyncSnapshot, RegExp]> = [
            [{ status: 'sync-off', detail: null }, /enable sync/i],
            [{ status: 'sync-available', detail: null }, /enable sync/i],
            [{ status: 'enable-sync', detail: null }, /enable sync/i],
            [{ status: 'syncing', detail: null }, /syncing/i],
            [{ status: 'auth-expired', detail: null }, /auth expired/i],
            [{ status: 'sync-error', detail: null }, /retry sync/i],
            [{ status: 'sync-paused', detail: null }, /resume sync/i],
            [{ status: 'offline', detail: null, lastSyncedAt: 'not-a-date' }, /try again/i],
        ];

        for (const [snapshot, expected] of cases) {
            rerender(<AccountCard account={signedPlusAccount} syncSnapshot={snapshot} syncActions={actions} />);
            expect(screen.getAllByText(expected)[0]).toBeInTheDocument();
        }

        fireEvent.click(screen.getByRole('button', { name: /try again/i }));
        await screen.findByText('Retry failed.');
        rerender(<AccountCard account={signedPlusAccount} syncSnapshot={{ status: 'sync-paused' }} syncActions={actions} />);
        fireEvent.click(screen.getByRole('button', { name: /resume sync/i }));
        await waitFor(() => expect(onResumeSync).toHaveBeenCalledOnce());
    });
});

describe('settings, protocol intel, and timer display branches', () => {
    it('dismisses Protocol Intel through Escape, backdrop, and its accessible close button', () => {
        const onClose = vi.fn();
        const { rerender } = render(<ProtocolIntelModal isOpen={false} onClose={onClose} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        rerender(<ProtocolIntelModal isOpen onClose={onClose} />);
        const dialog = screen.getByRole('dialog', { name: /protocol intel/i });
        fireEvent.keyDown(window, { key: 'Enter' });
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.pointerDown(within(dialog).getByText(/what myo-reps actually are/i));
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledOnce();
        fireEvent.pointerDown(dialog);
        fireEvent.click(screen.getByRole('button', { name: /close protocol intel/i }));
        expect(onClose).toHaveBeenCalledTimes(3);
        expect(screen.getAllByRole('link')).toHaveLength(4);
    });

    it('lazily opens Settings, reacts to a legacy mobile query, updates every control, and cancels rAF', () => {
        const media = installMatchMedia(true, false);
        let frameCallback: FrameRequestCallback | undefined;
        const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            frameCallback = callback;
            return 91;
        });
        const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame');
        const onClose = vi.fn();
        const { rerender, unmount } = render(<SettingsPanel isOpen={false} onClose={onClose} />);
        const overlay = screen.getByTestId('settings-drawer-overlay');
        expect(overlay).toHaveAttribute('aria-hidden', 'true');

        rerender(<SettingsPanel isOpen onClose={onClose} />);
        expect(requestFrame).toHaveBeenCalled();
        act(() => frameCallback?.(0));
        expect(screen.getByText(/visual identity/i)).toBeInTheDocument();

        act(() => media.emit(false));
        const colorInputs = document.querySelectorAll<HTMLInputElement>('input[type="color"]');
        fireEvent.change(colorInputs[0], { target: { value: '#112233' } });
        fireEvent.change(colorInputs[1], { target: { value: '#223344' } });
        fireEvent.change(colorInputs[2], { target: { value: '#334455' } });

        const numberInputs = screen.getAllByRole('spinbutton');
        fireEvent.change(numberInputs[0], { target: { value: '99' } });
        expect(useWorkoutStore.getState().settings.concentricSecond).toBe(2);
        fireEvent.change(numberInputs[0], { target: { value: 'invalid' } });
        expect(useWorkoutStore.getState().settings.concentricSecond).toBe(1);
        fireEvent.change(numberInputs[1], { target: { value: '' } });
        expect(useWorkoutStore.getState().settings.prepTime).toBe(0);

        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'low-thud' } });
        fireEvent.click(screen.getByRole('button', { name: /test voices/i }));
        expect(audioMocks.init).toHaveBeenCalledOnce();
        expect(audioMocks.speak).toHaveBeenCalledWith('Ready 3 2 1 Go');
        const switches = screen.getAllByRole('switch');
        switches.forEach((toggle) => fireEvent.click(toggle));

        fireEvent.pointerDown(screen.getByTestId('settings-drawer-panel'));
        expect(onClose).not.toHaveBeenCalled();
        fireEvent.pointerDown(overlay);
        fireEvent.click(screen.getByRole('button', { name: /close settings/i }));
        expect(onClose).toHaveBeenCalledTimes(2);

        rerender(<SettingsPanel isOpen={false} onClose={onClose} />);
        expect(cancelFrame).toHaveBeenCalledWith(91);
        unmount();
        expect(media.media.removeListener).toHaveBeenCalled();
    });

    it('handles absent pace limits and hides sound actions when both sound modes are disabled', () => {
        useWorkoutStore.setState((state) => ({
            seconds: '',
            myoWorkSecs: 'not-a-number',
            settings: {
                ...state.settings,
                metronomeEnabled: false,
                ttsEnabled: false,
            },
        }));
        render(<SettingsPanel isOpen onClose={vi.fn()} />);
        const concentricInput = screen.getAllByRole('spinbutton')[0];
        expect(concentricInput).not.toHaveAttribute('max');
        fireEvent.change(concentricInput, { target: { value: '7' } });
        expect(useWorkoutStore.getState().settings.concentricSecond).toBe(7);
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /test voices/i })).not.toBeInTheDocument();
    });

    it('covers timer clamping, hidden info, all up/down labels, pulse rules, full-screen colors, and mobile changes', () => {
        const media = installMatchMedia(false);
        useWorkoutStore.setState((state) => ({
            settings: {
                ...state.settings,
                upDownMode: false,
                infoVisibility: 'never',
                pulseEffect: 'never',
                smoothAnimation: false,
                fullScreenMode: false,
            },
        }));
        const { container, rerender, unmount } = render(
            <ConcentricTimer
                outerValue={20}
                outerMax={0}
                isResting={false}
                innerValue={-5}
                innerMax={0}
                textMain="hidden-main"
                textSub="hidden-sub"
                isFinished={false}
                isPreparing={false}
            />,
        );
        expect(screen.queryByText('hidden-main')).not.toBeInTheDocument();
        expect(container.querySelectorAll('circle[stroke-dasharray]')).toHaveLength(2);

        act(() => {
            useWorkoutStore.setState((state) => ({
                settings: {
                    ...state.settings,
                    upDownMode: true,
                    infoVisibility: 'resting',
                    pulseEffect: 'resting',
                },
            }));
        });
        rerender(<ConcentricTimer outerValue={0} outerMax={5} isResting innerValue={0} innerMax={5} textMain="00:00" textSub="Rest" isFinished={false} isPreparing={false} />);
        expect(screen.getByText('REST')).toHaveClass('animate-pulse');
        expect(screen.getByText('00:00')).toBeInTheDocument();

        rerender(<ConcentricTimer outerValue={0} outerMax={5} isResting={false} innerValue={0} innerMax={5} textMain="done" textSub="Done" isFinished isPreparing={false} />);
        expect(screen.getByText('DONE')).toBeInTheDocument();
        rerender(<ConcentricTimer outerValue={5} outerMax={5} isResting={false} innerValue={5} innerMax={5} textMain="ready" textSub="Ready" isFinished={false} isPreparing />);
        expect(screen.getByText('READY')).toBeInTheDocument();
        rerender(<ConcentricTimer outerValue={2} outerMax={5} isResting={false} innerValue={1} innerMax={3} textMain="work" textSub="Work" isFinished={false} isPreparing={false} />);
        expect(screen.getByText('CONCENTRIC')).toBeInTheDocument();
        rerender(<ConcentricTimer outerValue={2} outerMax={5} isResting={false} innerValue={3} innerMax={3} textMain="work" textSub="Work" isFinished={false} isPreparing={false} />);
        expect(screen.getByText('ECCENTRIC')).toBeInTheDocument();

        act(() => {
            useWorkoutStore.setState((state) => ({ settings: { ...state.settings, fullScreenMode: true, infoVisibility: 'always' } }));
            media.emit(true);
        });
        expect(screen.getByText('ECCENTRIC')).toHaveStyle({ color: '#ffffff' });
        expect(screen.getByText('work')).toHaveStyle({ color: '#ffffff' });
        unmount();
        expect(media.media.removeEventListener).toHaveBeenCalled();
    });
});

describe('SessionCanvas gesture and drag branches', () => {
    const baseProps = {
        activeNodeId: null,
        sessionId: 'session-1',
        sessionName: null,
        sessionDraftStatus: 'none' as const,
        onEditNode: vi.fn(),
        onRemoveNode: vi.fn(),
        onMoveNode: vi.fn(),
        onMoveNodeToIndex: vi.fn(),
    };

    it('renders desktop empty and populated states, card actions, and both drop targets', () => {
        const onEditNode = vi.fn();
        const onRemoveNode = vi.fn();
        const onMoveNode = vi.fn();
        const onMoveNodeToIndex = vi.fn();
        const { rerender } = render(
            <SessionCanvas
                {...baseProps}
                nodes={[]}
                onEditNode={onEditNode}
                onRemoveNode={onRemoveNode}
                onMoveNode={onMoveNode}
                onMoveNodeToIndex={onMoveNodeToIndex}
            />,
        );
        expect(screen.getByText('SESSION')).toBeInTheDocument();
        expect(screen.getByText(/empty canvas/i)).toBeInTheDocument();
        fireEvent.dragOver(screen.getByTestId('session-canvas-frame'));
        fireEvent.drop(screen.getByTestId('session-canvas-frame'));
        expect(onMoveNodeToIndex).not.toHaveBeenCalled();

        const nodes = [workoutNode('one', 'Press'), restNode('two', 'Reset')];
        rerender(
            <SessionCanvas
                {...baseProps}
                nodes={nodes}
                activeNodeId="two"
                sessionName="  strength chain  "
                sessionDraftStatus="unsaved changes"
                onEditNode={onEditNode}
                onRemoveNode={onRemoveNode}
                onMoveNode={onMoveNode}
                onMoveNodeToIndex={onMoveNodeToIndex}
            />,
        );
        expect(screen.getByText('STRENGTH CHAIN')).toBeInTheDocument();
        expect(screen.getByText('UNSAVED CHANGES')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('node-two'));
        fireEvent.click(screen.getByRole('button', { name: 'edit one' }));
        fireEvent.click(screen.getByRole('button', { name: 'delete one' }));
        fireEvent.click(screen.getByRole('button', { name: 'right one' }));
        fireEvent.click(screen.getByRole('button', { name: 'left two' }));
        expect(onEditNode).toHaveBeenCalledWith('two');
        expect(onEditNode).toHaveBeenCalledWith('one');
        expect(onRemoveNode).toHaveBeenCalledWith('one');
        expect(onMoveNode).toHaveBeenCalledWith('one', 'right');
        expect(onMoveNode).toHaveBeenCalledWith('two', 'left');

        fireEvent.dragStart(screen.getByTestId('node-one'));
        const secondDropTarget = screen.getByTestId('node-two').parentElement!;
        fireEvent.dragOver(secondDropTarget);
        fireEvent.drop(secondDropTarget);
        expect(onMoveNodeToIndex).toHaveBeenCalledWith('one', 1);

        fireEvent.dragStart(screen.getByTestId('node-two'));
        fireEvent.drop(screen.getByTestId('session-canvas-frame'));
        expect(onMoveNodeToIndex).toHaveBeenCalledWith('two', 2);
        fireEvent.dragStart(screen.getByTestId('node-one'));
        fireEvent.dragEnd(screen.getByTestId('node-one'));
    });

    it('pans on mobile, ignores interactive targets, cancels queued frames, resets per session, and cleans up', () => {
        const media = installMatchMedia(true);
        let nextFrame = 0;
        const callbacks = new Map<number, FrameRequestCallback>();
        const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
            nextFrame += 1;
            callbacks.set(nextFrame, callback);
            return nextFrame;
        });
        const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame');
        const nodes = [workoutNode('one', 'Press'), restNode('two', 'Reset')];
        const { rerender, unmount } = render(<SessionCanvas {...baseProps} nodes={nodes} sessionName="Mobile" />);
        const viewport = screen.getByTestId('session-canvas-viewport');
        const setPointerCapture = vi.fn();
        const releasePointerCapture = vi.fn();
        const hasPointerCapture = vi.fn(() => true);
        Object.assign(viewport, { setPointerCapture, releasePointerCapture, hasPointerCapture });

        fireEvent.pointerDown(screen.getByRole('button', { name: 'edit one' }), { pointerId: 1, clientX: 10, clientY: 10 });
        fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 50, clientY: 50 });
        expect(requestFrame).not.toHaveBeenCalled();

        fireEvent.pointerDown(viewport, { pointerId: 2, clientX: 10, clientY: 20 });
        expect(setPointerCapture).toHaveBeenCalledWith(2);
        fireEvent.pointerMove(viewport, { pointerId: 2, clientX: 40, clientY: 70 });
        fireEvent.pointerMove(viewport, { pointerId: 2, clientX: 45, clientY: 75 });
        expect(requestFrame).toHaveBeenCalledOnce();
        act(() => callbacks.get(1)?.(0));
        expect(screen.getByTestId('session-canvas-board')).toHaveStyle({ transform: 'translate3d(63px, 83px, 0)' });
        fireEvent.pointerUp(viewport, { pointerId: 2, clientX: 45, clientY: 75 });
        expect(releasePointerCapture).toHaveBeenCalledWith(2);

        fireEvent.pointerDown(viewport, { pointerId: 3, clientX: 45, clientY: 75 });
        fireEvent.pointerMove(viewport, { pointerId: 3, clientX: 55, clientY: 85 });
        fireEvent.pointerCancel(viewport, { pointerId: 3 });
        expect(hasPointerCapture).toHaveBeenCalledWith(3);
        expect(cancelFrame).toHaveBeenCalled();

        fireEvent.pointerDown(viewport, { pointerId: 4, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(viewport, { pointerId: 4, clientX: 5, clientY: 5 });
        rerender(<SessionCanvas {...baseProps} nodes={nodes} sessionId="session-2" sessionName="Mobile" />);
        expect(cancelFrame).toHaveBeenCalled();

        const currentViewport = screen.getByTestId('session-canvas-viewport');
        Object.assign(currentViewport, { setPointerCapture, releasePointerCapture, hasPointerCapture });
        fireEvent.pointerDown(currentViewport, { pointerId: 5, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(currentViewport, { pointerId: 5, clientX: 9, clientY: 9 });
        fireEvent.pointerLeave(currentViewport);

        act(() => media.emit(false));
        expect(screen.queryByTestId('session-canvas-viewport')).not.toBeInTheDocument();
        act(() => media.emit(true));
        const finalViewport = screen.getByTestId('session-canvas-viewport');
        Object.assign(finalViewport, { setPointerCapture, releasePointerCapture, hasPointerCapture });
        fireEvent.pointerDown(finalViewport, { pointerId: 6, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(finalViewport, { pointerId: 6, clientX: 4, clientY: 4 });
        unmount();
        expect(media.media.removeEventListener).toHaveBeenCalled();
        expect(cancelFrame).toHaveBeenCalled();
    });
});
