import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { useAccountStore } from '@/store/useAccountStore';
import { useWorkoutStore } from '@/store/useWorkoutStore';

const mocks = vi.hoisted(() => ({
    resultSink: vi.fn(),
    audioInit: vi.fn(),
    audioSpeak: vi.fn(),
    audioSchedule: vi.fn(),
    audioCancelTicks: vi.fn(),
    audioCancelSpeech: vi.fn(),
    timerProps: vi.fn(),
    getClient: vi.fn(),
    authRedirect: vi.fn(),
    nativePlatform: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    resend: vi.fn(),
    resetPassword: vi.fn(),
    updatePassword: vi.fn(),
    signOut: vi.fn(),
    updateUsername: vi.fn(),
    loadAccount: vi.fn(),
    startCheckout: vi.fn(),
    openPortal: vi.fn(),
    refreshEntitlement: vi.fn(),
    initializeCheckout: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: mocks.nativePlatform },
}));

vi.mock('@/utils/audioEngine', () => ({
    audioEngine: {
        init: mocks.audioInit,
        speak: mocks.audioSpeak,
        playTick: vi.fn(),
        scheduleTickSequence: mocks.audioSchedule,
        cancelScheduledTicks: mocks.audioCancelTicks,
        cancelSpeech: mocks.audioCancelSpeech,
    },
}));

vi.mock('@/components/ConcentricTimer', () => ({
    default: (props: Record<string, unknown>) => {
        mocks.timerProps(props);
        return <div data-testid="mock-concentric">{String(props.textMain)} {String(props.textSub)}</div>;
    },
}));

vi.mock('@/components/SettingsPanel', () => ({
    default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
        isOpen
            ? <div data-testid="mock-settings"><button type="button" onClick={onClose}>drawer close settings</button></div>
            : null
    ),
}));

vi.mock('@/components/ProtocolIntelModal', () => ({
    default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
        isOpen
            ? <div data-testid="mock-protocol"><button type="button" onClick={onClose}>mock close protocol</button></div>
            : null
    ),
}));

vi.mock('@/components/SessionBuilder', () => ({
    default: () => <div data-testid="mock-session-builder">Session builder loaded</div>,
}));

vi.mock('@/components/SupabaseBootstrap', () => ({
    default: () => <div data-testid="mock-bootstrap" />,
}));

vi.mock('@/hooks/useSyncController', () => ({
    useSyncController: ({ savedWorkouts, savedSessions }: { savedWorkouts: unknown[]; savedSessions: unknown[] }) => ({
        visibleWorkouts: savedWorkouts,
        visibleSessions: savedSessions,
        syncSnapshot: { status: 'last-synced' },
        syncActions: {},
    }),
}));

vi.mock('@/components/Sidebar', () => ({
    default: (props: Record<string, any>) => {
        const report = (promise: Promise<unknown>) => void promise.then(mocks.resultSink);
        return (
            <aside data-testid="mock-sidebar">
                <div data-testid="visible-workout-count">{props.savedWorkouts.length}</div>
                <div data-testid="visible-session-count">{props.savedSessions.length}</div>
                <button type="button" onClick={props.toggleSidebar}>mock toggle sidebar</button>
                <button type="button" onClick={() => props.setShowSettings(true)}>mock open settings</button>
                <button type="button" onClick={props.onOpenProtocolIntel}>mock open protocol</button>
                <button type="button" onClick={props.onSaveCurrent}>mock save workout</button>
                <button type="button" onClick={props.onSaveAsCurrent}>mock save workout as</button>
                <button type="button" onClick={() => props.onLoadWorkout('missing-workout')}>mock load workout</button>
                <button type="button" onClick={() => props.onRenameWorkout('missing-workout')}>mock rename workout</button>
                <button type="button" onClick={() => props.onDeleteWorkout('missing-workout')}>mock delete workout</button>
                <button type="button" onClick={props.onExportLibrary}>mock export library</button>
                <button type="button" onClick={props.onCreateSession}>mock create session</button>
                <button type="button" onClick={() => props.onLoadSession('missing-session')}>mock load session</button>
                <button type="button" onClick={() => props.onDuplicateSession('missing-session')}>mock duplicate session</button>
                <button type="button" onClick={() => props.onRenameSession('missing-session')}>mock rename session</button>
                <button type="button" onClick={() => props.onDeleteSession('missing-session')}>mock delete session</button>
                <button type="button" onClick={props.onToggleAccountCardCollapsed}>mock toggle account card</button>
                <button type="button" onClick={() => report(props.onSignOut())}>mock account sign out</button>
                <button type="button" onClick={() => report(props.onSignInWithPassword('person@example.com', 'secure-pass'))}>mock account sign in</button>
                <button type="button" onClick={() => report(props.onSignUpWithPassword('new_user', ' new@example.com ', 'secure-pass'))}>mock account sign up</button>
                <button type="button" onClick={() => report(props.onResendSignUpConfirmation('person@example.com'))}>mock account resend</button>
                <button type="button" onClick={() => report(props.onUpdateUsername('renamed_user'))}>mock account username</button>
                <button type="button" onClick={() => report(props.onSendPasswordReset(' reset@example.com '))}>mock account reset</button>
                <button type="button" onClick={() => report(props.onUpdatePassword('new-secure-pass'))}>mock account password</button>
                <button type="button" onClick={() => report(props.onUpgradeToPlus())}>mock account upgrade</button>
                <button type="button" onClick={() => report(props.onManageSubscription())}>mock account manage</button>
            </aside>
        );
    },
}));

vi.mock('@/lib/supabase', () => ({
    getSupabaseClient: mocks.getClient,
    getSupabaseEnvironment: vi.fn(() => ({ enabled: true, configured: true, redirectUrl: 'https://app.example/' })),
    getSupabaseAuthRedirectUrl: mocks.authRedirect,
}));

vi.mock('@/lib/supabaseAccount', () => ({
    signInSupabaseWithPassword: mocks.signIn,
    signUpSupabaseWithPassword: mocks.signUp,
    resendSupabaseSignUpConfirmation: mocks.resend,
    sendSupabasePasswordReset: mocks.resetPassword,
    updateSupabasePassword: mocks.updatePassword,
    signOutSupabase: mocks.signOut,
    updateSupabaseUsername: mocks.updateUsername,
    loadSupabaseAccountState: mocks.loadAccount,
}));

vi.mock('@/lib/billing', () => ({
    startBillingCheckout: mocks.startCheckout,
    openBillingPortal: mocks.openPortal,
    refreshBillingEntitlementState: mocks.refreshEntitlement,
}));

vi.mock('@/lib/paddle', () => ({
    initializePaddleCheckoutFromQuery: mocks.initializeCheckout,
}));

const initialWorkoutState = { ...useWorkoutStore.getState() };

const session = {
    user: {
        id: 'user-1',
        email: 'athlete@example.com',
        user_metadata: { username: 'athlete_one' },
    },
} as never;

const profile = {
    userId: 'user-1',
    username: 'athlete_one',
    email: 'athlete@example.com',
    displayName: 'Athlete One',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
};

const plusEntitlement = {
    userId: 'user-1',
    plan: 'plus' as const,
    cloudSyncEnabled: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    source: 'supabase' as const,
};

const setAccount = (mode: 'guest' | 'signed-in-free' | 'signed-in-plus') => {
    useAccountStore.setState({
        bootstrapStatus: 'ready',
        mode,
        session: mode === 'guest' ? null : session,
        profile: mode === 'guest' ? null : profile,
        entitlement: mode === 'signed-in-plus'
            ? plusEntitlement
            : mode === 'signed-in-free'
                ? { ...plusEntitlement, plan: 'free', cloudSyncEnabled: false }
                : null,
        syncStatus: mode === 'signed-in-plus' ? 'idle' : 'disabled',
        error: null,
        requiresPasswordReset: false,
    });
};

const installMatchMedia = (matches: boolean, legacy = false) => {
    let listener: ((event: MediaQueryListEvent | MediaQueryList) => void) | undefined;
    const media = {
        matches,
        media: '(max-width: 767px)',
        onchange: null,
        addListener: vi.fn((callback: (event: MediaQueryListEvent | MediaQueryList) => void) => { listener = callback; }),
        removeListener: vi.fn(),
        addEventListener: legacy
            ? undefined
            : vi.fn((_name: string, callback: (event: MediaQueryListEvent | MediaQueryList) => void) => { listener = callback; }),
        removeEventListener: legacy ? undefined : vi.fn(),
        dispatchEvent: vi.fn(() => false),
    } as unknown as MediaQueryList;
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: vi.fn(() => media) });
    return {
        media,
        emit: (nextMatches: boolean) => {
            Object.defineProperty(media, 'matches', { configurable: true, value: nextMatches });
            listener?.({ matches: nextMatches } as MediaQueryListEvent);
        },
    };
};

const clickAndReport = async (name: RegExp) => {
    const callsBefore = mocks.resultSink.mock.calls.length;
    fireEvent.click(await screen.findByRole('button', { name }));
    await waitFor(() => expect(mocks.resultSink.mock.calls.length).toBeGreaterThan(callsBefore));
    const calls = mocks.resultSink.mock.calls;
    return calls[calls.length - 1]?.[0] as { ok: boolean; message: string };
};

beforeEach(() => {
    vi.clearAllMocks();
    useWorkoutStore.setState({
        ...initialWorkoutState,
        appPhase: 'setup',
        timerStatus: 'Ready',
        isTimerRunning: false,
        sets: '',
        reps: '',
        seconds: '',
        rest: '',
        myoReps: '',
        myoWorkSecs: '',
        showSettings: false,
        isSidebarCollapsed: false,
        isAccountCardCollapsed: false,
        savedWorkouts: [],
        savedSessions: [],
        selectedSavedWorkoutId: null,
        selectedSavedSessionId: null,
        setupMode: 'workout',
        editingSessionId: null,
        editingSessionDraft: null,
        editingSessionNodeId: null,
        activeSessionId: null,
        activeSessionNodeIndex: 0,
        sessionStatus: 'idle',
        isRunningSession: false,
        sessionNodeRuntimeType: null,
        timeLeft: 0,
        setTotalDuration: 0,
        setElapsedTime: 0,
    });
    useAccountStore.getState().clearAccountState();
    setAccount('guest');
    installMatchMedia(false);
    window.history.replaceState({}, '', '/');
    mocks.getClient.mockReturnValue({ auth: {} });
    mocks.authRedirect.mockImplementation(({ native }: { native?: boolean }) => (
        native ? 'com.example://auth/callback' : 'https://app.example/'
    ));
    mocks.nativePlatform.mockReturnValue(false);
    mocks.signIn.mockResolvedValue({ ok: true });
    mocks.signUp.mockResolvedValue({ ok: true, requiresEmailVerification: true });
    mocks.resend.mockResolvedValue({ ok: true });
    mocks.resetPassword.mockResolvedValue({ ok: true });
    mocks.updatePassword.mockResolvedValue({ ok: true });
    mocks.signOut.mockResolvedValue({ ok: true });
    mocks.updateUsername.mockResolvedValue({ ok: true });
    mocks.loadAccount.mockResolvedValue({
        session,
        profile,
        entitlement: plusEntitlement,
        mode: 'signed-in-plus',
        syncStatus: 'idle',
    });
    mocks.startCheckout.mockResolvedValue({ ok: true, message: 'Checkout opened.' });
    mocks.openPortal.mockResolvedValue({ ok: true, message: 'Portal opened.' });
    mocks.refreshEntitlement.mockResolvedValue(null);
    mocks.initializeCheckout.mockResolvedValue(false);
});

describe('App dialog and library branches', () => {
    it('covers prompt validation, missing-record fallbacks, error dialogs, backdrop dismissal, and delete confirmation', async () => {
        const saveCurrentWorkout = vi.fn(() => ({ ok: false }));
        const saveCurrentWorkoutAs = vi.fn(() => ({ ok: false }));
        const loadWorkout = vi.fn(() => ({ ok: false }));
        const renameWorkout = vi.fn(() => ({ ok: false }));
        const deleteWorkout = vi.fn();
        useWorkoutStore.setState({
            saveCurrentWorkout,
            saveCurrentWorkoutAs,
            loadWorkout,
            renameWorkout,
            deleteWorkout,
            savedWorkouts: [
                { id: 'pending', name: 'Pending', sync: { pendingDelete: true } },
            ] as never,
        });
        render(<App />);
        expect(screen.getByTestId('visible-workout-count')).toHaveTextContent('0');

        fireEvent.click(screen.getByRole('button', { name: /mock save workout$/i }));
        let dialog = screen.getByRole('dialog', { name: /save workout/i });
        fireEvent.pointerDown(within(dialog).getByText(/name the current/i));
        expect(dialog).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText(/workout name/i), { target: { value: '   ' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /save workout/i }));
        expect(saveCurrentWorkout).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /mock save workout$/i }));
        fireEvent.change(screen.getByLabelText(/workout name/i), { target: { value: 'Tempo Day' } });
        fireEvent.click(screen.getByRole('dialog').querySelector('button:last-child')!);
        dialog = await screen.findByRole('dialog', { name: /could not save workout/i });
        expect(within(dialog).getByText('Could not save workout.')).toBeInTheDocument();
        fireEvent.pointerDown(dialog);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /mock save workout as/i }));
        fireEvent.change(screen.getByLabelText(/workout name/i), { target: { value: 'Copy' } });
        fireEvent.click(screen.getByRole('button', { name: /save copy/i }));
        fireEvent.click(await screen.findByRole('button', { name: /^close$/i }));
        expect(saveCurrentWorkoutAs).toHaveBeenCalledWith('Copy');

        fireEvent.click(screen.getByRole('button', { name: /mock load workout/i }));
        expect(await screen.findByRole('dialog', { name: /could not load workout/i })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
        expect(loadWorkout).toHaveBeenCalledWith('missing-workout');

        fireEvent.click(screen.getByRole('button', { name: /mock rename workout/i }));
        expect(screen.getByLabelText(/workout name/i)).toHaveValue('');
        fireEvent.change(screen.getByLabelText(/workout name/i), { target: { value: 'Renamed' } });
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /rename workout/i }));
        fireEvent.click(await screen.findByRole('button', { name: /^close$/i }));
        expect(renameWorkout).toHaveBeenCalledWith('missing-workout', 'Renamed');

        fireEvent.click(screen.getByRole('button', { name: /mock delete workout/i }));
        expect(screen.getByText(/delete "this workout"/i)).toBeInTheDocument();
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /delete workout/i }));
        expect(deleteWorkout).toHaveBeenCalledWith('missing-workout');
    });

    it('covers Plus session prompts, missing sessions, error fallbacks, and confirmations', async () => {
        setAccount('signed-in-plus');
        const createSession = vi.fn(() => ({ ok: false }));
        const loadSessionForEditing = vi.fn(() => ({ ok: false }));
        const duplicateSession = vi.fn(() => ({ ok: false }));
        const renameSession = vi.fn(() => ({ ok: false }));
        const deleteSession = vi.fn();
        useWorkoutStore.setState({
            createSession,
            loadSessionForEditing,
            duplicateSession,
            renameSession,
            deleteSession,
            savedSessions: [
                { id: 'pending', name: 'Pending', nodes: [], sync: { pendingDelete: true } },
            ] as never,
        });
        render(<App />);
        expect(await screen.findByTestId('visible-session-count')).toHaveTextContent('0');

        fireEvent.click(screen.getByRole('button', { name: /mock create session/i }));
        fireEvent.change(screen.getByLabelText(/session name/i), { target: { value: '   ' } });
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /create session/i }));
        expect(createSession).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /mock create session/i }));
        fireEvent.change(screen.getByLabelText(/session name/i), { target: { value: 'Chain' } });
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /create session/i }));
        expect(await screen.findByRole('dialog', { name: /could not create session/i })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /^close$/i }));

        fireEvent.click(screen.getByRole('button', { name: /mock load session/i }));
        expect(await screen.findByRole('dialog', { name: /could not load session/i })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /^close$/i }));

        fireEvent.click(screen.getByRole('button', { name: /mock duplicate session/i }));
        expect(screen.getByLabelText(/session name/i)).toHaveValue('Session Copy');
        fireEvent.change(screen.getByLabelText(/session name/i), { target: { value: 'Copy' } });
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /duplicate session/i }));
        fireEvent.click(await screen.findByRole('button', { name: /^close$/i }));
        expect(duplicateSession).toHaveBeenCalledWith('missing-session', 'Copy');

        fireEvent.click(screen.getByRole('button', { name: /mock rename session/i }));
        expect(screen.getByLabelText(/session name/i)).toHaveValue('');
        fireEvent.change(screen.getByLabelText(/session name/i), { target: { value: 'Renamed Chain' } });
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /rename session/i }));
        fireEvent.click(await screen.findByRole('button', { name: /^close$/i }));
        expect(renameSession).toHaveBeenCalledWith('missing-session', 'Renamed Chain');

        fireEvent.click(screen.getByRole('button', { name: /mock delete session/i }));
        expect(screen.getByText(/delete "this session"/i)).toBeInTheDocument();
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /delete session/i }));
        expect(deleteSession).toHaveBeenCalledWith('missing-session');
    });
});

describe('App account and billing edge branches', () => {
    it('returns clear account errors when Supabase is unavailable', async () => {
        mocks.getClient.mockReturnValue(null);
        render(<App />);
        const buttons: Array<[RegExp, string]> = [
            [/mock account sign out/i, 'Supabase is not configured for this build.'],
            [/mock account sign in/i, 'Supabase is not configured for this build.'],
            [/mock account sign up/i, 'Supabase is not configured for this build.'],
            [/mock account resend/i, 'Supabase is not configured for this build.'],
            [/mock account username/i, 'Supabase is not configured for this build.'],
            [/mock account reset/i, 'Supabase is not configured for this build.'],
            [/mock account password/i, 'Supabase is not configured for this build.'],
            [/mock account upgrade/i, 'Sign in first from the account card, then upgrade to Plus.'],
            [/mock account manage/i, 'Upgrade to Plus before managing a subscription.'],
        ];
        for (const [name, message] of buttons) {
            expect((await clickAndReport(name)).message).toBe(message);
        }
    });

    it('maps provider failures to fallback messages and handles a signed-in username requirement', async () => {
        setAccount('signed-in-plus');
        mocks.signOut.mockResolvedValue({ ok: false });
        mocks.signIn.mockResolvedValue({ ok: false });
        mocks.signUp.mockResolvedValue({ ok: false });
        mocks.resend.mockResolvedValue({ ok: false });
        mocks.resetPassword.mockResolvedValue({ ok: false });
        mocks.updatePassword.mockResolvedValue({ ok: false });
        mocks.updateUsername.mockResolvedValue({ ok: false });
        render(<App />);

        const expected = [
            [/mock account sign out/i, 'Could not sign out.'],
            [/mock account sign in/i, 'Could not sign in with password.'],
            [/mock account sign up/i, 'Could not create your account.'],
            [/mock account resend/i, 'Could not resend the confirmation email.'],
            [/mock account username/i, 'Could not update your username.'],
            [/mock account reset/i, 'Could not send password reset email.'],
            [/mock account password/i, 'Could not update your password.'],
        ] as const;
        for (const [name, message] of expected) {
            expect((await clickAndReport(name)).message).toBe(message);
        }

        act(() => useAccountStore.setState({ session: null }));
        expect((await clickAndReport(/mock account username/i)).message).toBe('Sign in first to update your username.');
    });

    it('covers native non-verification signup plus successful username, recovery, checkout, and portal results', async () => {
        setAccount('signed-in-plus');
        useAccountStore.setState({ requiresPasswordReset: true });
        mocks.nativePlatform.mockReturnValue(true);
        mocks.signUp.mockResolvedValue({ ok: true, requiresEmailVerification: false });
        render(<App />);

        expect((await clickAndReport(/mock account sign up/i)).message).toBe('Account created successfully.');
        expect(mocks.authRedirect).toHaveBeenCalledWith(expect.objectContaining({ native: true }));
        expect((await clickAndReport(/mock account username/i)).message).toBe('Username updated.');
        expect(mocks.loadAccount).toHaveBeenCalled();
        expect((await clickAndReport(/mock account password/i)).message).toMatch(/password updated/i);
        expect(useAccountStore.getState().requiresPasswordReset).toBe(false);
        expect((await clickAndReport(/mock account upgrade/i)).message).toBe('Checkout opened.');
        expect((await clickAndReport(/mock account manage/i)).message).toBe('Portal opened.');
    });

    it('runs locked-session message callbacks for guest and free accounts', async () => {
        useWorkoutStore.setState({ isSidebarCollapsed: true });
        const guestRender = render(<App />);
        fireEvent.click(screen.getByRole('button', { name: /mock create session/i }));
        let dialog = screen.getByRole('dialog', { name: /sign in to unlock session builder/i });
        fireEvent.click(within(dialog).getByRole('button', { name: /open account/i }));
        expect(useWorkoutStore.getState().isSidebarCollapsed).toBe(false);
        guestRender.unmount();

        setAccount('signed-in-free');
        render(<App />);
        fireEvent.click(screen.getByRole('button', { name: /mock create session/i }));
        dialog = screen.getByRole('dialog', { name: /plus required for session builder/i });
        fireEvent.click(within(dialog).getByRole('button', { name: /upgrade to plus/i }));
        await waitFor(() => expect(mocks.startCheckout).toHaveBeenCalled());
    });
});

describe('App URL, responsive, lazy-surface, and timer boundary branches', () => {
    it('shows checkout bootstrap errors for Error and non-Error rejections', async () => {
        window.history.replaceState({}, '', '/?_ptxn=checkout-token');
        mocks.initializeCheckout.mockRejectedValueOnce(new Error('Paddle exploded'));
        const first = render(<App />);
        expect(await screen.findByRole('dialog', { name: /could not open checkout/i })).toHaveTextContent('Paddle exploded');
        first.unmount();

        window.history.replaceState({}, '', '/?_ptxn=other-token');
        mocks.initializeCheckout.mockRejectedValueOnce('no details');
        render(<App />);
        expect(await screen.findByRole('dialog', { name: /could not open checkout/i })).toHaveTextContent('Paddle checkout could not start');
    });

    it('handles canceled, unknown, and rejected portal billing returns and clears their query params', async () => {
        window.history.replaceState({}, '', '/?billing=cancel');
        const canceled = render(<App />);
        expect(await screen.findByRole('dialog', { name: /checkout canceled/i })).toBeInTheDocument();
        expect(window.location.search).toBe('');
        canceled.unmount();

        window.history.replaceState({}, '', '/?billing=unknown');
        const unknown = render(<App />);
        await waitFor(() => expect(window.location.search).toBe(''));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        unknown.unmount();

        window.history.replaceState({}, '', '/?billing=portal');
        mocks.refreshEntitlement.mockRejectedValueOnce(new Error('offline'));
        render(<App />);
        const portalDialog = await screen.findByRole('dialog', { name: /subscription updated/i });
        expect(portalDialog).toHaveTextContent(/could not be refreshed/i);
        await waitFor(() => expect(window.location.search).toBe(''));
    });

    it('reacts to legacy mobile media changes, opens lazy surfaces, and uses both settings toggle paths', async () => {
        const media = installMatchMedia(true, true);
        const { unmount } = render(<App />);
        expect(await screen.findByRole('button', { name: /open navigation/i })).toBeInTheDocument();
        expect(useWorkoutStore.getState().isSidebarCollapsed).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: /mock toggle sidebar/i }));
        fireEvent.click(screen.getByRole('button', { name: /close navigation overlay/i }));
        expect(useWorkoutStore.getState().isSidebarCollapsed).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: /^open settings$/i }));
        expect(await screen.findByTestId('mock-settings')).toBeInTheDocument();
        const settingsButtons = screen.getAllByRole('button', { name: /close settings/i });
        fireEvent.click(settingsButtons.find((button) => button.textContent === '') ?? settingsButtons[0]);
        await waitFor(() => expect(screen.queryByTestId('mock-settings')).not.toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /mock open protocol/i }));
        expect(await screen.findByTestId('mock-protocol')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /mock close protocol/i }));
        await waitFor(() => expect(screen.queryByTestId('mock-protocol')).not.toBeInTheDocument());

        act(() => media.emit(false));
        expect(screen.queryByRole('button', { name: /open navigation/i })).not.toBeInTheDocument();
        unmount();
        expect(media.media.removeListener).toHaveBeenCalled();
    });

    it('resets a finished timer from the boundary UI and renders a resting-status branch', async () => {
        useWorkoutStore.setState({
            appPhase: 'timer',
            timerStatus: 'Finished',
            isTimerRunning: false,
            isWorking: false,
            currentSet: 2,
            currentRep: 4,
            sets: '2',
            reps: '10',
            seconds: '3',
            rest: '15',
            myoReps: '4',
            myoWorkSecs: '2',
            timeLeft: 0,
            settings: { ...useWorkoutStore.getState().settings, fullScreenMode: true },
        });
        render(<App />);
        expect(screen.getByText('Finished')).toBeInTheDocument();
        expect(screen.getByTestId('mock-concentric')).toHaveTextContent('00:00 Rest Period');
        fireEvent.click(screen.getByRole('button', { name: /new session/i }));
        expect(useWorkoutStore.getState().appPhase).toBe('setup');
        expect(mocks.audioInit).toHaveBeenCalled();
        expect(mocks.audioCancelSpeech).toHaveBeenCalled();
    });
});
