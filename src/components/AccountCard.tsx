import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock3,
    Loader2,
    LogOut,
    PauseCircle,
    RefreshCw,
    ShieldCheck,
    Sparkles,
    WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isValidUsername, normalizeUsername } from '@/lib/accountIdentity';
import { cn } from '@/lib/utils';
import type {
    AccountActionResult,
    AccountAuthFormMode,
    AccountSignUpResult,
    AccountSnapshot,
    AccountSyncActions,
    AccountSyncSnapshot,
    AccountSyncSurfaceStatus,
    FirstSyncChoice,
} from '@/types/account';

export interface AccountCardProps {
    account: AccountSnapshot;
    syncSnapshot?: AccountSyncSnapshot;
    syncActions?: AccountSyncActions;
    isCollapsed?: boolean;
    onToggleCollapsed?: () => void;
    onSignInWithPassword?: (email: string, password: string) => Promise<AccountActionResult>;
    onSignUpWithPassword?: (username: string, email: string, password: string) => Promise<AccountSignUpResult>;
    onResendSignUpConfirmation?: (email: string) => Promise<AccountActionResult>;
    onUpdateUsername?: (username: string) => Promise<AccountActionResult>;
    onSendPasswordReset?: (email: string) => Promise<AccountActionResult>;
    onUpdatePassword?: (password: string) => Promise<AccountActionResult>;
    onSignOut?: () => Promise<AccountActionResult>;
    onUpgradeToPlus?: () => Promise<AccountActionResult>;
    onManageSubscription?: () => Promise<AccountActionResult>;
}

type SyncDialogState =
    | {
        kind: 'first-sync-choice';
        title: string;
        description: string;
    }
    | {
        kind: 'disable-sync';
        title: string;
        description: string;
    }
    | null;

type SyncActionSize = 'default' | 'sm' | 'icon';

type ResolvedSyncAction = {
    label: string;
    icon: ReactNode;
    onClick?: () => Promise<AccountActionResult | void> | AccountActionResult | void;
    disabled: boolean;
    variant: 'default' | 'secondary';
    size?: SyncActionSize;
    className?: string;
};

const isEmailLike = (value: string): boolean => {
    const trimmed = value.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
};

const syncBadgeClasses: Record<AccountSyncSurfaceStatus, string> = {
    'sync-off': 'border-border/50 bg-muted/60 text-muted-foreground',
    'sync-available': 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    'enable-sync': 'border-primary/25 bg-primary/10 text-primary',
    'first-sync-required': 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    syncing: 'border-primary/25 bg-primary/10 text-primary',
    'last-synced': 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    'auth-expired': 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    'sync-error': 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
    'sync-paused': 'border-border/50 bg-muted/60 text-muted-foreground',
    offline: 'border-border/50 bg-muted/60 text-muted-foreground',
};

const syncBadgeLabels: Record<AccountSyncSurfaceStatus, string> = {
    'sync-off': 'Sync off',
    'sync-available': 'Available',
    'enable-sync': 'Enable sync',
    'first-sync-required': 'First sync',
    syncing: 'Syncing',
    'last-synced': 'Last synced',
    'auth-expired': 'Auth expired',
    'sync-error': 'Sync error',
    'sync-paused': 'Paused',
    offline: 'Offline',
};

const syncDefaultCopy: Record<AccountSyncSurfaceStatus, string> = {
    'sync-off': 'Cloud sync is turned off for this account.',
    'sync-available': 'Cloud sync is available and ready to switch on.',
    'enable-sync': 'Turn on cloud sync to start backing up workout data.',
    'first-sync-required': 'Run the first sync to seed your cloud data.',
    syncing: 'Syncing changes now.',
    'last-synced': 'Everything is up to date.',
    'auth-expired': 'Your session expired for sync. Sign in again with email and password to continue.',
    'sync-error': 'Cloud sync hit an error and needs attention.',
    'sync-paused': 'Cloud sync is paused until you resume it.',
    offline: 'You are offline, so sync will wait for a connection.',
};

const formatSyncTimestamp = (value: string | null | undefined): string | null => {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

const resolveSyncAction = (syncSnapshot: AccountSyncSnapshot, syncActions?: AccountSyncActions): ResolvedSyncAction | null => {
    switch (syncSnapshot.status) {
        case 'sync-off':
        case 'sync-available':
        case 'enable-sync':
            return syncActions?.onEnableSync
                ? {
                    label: 'Enable sync',
                    icon: <Sparkles size={16} />,
                    onClick: () => syncActions.onEnableSync?.(),
                    disabled: false,
                    variant: 'default' as const,
                    size: 'default' as const,
                }
                : null;
        case 'first-sync-required':
            return syncActions?.onEnableSync
                ? {
                    label: 'Run first sync',
                    icon: <RefreshCw size={16} />,
                    onClick: () => syncActions.onEnableSync?.(),
                    disabled: false,
                    variant: 'default' as const,
                    size: 'default' as const,
                }
                : null;
        case 'syncing':
            return {
                label: 'Syncing',
                icon: <Loader2 className="animate-spin" size={16} />,
                onClick: undefined,
                disabled: true,
                variant: 'secondary' as const,
                size: 'default' as const,
            };
        case 'last-synced':
            return syncActions?.onSyncNow
                ? {
                    label: 'Sync now',
                    icon: <RefreshCw size={16} />,
                    onClick: syncActions.onSyncNow,
                    disabled: false,
                    variant: 'secondary' as const,
                    size: 'sm' as const,
                    className: 'w-auto rounded-full px-3 text-[10px] font-black uppercase tracking-[0.18em]',
                }
                : null;
        case 'auth-expired':
            return null;
        case 'sync-error':
            return syncActions?.onRetrySync
                ? {
                    label: 'Retry sync',
                    icon: <AlertCircle size={16} />,
                    onClick: syncActions.onRetrySync,
                    disabled: false,
                    variant: 'default' as const,
                    size: 'default' as const,
                }
                : null;
        case 'sync-paused':
            return syncActions?.onResumeSync
                ? {
                    label: 'Resume sync',
                    icon: <PauseCircle size={16} />,
                    onClick: syncActions.onResumeSync,
                    disabled: false,
                    variant: 'default' as const,
                    size: 'default' as const,
                }
                : null;
        case 'offline':
            return syncActions?.onRetrySync
                ? {
                    label: 'Try again',
                    icon: <WifiOff size={16} />,
                    onClick: syncActions.onRetrySync,
                    disabled: false,
                    variant: 'secondary' as const,
                    size: 'default' as const,
                }
                : null;
        default:
            return null;
    }
};

const shouldShowDisableSync = (status: AccountSyncSurfaceStatus): boolean => {
    return status === 'syncing'
        || status === 'last-synced'
        || status === 'auth-expired'
        || status === 'sync-error'
        || status === 'sync-paused'
        || status === 'offline';
};

const getSyncStatusIcon = (status: AccountSyncSurfaceStatus) => {
    switch (status) {
        case 'syncing':
            return <Loader2 className="animate-spin" size={14} />;
        case 'sync-error':
            return <AlertCircle size={14} />;
        case 'last-synced':
            return <CheckCircle2 size={14} />;
        case 'auth-expired':
            return <ShieldCheck size={14} />;
        case 'sync-paused':
            return <PauseCircle size={14} />;
        case 'first-sync-required':
            return <Clock3 size={14} />;
        case 'offline':
            return <WifiOff size={14} />;
        default:
            return <Sparkles size={14} />;
    }
};

const AccountCard = ({
    account,
    syncSnapshot,
    syncActions,
    isCollapsed = false,
    onToggleCollapsed,
    onSignInWithPassword,
    onSignUpWithPassword,
    onResendSignUpConfirmation,
    onUpdateUsername,
    onSendPasswordReset,
    onUpdatePassword,
    onSignOut,
    onUpgradeToPlus,
    onManageSubscription,
}: AccountCardProps) => {
    const [username, setUsername] = useState(account.profile?.username ?? '');
    const [email, setEmail] = useState(account.profile?.email ?? '');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [authMode, setAuthMode] = useState<AccountAuthFormMode>('sign-in');
    const [isEditingUsername, setIsEditingUsername] = useState(false);
    const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [dialogState, setDialogState] = useState<SyncDialogState>(null);
    const isCollapsible = (account.mode === 'signed-in-free' || account.mode === 'signed-in-plus') && !account.requiresPasswordReset;
    const shouldCollapse = isCollapsible && isCollapsed;

    useEffect(() => {
        if (account.profile?.username) {
            setUsername(account.profile.username);
            return;
        }

        if (account.mode === 'guest') {
            setUsername('');
        }
    }, [account.mode, account.profile?.username]);

    useEffect(() => {
        if (account.profile?.email) {
            setEmail(account.profile.email);
            return;
        }

        if (account.mode === 'guest') {
            setEmail('');
        }
    }, [account.mode, account.profile?.email]);

    useEffect(() => {
        if (account.requiresPasswordReset) {
            setAuthMode('forgot-password');
        }
    }, [account.requiresPasswordReset]);

    useEffect(() => {
        if (account.mode === 'guest') {
            setIsEditingUsername(false);
        }
    }, [account.mode]);

    const title = useMemo(() => {
        if (account.requiresPasswordReset) return 'Set a new password';
        if (account.bootstrapStatus === 'bootstrapping') return 'Checking account';
        if (account.bootstrapStatus === 'disabled') return 'Local only';
        if (account.bootstrapStatus === 'error') return 'Account error';
        if (account.mode === 'signed-in-plus') return 'Signed in';
        if (account.mode === 'signed-in-free') return 'Signed in';
        return 'Sign in for cloud sync';
    }, [account.bootstrapStatus, account.mode, account.requiresPasswordReset]);

    const supportingCopy = useMemo(() => {
        if (account.requiresPasswordReset) return 'Your reset link is active. Set a new password to finish recovering this account.';
        if (account.bootstrapStatus === 'bootstrapping') return 'Loading your session and entitlement state.';
        if (account.bootstrapStatus === 'disabled') return 'Supabase is off, so the app stays local-only.';
        if (account.bootstrapStatus === 'error') return account.error ?? 'We could not load the account state.';
        if (account.mode === 'signed-in-plus') return 'Plus features are active on this account.';
        if (account.mode === 'signed-in-free') return 'Signing in creates account identity. Cloud sync stays locked on free.';
        return 'Local workouts and sessions stay on this device until you sign in with email and password.';
    }, [account.bootstrapStatus, account.error, account.mode, account.requiresPasswordReset]);

    const badge = useMemo(() => {
        if (account.mode === 'signed-in-plus') return 'Plus';
        if (account.mode === 'signed-in-free') return 'Free';
        if (account.bootstrapStatus === 'disabled') return 'Local';
        if (account.bootstrapStatus === 'error') return 'Error';
        if (account.bootstrapStatus === 'bootstrapping') return 'Loading';
        return 'Guest';
    }, [account.bootstrapStatus, account.mode]);

    const syncSurface = useMemo(() => {
        if (!syncSnapshot) {
            return null;
        }

        const action = resolveSyncAction(syncSnapshot, syncActions);
        const timestamp = formatSyncTimestamp(syncSnapshot.lastSyncedAt);
        const detail = syncSnapshot.detail?.trim() || syncDefaultCopy[syncSnapshot.status];

        return {
            action,
            detail,
            status: syncSnapshot.status,
            timestamp,
            disableAction: shouldShowDisableSync(syncSnapshot.status) && syncActions?.onDisableSync
                ? {
                    label: 'Turn sync off',
                    onClick: syncActions.onDisableSync,
                }
                : null,
        };
    }, [syncActions, syncSnapshot]);

    const legacySyncLine = useMemo(() => {
        if (syncSurface) {
            return null;
        }

        if (account.syncStatus === 'syncing') {
            return {
                icon: <Loader2 className="animate-spin" size={12} />,
                label: 'Syncing account state',
                tone: 'text-muted-foreground/60',
            };
        }

        if (account.syncStatus === 'error') {
            return {
                icon: <AlertCircle size={12} />,
                label: 'Sync unavailable',
                tone: 'text-muted-foreground/60',
            };
        }

        return null;
    }, [account.syncStatus, syncSurface]);

    const handlePasswordSignIn = async () => {
        if (!onSignInWithPassword || isSubmitting || account.bootstrapStatus === 'disabled') {
            return;
        }

        const trimmedEmail = email.trim();
        if (!isEmailLike(trimmedEmail)) {
            setNotice({ tone: 'error', text: 'Enter a valid email address.' });
            return;
        }

        if (!password.trim()) {
            setNotice({ tone: 'error', text: 'Enter your password.' });
            return;
        }

        setIsSubmitting(true);
        setNotice(null);
        try {
            const result = await onSignInWithPassword(trimmedEmail, password);
            setNotice({
                tone: result.ok ? 'success' : 'error',
                text: result.message,
            });
            if (result.ok) {
                setPassword('');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordSignUp = async () => {
        if (!onSignUpWithPassword || isSubmitting || account.bootstrapStatus === 'disabled') {
            return;
        }

        const normalizedUsername = normalizeUsername(username);
        if (!isValidUsername(normalizedUsername)) {
            setNotice({ tone: 'error', text: 'Use 3-24 lowercase letters, numbers, or underscores for your username.' });
            return;
        }

        const trimmedEmail = email.trim();
        if (!isEmailLike(trimmedEmail)) {
            setNotice({ tone: 'error', text: 'Enter a valid email address.' });
            return;
        }

        if (!password.trim()) {
            setNotice({ tone: 'error', text: 'Create a password first.' });
            return;
        }

        if (password.length < 8) {
            setNotice({ tone: 'error', text: 'Use at least 8 characters for your password.' });
            return;
        }

        if (password !== confirmPassword) {
            setNotice({ tone: 'error', text: 'Password confirmation does not match.' });
            return;
        }

        setIsSubmitting(true);
        setNotice(null);
        try {
            const result = await onSignUpWithPassword(normalizedUsername, trimmedEmail, password);
            setNotice({
                tone: result.ok ? 'success' : 'error',
                text: result.message,
            });
            if (result.ok) {
                setPassword('');
                setConfirmPassword('');
                setAuthMode('sign-in');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUsernameUpdate = async () => {
        if (!onUpdateUsername || isSubmitting) {
            return;
        }

        const normalizedUsername = normalizeUsername(username);
        if (!isValidUsername(normalizedUsername)) {
            setNotice({ tone: 'error', text: 'Use 3-24 lowercase letters, numbers, or underscores for your username.' });
            return;
        }

        if (normalizedUsername === account.profile?.username) {
            setNotice({ tone: 'info', text: 'Your username is already up to date.' });
            setIsEditingUsername(false);
            return;
        }

        setIsSubmitting(true);
        setNotice(null);
        try {
            const result = await onUpdateUsername(normalizedUsername);
            setNotice({
                tone: result.ok ? 'success' : 'error',
                text: result.message,
            });
            if (result.ok) {
                setIsEditingUsername(false);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordReset = async () => {
        if (!onSendPasswordReset || isSubmitting || account.bootstrapStatus === 'disabled') {
            return;
        }

        const trimmedEmail = email.trim();
        if (!isEmailLike(trimmedEmail)) {
            setNotice({ tone: 'error', text: 'Enter a valid email address.' });
            return;
        }

        setIsSubmitting(true);
        setNotice(null);
        try {
            const result = await onSendPasswordReset(trimmedEmail);
            setNotice({
                tone: result.ok ? 'success' : 'error',
                text: result.message,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResendConfirmation = async () => {
        if (!onResendSignUpConfirmation || isSubmitting || account.bootstrapStatus === 'disabled') {
            return;
        }

        const trimmedEmail = email.trim();
        if (!isEmailLike(trimmedEmail)) {
            setNotice({ tone: 'error', text: 'Enter a valid email address.' });
            return;
        }

        setIsSubmitting(true);
        setNotice(null);
        try {
            const result = await onResendSignUpConfirmation(trimmedEmail);
            setNotice({
                tone: result.ok ? 'success' : 'error',
                text: result.message,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordUpdate = async () => {
        if (!onUpdatePassword || isSubmitting) {
            return;
        }

        if (!password.trim()) {
            setNotice({ tone: 'error', text: 'Enter a new password.' });
            return;
        }

        if (password.length < 8) {
            setNotice({ tone: 'error', text: 'Use at least 8 characters for your new password.' });
            return;
        }

        if (password !== confirmPassword) {
            setNotice({ tone: 'error', text: 'Password confirmation does not match.' });
            return;
        }

        setIsSubmitting(true);
        setNotice(null);
        try {
            const result = await onUpdatePassword(password);
            setNotice({
                tone: result.ok ? 'success' : 'error',
                text: result.message,
            });
            if (result.ok) {
                setPassword('');
                setConfirmPassword('');
                setAuthMode('sign-in');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSignOut = async () => {
        if (!onSignOut || isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        setNotice(null);
        try {
            const result = await onSignOut();
            setNotice({
                tone: result.ok ? 'success' : 'error',
                text: result.message,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpgradeToPlus = async () => {
        if (!onUpgradeToPlus || isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        setNotice(null);
        try {
            const result = await onUpgradeToPlus();
            setNotice({
                tone: result.ok ? 'success' : 'error',
                text: result.message,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleManageSubscription = async () => {
        if (!onManageSubscription || isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        setNotice(null);
        try {
            const result = await onManageSubscription();
            setNotice({
                tone: result.ok ? 'success' : 'error',
                text: result.message,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const canUsePasswordAuth = account.bootstrapStatus !== 'bootstrapping' && account.bootstrapStatus !== 'disabled';
    const canSignOut = Boolean(onSignOut) && account.mode !== 'guest' && account.bootstrapStatus !== 'bootstrapping';

    const applyActionResult = (result?: AccountActionResult | void) => {
        if (!result) {
            return;
        }

        setNotice({
            tone: result.ok ? 'success' : 'error',
            text: result.message,
        });
    };

    const handleSyncChoice = async (choice: FirstSyncChoice) => {
        if (!syncActions?.onEnableSync || isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        setNotice(null);
        try {
            const result = await syncActions.onEnableSync(choice);
            applyActionResult(result);
            setDialogState(null);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePrimarySyncAction = async () => {
        if (!syncSurface?.action || isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        setNotice(null);
        try {
            const result = await syncSurface.action.onClick?.();
            if (result?.requiresChoice) {
                setDialogState({
                    kind: 'first-sync-choice',
                    title: 'Choose first sync direction',
                    description: 'Decide whether this device uploads its local library to the cloud or replaces its local library with the current cloud snapshot.',
                });
                return;
            }

            applyActionResult(result);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDisableSync = async () => {
        if (!syncActions?.onDisableSync || isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        setNotice(null);
        try {
            const result = await syncActions.onDisableSync();
            applyActionResult(result);
            setDialogState(null);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card className="border-border/60 bg-card/80 shadow-sm">
            <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                        <div className="text-[10px] font-black uppercase tracking-[0.32em] text-muted-foreground/60">Account</div>
                        <div className="text-base font-black italic tracking-tighter text-foreground">
                            {shouldCollapse ? `Signed In - ${account.profile?.username ?? 'connected_account'}` : title}
                        </div>
                        {shouldCollapse && (
                            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-muted-foreground/80">
                                {badge}
                            </div>
                        )}
                    </div>
                    <div className="flex shrink-0 items-start gap-2">
                        {isCollapsible && (
                            <Button
                                type="button"
                                variant="ghost"
                                className="h-8 rounded-lg px-2.5 text-[10px] font-black uppercase tracking-[0.16em]"
                                onClick={onToggleCollapsed}
                            >
                                {shouldCollapse ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                {shouldCollapse ? 'Show' : 'Hide'}
                            </Button>
                        )}
                    </div>
                </div>

                {shouldCollapse ? null : (
                    <>

                {(account.mode === 'signed-in-plus' || account.mode === 'signed-in-free') && !account.requiresPasswordReset ? (
                    <div className="space-y-3 rounded-[22px] border border-border/60 bg-background/60 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-0.5">
                                <div className="truncate text-base font-black tracking-tight text-foreground">
                                    @{account.profile?.username ?? 'connected_account'}
                                </div>
                                <div className="truncate text-[11px] font-medium text-muted-foreground">
                                    {badge}
                                    {account.profile?.email ? ` | ${account.profile.email}` : ''}
                                </div>
                            </div>
                            {onUpdateUsername && !isEditingUsername && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-8 shrink-0 rounded-lg px-3 text-[10px] font-black uppercase tracking-[0.18em]"
                                    onClick={() => {
                                        setUsername(account.profile?.username ?? '');
                                        setIsEditingUsername(true);
                                        setNotice(null);
                                    }}
                                    disabled={isSubmitting}
                                >
                                    Change
                                </Button>
                            )}
                        </div>
                        <p className="text-[12px] leading-relaxed text-muted-foreground sm:text-[11px]">{supportingCopy}</p>

                        {onUpdateUsername && isEditingUsername && (
                            <div className="space-y-2">
                                <Input
                                    id="account-username-update"
                                    value={username}
                                    onChange={(event) => setUsername(normalizeUsername(event.target.value))}
                                    placeholder="your_username"
                                    autoComplete="username"
                                    className="h-11 rounded-xl border-border/60 bg-background"
                                    disabled={isSubmitting}
                                />
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        className="h-10 flex-1 rounded-xl font-bold"
                                        onClick={handleUsernameUpdate}
                                        disabled={isSubmitting}
                                    >
                                        Save username
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="h-10 rounded-xl font-bold"
                                        onClick={() => {
                                            setUsername(account.profile?.username ?? '');
                                            setIsEditingUsername(false);
                                        }}
                                        disabled={isSubmitting}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold text-muted-foreground">
                                {account.mode === 'signed-in-plus' ? 'Cloud sync available' : 'Cloud sync locked'}
                            </span>
                        </div>
                        {account.mode === 'signed-in-free' && onUpgradeToPlus && (
                            <Button
                                type="button"
                                className="h-11 w-full justify-center rounded-xl font-bold"
                                onClick={handleUpgradeToPlus}
                                disabled={isSubmitting}
                            >
                                <Sparkles size={16} />
                                Upgrade to Plus
                            </Button>
                        )}
                        {account.mode === 'signed-in-plus' && onManageSubscription && (
                            <Button
                                type="button"
                                variant="secondary"
                                className="h-11 w-full justify-center rounded-xl font-bold"
                                onClick={handleManageSubscription}
                                disabled={isSubmitting}
                            >
                                <RefreshCw size={16} />
                                Manage subscription
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="secondary"
                            className="h-11 w-full justify-center rounded-xl font-bold"
                            onClick={handleSignOut}
                            disabled={!canSignOut}
                        >
                            <LogOut size={16} />
                            Sign out
                        </Button>
                    </div>
                        ) : (
                    <div className="space-y-2.5 rounded-xl border border-border/60 bg-background/60 p-3">
                        <p className="text-[12px] leading-relaxed text-muted-foreground sm:text-[11px]">{supportingCopy}</p>
                        {!account.requiresPasswordReset && (
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    type="button"
                                    variant={authMode === 'sign-in' ? 'default' : 'secondary'}
                                    className="h-10 rounded-xl text-[10px] font-black uppercase tracking-[0.2em]"
                                    onClick={() => setAuthMode('sign-in')}
                                    disabled={!canUsePasswordAuth || isSubmitting}
                                >
                                    Sign in
                                </Button>
                                <Button
                                    type="button"
                                    variant={authMode === 'sign-up' ? 'default' : 'secondary'}
                                    className="h-10 rounded-xl text-[10px] font-black uppercase tracking-[0.2em]"
                                    onClick={() => setAuthMode('sign-up')}
                                    disabled={!canUsePasswordAuth || isSubmitting}
                                >
                                    Create
                                </Button>
                            </div>
                        )}

                        <div className="space-y-2">
                            {authMode === 'sign-up' && (
                                <div className="space-y-2">
                                    <Label htmlFor="account-username" className="text-[10px] font-black uppercase tracking-[0.28em] text-muted-foreground/70">
                                        Username
                                    </Label>
                                    <Input
                                        id="account-username"
                                        type="text"
                                        autoComplete="username"
                                        value={username}
                                        onChange={(event) => setUsername(normalizeUsername(event.target.value))}
                                        placeholder="your_username"
                                        className="h-11 rounded-xl border-border/60 bg-background"
                                        disabled={!canUsePasswordAuth || isSubmitting}
                                    />
                                </div>
                            )}

                            <Label htmlFor="account-email" className="text-[10px] font-black uppercase tracking-[0.28em] text-muted-foreground/70">
                                Email
                            </Label>
                            <Input
                                id="account-email"
                                type="email"
                                autoComplete="email"
                                inputMode="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="name@example.com"
                                className="h-11 rounded-xl border-border/60 bg-background"
                                disabled={!canUsePasswordAuth || isSubmitting}
                            />
                        </div>

                        {(authMode === 'sign-in' || authMode === 'sign-up' || account.requiresPasswordReset) && (
                            <div className="space-y-2">
                                <Label htmlFor="account-password" className="text-[10px] font-black uppercase tracking-[0.28em] text-muted-foreground/70">
                                    {account.requiresPasswordReset ? 'New password' : 'Password'}
                                </Label>
                                <Input
                                    id="account-password"
                                    type="password"
                                    autoComplete={account.requiresPasswordReset ? 'new-password' : (authMode === 'sign-up' ? 'new-password' : 'current-password')}
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder={account.requiresPasswordReset ? 'Enter a new password' : (authMode === 'sign-up' ? 'Create a password' : 'Enter your password')}
                                    className="h-11 rounded-xl border-border/60 bg-background"
                                    disabled={!canUsePasswordAuth || isSubmitting}
                                />
                            </div>
                        )}

                        {(authMode === 'sign-up' || account.requiresPasswordReset) && (
                            <div className="space-y-2">
                                <Label htmlFor="account-password-confirm" className="text-[10px] font-black uppercase tracking-[0.28em] text-muted-foreground/70">
                                    Confirm password
                                </Label>
                                <Input
                                    id="account-password-confirm"
                                    type="password"
                                    autoComplete="new-password"
                                    value={confirmPassword}
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                    placeholder="Re-enter your password"
                                    className="h-11 rounded-xl border-border/60 bg-background"
                                    disabled={!canUsePasswordAuth || isSubmitting}
                                />
                            </div>
                        )}

                        <div className="text-[12px] leading-relaxed text-muted-foreground sm:text-[11px]">
                            {account.requiresPasswordReset
                                ? 'Set a new password to finish recovering this account, then continue with the same account state.'
                                : authMode === 'sign-up'
                                    ? 'Create your account, then use the confirmation magic link from your email before signing in with your password.'
                                    : authMode === 'forgot-password'
                                        ? 'Send a reset email, then follow the link to set a new password on this device.'
                                        : 'Sign in with email and password after you confirm your email address.'}
                        </div>

                        {account.requiresPasswordReset ? (
                            <Button
                                type="button"
                                className="h-11 w-full justify-center rounded-xl font-bold"
                                onClick={handlePasswordUpdate}
                                disabled={!canUsePasswordAuth || isSubmitting}
                            >
                                <ShieldCheck size={16} />
                                Update password
                            </Button>
                        ) : authMode === 'sign-up' ? (
                            <Button
                                type="button"
                                className="h-11 w-full justify-center rounded-xl font-bold"
                                onClick={handlePasswordSignUp}
                                disabled={!canUsePasswordAuth || isSubmitting}
                            >
                                <ShieldCheck size={16} />
                                Create account
                            </Button>
                        ) : authMode === 'forgot-password' ? (
                            <Button
                                type="button"
                                className="h-11 w-full justify-center rounded-xl font-bold"
                                onClick={handlePasswordReset}
                                disabled={!canUsePasswordAuth || isSubmitting}
                            >
                                <RefreshCw size={16} />
                                Send reset email
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                className="h-11 w-full justify-center rounded-xl font-bold"
                                onClick={handlePasswordSignIn}
                                disabled={!canUsePasswordAuth || isSubmitting}
                            >
                                <ShieldCheck size={16} />
                                Sign in with password
                            </Button>
                        )}

                        {!account.requiresPasswordReset && (
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-muted-foreground">
                                <button
                                    type="button"
                                    className="text-left underline underline-offset-4"
                                    onClick={() => setAuthMode(authMode === 'forgot-password' ? 'sign-in' : 'forgot-password')}
                                    disabled={!canUsePasswordAuth || isSubmitting}
                                >
                                    {authMode === 'forgot-password' ? 'Back to sign in' : 'Forgot password?'}
                                </button>
                                {authMode !== 'forgot-password' && onResendSignUpConfirmation && (
                                    <button
                                        type="button"
                                        className="text-left underline underline-offset-4"
                                        onClick={() => void handleResendConfirmation()}
                                        disabled={!canUsePasswordAuth || isSubmitting}
                                    >
                                        Resend confirmation link
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {syncSurface && (
                    <div className="space-y-2.5 rounded-xl border border-border/60 bg-background/60 p-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                                <div className="text-[10px] font-black uppercase tracking-[0.28em] text-muted-foreground/60">Sync</div>
                                <div className="text-sm font-bold text-foreground">{syncBadgeLabels[syncSurface.status]}</div>
                            </div>
                            <div className={cn(
                                'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.22em]',
                                syncBadgeClasses[syncSurface.status],
                            )}>
                                {getSyncStatusIcon(syncSurface.status)}
                                <span>{syncBadgeLabels[syncSurface.status]}</span>
                            </div>
                        </div>

                        <p className="text-[12px] leading-relaxed text-muted-foreground sm:text-[11px]">{syncSurface.detail}</p>

                        {syncSurface.timestamp && (
                            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/60">
                                Last synced {syncSurface.timestamp}
                            </div>
                        )}

                        {(syncSurface.action || syncSurface.disableAction) && (
                            <div className="space-y-2">
                                {syncSurface.action && (
                                    <Button
                                        type="button"
                                        variant={syncSurface.action.variant}
                                        size={syncSurface.action.size}
                                        className={cn(
                                            syncSurface.action.size === 'sm'
                                                ? 'h-9 w-auto justify-center rounded-full px-3'
                                                : 'h-11 w-full justify-center rounded-xl font-bold',
                                            syncSurface.action.className,
                                        )}
                                        onClick={handlePrimarySyncAction}
                                        disabled={syncSurface.action.disabled || isSubmitting}
                                    >
                                        {syncSurface.action.icon}
                                        {syncSurface.action.label}
                                    </Button>
                                )}
                                {syncSurface.disableAction && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-10 w-full justify-center rounded-xl font-bold"
                                        onClick={() => {
                                            setDialogState({
                                                kind: 'disable-sync',
                                                title: 'Turn sync off on this device?',
                                                description: 'Cloud sync will stop on this device, but your current local workout and session library will stay here.',
                                            });
                                        }}
                                        disabled={isSubmitting}
                                    >
                                        {syncSurface.disableAction.label}
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {notice && (
                    <div
                        className={cn(
                            'rounded-xl border px-3 py-2 text-[12px] leading-relaxed sm:text-[11px]',
                            notice.tone === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                            notice.tone === 'error' && 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
                            notice.tone === 'info' && 'border-border/60 bg-muted/40 text-muted-foreground',
                        )}
                    >
                        {notice.text}
                    </div>
                )}

                {legacySyncLine && (
                    <div className={cn('flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em]', legacySyncLine.tone)}>
                        {legacySyncLine.icon}
                        <span>{legacySyncLine.label}</span>
                    </div>
                )}

                {dialogState && (
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={dialogState.title}
                        className="fixed inset-0 z-[130] flex items-end justify-center bg-black/75 px-[max(1rem,var(--safe-left))] py-[max(1rem,var(--safe-bottom))] backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
                        onPointerDown={(event) => {
                            if (event.target === event.currentTarget) {
                                setDialogState(null);
                            }
                        }}
                    >
                        <div className="max-h-[calc(var(--viewport-dynamic)-var(--safe-top)-var(--safe-bottom)-1rem)] w-full max-w-md overflow-y-auto rounded-[28px] border border-border/60 bg-background/95 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.45)] scroll-contain-y sm:p-6">
                            <div className="space-y-2">
                                <div className="text-[11px] font-black uppercase tracking-[0.32em] text-primary">
                                    {dialogState.kind === 'first-sync-choice' ? 'First Sync' : 'Confirm Action'}
                                </div>
                                <h2 className="text-2xl font-black italic tracking-tight text-foreground">
                                    {dialogState.title}
                                </h2>
                                <p className="text-sm leading-relaxed text-muted-foreground">
                                    {dialogState.description}
                                </p>
                            </div>

                            {dialogState.kind === 'first-sync-choice' ? (
                                <div className="mt-6 grid gap-2">
                                    <Button
                                        type="button"
                                        className="min-h-11 justify-start whitespace-normal rounded-2xl px-4 py-3 text-left text-[11px] font-black leading-snug"
                                        onClick={() => void handleSyncChoice('upload-local')}
                                        disabled={isSubmitting}
                                    >
                                        Upload local to cloud
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="min-h-11 justify-start whitespace-normal rounded-2xl px-4 py-3 text-left text-[11px] font-black leading-snug"
                                        onClick={() => void handleSyncChoice('replace-local')}
                                        disabled={isSubmitting}
                                    >
                                        Use cloud on this device
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-11 rounded-2xl font-black"
                                        onClick={() => setDialogState(null)}
                                        disabled={isSubmitting}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            ) : (
                                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="rounded-2xl font-black"
                                        onClick={() => setDialogState(null)}
                                        disabled={isSubmitting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        className="rounded-2xl font-black"
                                        onClick={() => void handleDisableSync()}
                                        disabled={isSubmitting}
                                    >
                                        Turn Sync Off
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                    </>
                )}
            </CardContent>
        </Card>
    );
};

export default AccountCard;
