import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Activity,
    BookOpen,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Copy,
    Download,
    Dumbbell,
    Layers3,
    Pencil,
    Plus,
    Save,
    Settings2,
    Trash2,
    Upload,
    UserRound,
    X,
} from 'lucide-react';
import AccountCard from '@/components/AccountCard';
import { estimateSessionDurationSeconds, formatEstimatedSessionDuration } from '@/utils/savedSessions';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import type { SavedSession } from '@/types/savedSessions';
import type { SavedWorkout } from '@/types/savedWorkouts';
import { APP_VERSION } from '@/constants/version';
import { cn } from '@/lib/utils';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import type { SidebarProps } from '../Sidebar';

export type KineticSidebarProps = SidebarProps & {
    onNavigate?: (destination: 'workout' | 'session') => void;
    onCloseMobileDrawer?: () => void;
    setupMode?: 'workout' | 'session';
    width?: number;
    onWidthChange?: (width: number) => void;
};

type LibraryTab = 'sessions' | 'workouts';

const MIN_RAIL_WIDTH = 232;
const MAX_RAIL_WIDTH = 360;

const clampRailWidth = (width: number) => Math.max(MIN_RAIL_WIDTH, Math.min(MAX_RAIL_WIDTH, Math.round(width)));

const formatLastUsed = (value: string | null | undefined): string => {
    if (!value) return 'Not used yet';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not used yet';

    return `Used ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
};

interface NavButtonProps {
    icon: React.ReactNode;
    label: string;
    active?: boolean;
    disabled?: boolean;
    collapsed?: boolean;
    onClick: () => void;
    badge?: string;
}

const NavButton = ({ icon, label, active = false, disabled = false, collapsed = false, onClick, badge }: NavButtonProps) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-current={active ? 'page' : undefined}
        aria-label={collapsed ? label : undefined}
        title={collapsed ? label : undefined}
        className={cn(
            'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kinetic-focus)]',
            active
                ? 'bg-[var(--kinetic-theme-color)] text-[var(--kinetic-on-accent)]'
                : 'text-[var(--kinetic-muted)] hover:bg-[var(--kinetic-panel-raised)] hover:text-[var(--kinetic-text)]',
            disabled && 'cursor-not-allowed opacity-45',
            collapsed && 'justify-center px-0',
        )}
    >
        <span className="shrink-0">{icon}</span>
        {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
        {!collapsed && badge && <span className="text-[10px] font-medium text-current/55">{badge}</span>}
    </button>
);
interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    label: string;
    children: React.ReactNode;
}

const ActionButton = ({ label, children, className, ...props }: ActionButtonProps) => (
    <button
        type="button"
        aria-label={label}
        title={label}
        className={cn(
            'console-icon text-[var(--kinetic-muted)]',
            'disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent',
            className,
        )}
        {...props}
    >
        {children}
    </button>
);

interface SessionRowProps {
    session: SavedSession;
    duration: string;
    disabled: boolean;
    onLoad: () => void;
    onDuplicate: () => void;
    onRename: () => void;
    onDelete: () => void;
}

const SessionRow = ({ session, duration, disabled, onLoad, onDuplicate, onRename, onDelete }: SessionRowProps) => (
    <div className="group border-b border-white/[0.07] py-3 last:border-b-0">
        <div className="flex items-start gap-2">
            <button
                type="button"
                onClick={onLoad}
                disabled={disabled}
                className="min-h-11 min-w-0 flex-1 rounded-md text-left focus-visible:outline-2 focus-visible:outline-[var(--kinetic-focus)] disabled:cursor-not-allowed disabled:opacity-50"
                title={`Load ${session.name}`}
                aria-label={`Load ${session.name}`}
            >
                <div className="truncate text-sm font-semibold text-[var(--kinetic-text)]">{session.name}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-[var(--kinetic-muted)]">
                    <span>{session.nodes.length} {session.nodes.length === 1 ? 'node' : 'nodes'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{duration}</span>
                </div>
            </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs text-[var(--kinetic-muted)]">{formatLastUsed(session.lastUsedAt)}</span>
            <div className="flex shrink-0 items-center gap-1">
                <ActionButton label={`Duplicate ${session.name}`} onClick={onDuplicate} disabled={disabled}>
                    <Copy size={12} />
                </ActionButton>
                <ActionButton label={`Rename ${session.name}`} onClick={onRename} disabled={disabled}>
                    <Pencil size={12} />
                </ActionButton>
                <ActionButton label={`Delete ${session.name}`} onClick={onDelete} disabled={disabled} className="hover:border-red-400/40 hover:text-red-300">
                    <Trash2 size={12} />
                </ActionButton>
            </div>
        </div>
    </div>
);

interface WorkoutRowProps {
    workout: SavedWorkout;
    disabled: boolean;
    onLoad: () => void;
    onRename: () => void;
    onDelete: () => void;
}

const WorkoutRow = ({ workout, disabled, onLoad, onRename, onDelete }: WorkoutRowProps) => (
    <div className="group border-b border-white/[0.07] py-3 last:border-b-0">
        <div className="flex items-start gap-2">
            <button
                type="button"
                onClick={onLoad}
                disabled={disabled}
                className="min-h-11 min-w-0 flex-1 rounded-md text-left focus-visible:outline-2 focus-visible:outline-[var(--kinetic-focus)] disabled:cursor-not-allowed disabled:opacity-50"
                title={`Load ${workout.name}`}
                aria-label={`Load ${workout.name}`}
            >
                <div className="truncate text-sm font-semibold text-[var(--kinetic-text)]">{workout.name}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-[var(--kinetic-muted)]">
                    <span>{workout.sets} cycles</span>
                    <span aria-hidden="true">·</span>
                    <span>{workout.reps} activation reps</span>
                </div>
            </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs text-[var(--kinetic-muted)]">{formatLastUsed(workout.lastUsedAt)}</span>
            <div className="flex shrink-0 items-center gap-1">
                <ActionButton label={`Rename ${workout.name}`} onClick={onRename} disabled={disabled}>
                    <Pencil size={12} />
                </ActionButton>
                <ActionButton label={`Delete ${workout.name}`} onClick={onDelete} disabled={disabled} className="hover:border-red-400/40 hover:text-red-300">
                    <Trash2 size={12} />
                </ActionButton>
            </div>
        </div>
    </div>
);

const KineticSidebar = ({
    setShowSettings,
    onOpenProtocolIntel,
    showSettings,
    isMobileViewport = false,
    isCollapsed,
    toggleSidebar,
    appPhase,
    savedWorkouts,
    onSaveCurrent,
    onSaveAsCurrent,
    onLoadWorkout,
    onRenameWorkout,
    onDeleteWorkout,
    onExportLibrary,
    onImportLibrary,
    importSummary,
    clearImportSummary,
    savedSessions,
    onCreateSession,
    onLoadSession,
    onDuplicateSession,
    onRenameSession,
    onDeleteSession,
    account,
    syncSnapshot,
    syncActions,
    isAccountCardCollapsed = false,
    onToggleAccountCardCollapsed,
    onSignInWithPassword,
    onSignUpWithPassword,
    onResendSignUpConfirmation,
    onUpdateUsername,
    onSendPasswordReset,
    onUpdatePassword,
    onSignOut,
    canAccessSessionBuilder = true,
    onUpgradeToPlus,
    onManageSubscription,
    onCheckPlusAccess,
    onNavigate,
    onCloseMobileDrawer,
    setupMode,
    width = 248,
    onWidthChange,
}: KineticSidebarProps) => {
    const [libraryTab, setLibraryTab] = useState<LibraryTab>('sessions');
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const autoCollapsedGuestAccountRef = useRef(false);
    const prepTime = useWorkoutStore((state) => state.settings.prepTime);
    const isSetupMode = appPhase === 'setup';
    const isDrawerOpenOnMobile = isMobileViewport && !isCollapsed;
    const shouldShowExpandedRail = !isCollapsed || isMobileViewport;
    const isAccountResolving = account?.bootstrapStatus === 'idle' || account?.bootstrapStatus === 'bootstrapping';
    const activeSetupMode = setupMode ?? 'workout';
    const railWidth = clampRailWidth(width);
    const appliedRailWidth = isCollapsed && !isMobileViewport
        ? 72
        : (isMobileViewport ? Math.min(railWidth, 320) : railWidth);
    const closeMobileDrawer = onCloseMobileDrawer ?? toggleSidebar;

    const drawerRef = useDialogFocus(isDrawerOpenOnMobile, closeMobileDrawer);

    useEffect(() => {
        if (isAccountResolving) {
            return;
        }

        if (account?.mode !== 'guest') {
            autoCollapsedGuestAccountRef.current = false;
            return;
        }

        if (!isAccountCardCollapsed && !autoCollapsedGuestAccountRef.current) {
            autoCollapsedGuestAccountRef.current = true;
            onToggleAccountCardCollapsed?.();
        }
    }, [account?.mode, isAccountCardCollapsed, isAccountResolving, onToggleAccountCardCollapsed]);

    const sessionDurations = useMemo(
        () => new Map(savedSessions.map((session) => [session.id, estimateSessionDurationSeconds(session, prepTime)])),
        [prepTime, savedSessions],
    );

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            onImportLibrary(JSON.parse(await file.text()));
        } catch {
            onImportLibrary(null);
        } finally {
            event.target.value = '';
        }
    };

    const handleNavigate = (destination: 'workout' | 'session') => {
        if (onNavigate) {
            onNavigate(destination);
            return;
        }

        // Existing SidebarProps has no setup-mode callback. Keeping this
        // fallback makes the session entry useful before parent integration:
        // it opens the established create-session flow.
        if (destination === 'session' && isSetupMode) {
            onCreateSession();
        }
    };

    const updateRailWidth = (nextWidth: number) => {
        onWidthChange?.(clampRailWidth(nextWidth));
    };

    const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
        if (isMobileViewport || isCollapsed || !onWidthChange) return;

        event.preventDefault();
        const startX = event.clientX;
        const startWidth = railWidth;
        event.currentTarget.setPointerCapture(event.pointerId);

        const handlePointerMove = (moveEvent: PointerEvent) => {
            updateRailWidth(startWidth + moveEvent.clientX - startX);
        };
        const handlePointerUp = () => {
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', handlePointerUp);
        };

        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp, { once: true });
    };

    const accountName = isAccountResolving
        ? 'Restoring account…'
        : account?.bootstrapStatus === 'error'
            ? 'Account error'
            : account?.bootstrapStatus === 'disabled'
                ? 'Local account'
                : account?.profile?.username
                    ? `@${account.profile.username}`
                    : account?.mode === 'signed-in-plus'
                        ? 'Plus account'
                        : account?.mode === 'signed-in-free'
                            ? 'Free account'
                            : 'Local account';

    const accountPlan = isAccountResolving
        ? 'Loading'
        : account?.bootstrapStatus === 'error'
            ? 'Error'
            : account?.bootstrapStatus === 'disabled'
                ? 'Local'
                : account?.mode === 'signed-in-plus'
                    ? 'Plus'
                    : account?.mode === 'signed-in-free'
                        ? 'Free'
                        : 'Guest';

    return (
        <aside
            ref={drawerRef}
            role={isDrawerOpenOnMobile ? 'dialog' : undefined}
            aria-modal={isDrawerOpenOnMobile ? true : undefined}
            tabIndex={-1}
            data-testid="kinetic-sidebar"
            aria-label="MyoREP navigation"
            inert={isMobileViewport && !isDrawerOpenOnMobile}
            className={cn(
                'fixed inset-y-0 left-0 z-50 flex h-[100dvh] flex-col overflow-x-hidden border-r border-[var(--kinetic-border)] bg-[var(--kinetic-panel)] text-[var(--kinetic-text)] transition-[width,transform] duration-200 ease-out',
                isDrawerOpenOnMobile ? 'translate-x-0' : isMobileViewport ? '-translate-x-full' : 'translate-x-0',
            )}
            style={{
                width: isMobileViewport ? `min(${appliedRailWidth}px, calc(100vw - max(1rem, var(--safe-left)) - var(--safe-right)))` : `${appliedRailWidth}px`,
                minWidth: isMobileViewport ? 0 : `${appliedRailWidth}px`,
                maxWidth: isMobileViewport ? 'calc(100vw - max(1rem, var(--safe-left)) - var(--safe-right))' : `${MAX_RAIL_WIDTH}px`,
                height: isMobileViewport ? 'var(--viewport-dynamic)' : undefined,
                paddingTop: 'var(--safe-top)',
                paddingBottom: 'var(--safe-bottom)',
                paddingLeft: isMobileViewport ? 'var(--safe-left)' : undefined,
                paddingRight: isMobileViewport ? 'var(--safe-right)' : undefined,
            }}
        >
            {!isMobileViewport && !isCollapsed && onWidthChange && (
                <div
                    data-testid="kinetic-sidebar-resize-handle"
                    role="separator"
                    aria-label="Resize navigation"
                    aria-orientation="vertical"
                    aria-valuemin={MIN_RAIL_WIDTH}
                    aria-valuemax={MAX_RAIL_WIDTH}
                    aria-valuenow={railWidth}
                    tabIndex={0}
                    onPointerDown={handleResizeStart}
                    onKeyDown={(event) => {
                        if (event.key === 'ArrowLeft') {
                            event.preventDefault();
                            updateRailWidth(railWidth - 16);
                        }
                        if (event.key === 'ArrowRight') {
                            event.preventDefault();
                            updateRailWidth(railWidth + 16);
                        }
                        if (event.key === 'Home') {
                            event.preventDefault();
                            updateRailWidth(MIN_RAIL_WIDTH);
                        }
                        if (event.key === 'End') {
                            event.preventDefault();
                            updateRailWidth(MAX_RAIL_WIDTH);
                        }
                    }}
                    className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-[var(--kinetic-theme-color)] focus-visible:after:bg-[var(--kinetic-theme-color)]"
                />
            )}
            <header className={cn('flex min-h-16 shrink-0 items-center border-b border-white/10 px-3', isCollapsed && !isMobileViewport && 'md:justify-center md:px-2')}>
                <div className={cn('flex min-w-0 flex-1 items-center gap-3', isCollapsed && !isMobileViewport && 'md:flex-none')}>
                    {shouldShowExpandedRail ? (
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--kinetic-theme-color)] text-[var(--kinetic-on-accent)]" aria-hidden="true"><Activity size={19} strokeWidth={2.4} /></div>
                    ) : (
                        <button type="button" className="console-icon" onClick={toggleSidebar} aria-label="Open navigation"><Activity size={19} /></button>
                    )}
                    {shouldShowExpandedRail && (
                        <div className="min-w-0">
                            <div className="console-heading truncate text-sm">MyoREP</div>
                            <div className="truncate text-xs text-[var(--kinetic-muted)]">Kinetic console</div>
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={isDrawerOpenOnMobile ? closeMobileDrawer : toggleSidebar}
                    aria-label={isDrawerOpenOnMobile ? 'Close navigation' : isCollapsed ? 'Open navigation' : 'Collapse navigation'}
                    aria-expanded={!isCollapsed}
                    className={cn(
                        'console-icon',
                        isCollapsed && !isMobileViewport && 'md:hidden',
                    )}
                >
                    {isMobileViewport && isCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
                </button>
            </header>

            {shouldShowExpandedRail ? (
                <div className="scroll-contain-y min-h-0 flex-1 overflow-y-auto">
                    <nav aria-label="Primary" className="space-y-1 px-2 pb-4 pt-4">
                        <div className="console-label px-3 pb-2">Navigation</div>
                        <NavButton
                            icon={<Dumbbell size={17} />}
                            label="Workout setup"
                            active={isSetupMode && activeSetupMode === 'workout'}
                            onClick={() => handleNavigate('workout')}
                        />
                        <NavButton
                            icon={<Layers3 size={17} />}
                            label="Session builder"
                            active={isSetupMode && activeSetupMode === 'session'}
                            disabled={!canAccessSessionBuilder || !isSetupMode && !onNavigate}
                            badge={!canAccessSessionBuilder ? 'Plus' : undefined}
                            onClick={() => handleNavigate('session')}
                        />
                        <NavButton
                            icon={<BookOpen size={17} />}
                            label="Protocol Intel"
                            onClick={onOpenProtocolIntel}
                        />
                    </nav>

                    <div className="mx-3 border-t border-white/10" />

                    <section aria-labelledby="kinetic-library-heading" className="px-3 pb-5 pt-4">
                        <div className="flex items-center justify-between gap-2">
                            <h2 id="kinetic-library-heading" className="console-label">Library</h2>
                            <div className="flex items-center gap-1">
                            {libraryTab === 'sessions' ? (
                                <button
                                    type="button"
                                    onClick={onCreateSession}
                                    disabled={!isSetupMode || !canAccessSessionBuilder}
                                    className="console-button console-button--quiet px-2"
                                >
                                    <Plus size={13} />
                                    New
                                </button>
                            ) : null}
                            </div>
                        </div>

                        <div className="mt-3 flex border-b border-[var(--kinetic-border)]" role="tablist" aria-label="Saved library type" onKeyDown={(event) => {
                            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                            event.preventDefault();
                            const nextTab = event.key === 'Home' ? 'sessions' : event.key === 'End' ? 'workouts' : libraryTab === 'sessions' ? 'workouts' : 'sessions';
                            setLibraryTab(nextTab);
                            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextTab === 'sessions' ? 0 : 1]?.focus();
                        }}>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={libraryTab === 'sessions'}
                                tabIndex={libraryTab === 'sessions' ? 0 : -1}
                                onClick={() => setLibraryTab('sessions')}
                                className={cn(
                                    'min-h-11 flex-1 border-b-2 px-1 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-[var(--kinetic-focus)]',
                                    libraryTab === 'sessions' ? 'border-[var(--kinetic-theme-color)] text-[var(--kinetic-text)]' : 'border-transparent text-[var(--kinetic-muted)]',
                                )}
                            >
                                Sessions
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={libraryTab === 'workouts'}
                                tabIndex={libraryTab === 'workouts' ? 0 : -1}
                                onClick={() => setLibraryTab('workouts')}
                                className={cn(
                                    'min-h-11 flex-1 border-b-2 px-1 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-[var(--kinetic-focus)]',
                                    libraryTab === 'workouts' ? 'border-[var(--kinetic-theme-color)] text-[var(--kinetic-text)]' : 'border-transparent text-[var(--kinetic-muted)]',
                                )}
                            >
                                Workouts
                            </button>
                        </div>

                        {libraryTab === 'sessions' ? (
                            <div className="mt-1">
                                {savedSessions.length === 0 ? (
                                    <div className="py-5 text-center text-xs text-[var(--kinetic-muted)]">No saved sessions</div>
                                ) : (
                                    savedSessions.map((session) => (
                                        <SessionRow
                                            key={session.id}
                                            session={session}
                                            duration={formatEstimatedSessionDuration(sessionDurations.get(session.id) ?? null)}
                                            disabled={!isSetupMode}
                                            onLoad={() => onLoadSession(session.id)}
                                            onDuplicate={() => onDuplicateSession(session.id)}
                                            onRename={() => onRenameSession(session.id)}
                                            onDelete={() => onDeleteSession(session.id)}
                                        />
                                    ))
                                )}
                            </div>
                        ) : (
                            <div className="mt-1">
                                <div className="grid grid-cols-2 gap-2 border-b border-white/[0.07] py-3">
                                    <button
                                        type="button"
                                        onClick={onSaveCurrent}
                                        disabled={!isSetupMode}
                                        className="console-button console-button--primary"
                                    >
                                        <Save size={12} />
                                        Save
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onSaveAsCurrent}
                                        disabled={!isSetupMode}
                                        className="console-button"
                                    >
                                        <Copy size={12} />
                                        Save as
                                    </button>
                                </div>
                                {savedWorkouts.length === 0 ? (
                                    <div className="py-5 text-center text-xs text-[var(--kinetic-muted)]">No saved workouts</div>
                                ) : (
                                    savedWorkouts.map((workout) => (
                                        <WorkoutRow
                                            key={workout.id}
                                            workout={workout}
                                            disabled={!isSetupMode}
                                            onLoad={() => onLoadWorkout(workout.id)}
                                            onRename={() => onRenameWorkout(workout.id)}
                                            onDelete={() => onDeleteWorkout(workout.id)}
                                        />
                                    ))
                                )}
                            </div>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="application/json"
                            className="sr-only"
                            tabIndex={-1}
                            onChange={handleFileSelected}
                            aria-label="Import workout library JSON"
                        />

                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--kinetic-border)] pt-3">
                            <button type="button" className="console-button" onClick={() => fileInputRef.current?.click()} disabled={!isSetupMode}><Upload size={15} /> Import</button>
                            <button type="button" className="console-button" onClick={onExportLibrary}><Download size={15} /> Export</button>
                        </div>
                        {importSummary && (
                            <div className="console-section mt-3 text-xs text-[var(--kinetic-muted)]">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="space-y-1">
                                        <div>Workouts: {importSummary.workouts.imported} imported, {importSummary.workouts.renamed} renamed</div>
                                        <div>Sessions: {importSummary.sessions.imported} imported, {importSummary.sessions.renamed} renamed</div>
                                        {importSummary.errors.length > 0 && <div className="text-red-300">{importSummary.errors[0]}</div>}
                                    </div>
                                    <ActionButton label="Dismiss import summary" onClick={clearImportSummary}>
                                        <X size={12} />
                                    </ActionButton>
                                </div>
                            </div>
                        )}
                    </section>

                    {account && (
                        <section className="border-t border-white/10 px-3 pb-5 pt-4" aria-labelledby="kinetic-account-heading">
                            <div className="console-label mb-3 flex items-center gap-2 px-1">
                                <UserRound size={15} />
                                <span id="kinetic-account-heading">Account</span>
                            </div>
                            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-[var(--kinetic-border)] bg-[var(--kinetic-panel-raised)] px-3 py-2">
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-[var(--kinetic-text)]">{accountName}</div>
                                    <div className="mt-0.5 text-xs text-[var(--kinetic-muted)]">{accountPlan}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={onToggleAccountCardCollapsed}
                                    aria-expanded={!isAccountCardCollapsed}
                                    aria-label={isAccountCardCollapsed ? 'Show account details' : 'Hide account details'}
                                    className="console-icon"
                                >
                                    <ChevronDown size={14} className={cn('transition-transform', !isAccountCardCollapsed && 'rotate-180')} />
                                </button>
                            </div>
                            {!isAccountCardCollapsed && (
                                <div className="kinetic-account-card min-w-0 px-1">
                                    <AccountCard
                                        account={account}
                                        syncSnapshot={syncSnapshot}
                                        syncActions={syncActions}
                                        isCollapsed={false}
                                        onSignInWithPassword={onSignInWithPassword}
                                        onSignUpWithPassword={onSignUpWithPassword}
                                        onResendSignUpConfirmation={onResendSignUpConfirmation}
                                        onUpdateUsername={onUpdateUsername}
                                        onSendPasswordReset={onSendPasswordReset}
                                        onUpdatePassword={onUpdatePassword}
                                        onSignOut={onSignOut}
                                        onUpgradeToPlus={onUpgradeToPlus}
                                        onManageSubscription={onManageSubscription}
                                        onCheckPlusAccess={onCheckPlusAccess}
                                    />
                                </div>
                            )}
                        </section>
                    )}
                </div>
            ) : (
                <nav aria-label="Collapsed navigation" className="hidden flex-1 flex-col items-center gap-2 px-2 pt-4 md:flex">
                    <NavButton icon={<Dumbbell size={17} />} label="Workout setup" active={isSetupMode && activeSetupMode === 'workout'} collapsed onClick={() => handleNavigate('workout')} />
                    <NavButton icon={<Layers3 size={17} />} label="Session builder" active={isSetupMode && activeSetupMode === 'session'} disabled={!canAccessSessionBuilder} collapsed onClick={() => handleNavigate('session')} />
                    <NavButton icon={<BookOpen size={17} />} label="Protocol Intel" collapsed onClick={onOpenProtocolIntel} />
                </nav>
            )}

            <footer className={cn('shrink-0 border-t border-white/10 p-3', isCollapsed && !isMobileViewport && 'md:px-2')}>
                <button
                    type="button"
                    onClick={() => setShowSettings(!showSettings)}
                    aria-label={showSettings ? 'Close settings' : 'Open settings'}
                    aria-pressed={showSettings}
                    title={isCollapsed && !isMobileViewport ? 'Settings' : undefined}
                    className={cn(
                        'console-button console-button--quiet h-11 w-full justify-start',
                        showSettings && 'bg-[var(--kinetic-panel-raised)]',
                        isCollapsed && !isMobileViewport && 'md:justify-center md:px-0',
                    )}
                >
                    <Settings2 size={17} className={showSettings ? 'text-[var(--kinetic-theme-color)]' : undefined} />
                    {shouldShowExpandedRail && <span>Settings</span>}
                </button>
                {shouldShowExpandedRail && <div className="mt-3 px-1 text-xs text-[var(--kinetic-muted)]">v{APP_VERSION}</div>}
            </footer>
        </aside>
    );
};

export default React.memo(KineticSidebar);
