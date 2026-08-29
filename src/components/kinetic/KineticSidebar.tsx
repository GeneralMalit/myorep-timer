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
    FolderOpen,
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
import type { SidebarProps } from '../Sidebar';

/**
 * Optional navigation state is kept additive so the component can be dropped
 * into the existing App without changing the established SidebarProps
 * contract. The current Sidebar did not expose setup-mode callbacks/state;
 * the parent can provide these when the kinetic rail is wired to that state.
 */
export type KineticSidebarProps = SidebarProps & {
    onNavigate?: (destination: 'workout' | 'session') => void;
    setupMode?: 'workout' | 'session';
    width?: number;
    onWidthChange?: (width: number) => void;
};

type LibraryTab = 'sessions' | 'workouts';

const MIN_RAIL_WIDTH = 232;
const MAX_RAIL_WIDTH = 360;

const clampRailWidth = (width: number) => Math.max(MIN_RAIL_WIDTH, Math.min(MAX_RAIL_WIDTH, Math.round(width)));

const rail = {
    graphite: '#151617',
    graphiteElevated: '#1c1e20',
    graphiteSoft: '#24272a',
    line: 'rgba(255,255,255,0.1)',
    text: '#f2f0ed',
    muted: '#96908b',
    coral: '#ff6847',
    lime: '#a8ff5a',
    blue: '#74c7ff',
} as const;

const themes = [
    { id: 'theme-default', name: 'Deep Purple', color: '#bb86fc' },
    { id: 'theme-ocean', name: 'Ocean Blue', color: '#03dac6' },
    { id: 'theme-fire', name: 'Crimson Fire', color: '#cf6679' },
    { id: 'theme-forest', name: 'Neon Forest', color: '#00e676' },
] as const;

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
            'group flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6847] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151617]',
            active
                ? 'bg-[#ff6847] text-[#161616]'
                : 'text-[#b7b1ad] hover:bg-white/[0.07] hover:text-[#f2f0ed]',
            disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent hover:text-[#b7b1ad]',
            collapsed && 'justify-center px-0',
        )}
    >
        <span className={cn('shrink-0', active ? 'text-[#161616]' : 'text-[#ff6847]')}>{icon}</span>
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
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-[#aaa39f] transition-colors duration-150',
            'hover:border-white/20 hover:bg-white/[0.08] hover:text-[#f2f0ed]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6847] focus-visible:ring-offset-1 focus-visible:ring-offset-[#1c1e20]',
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
                className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6847] focus-visible:ring-offset-1 focus-visible:ring-offset-[#151617] disabled:cursor-not-allowed disabled:opacity-50"
                title={`Load ${session.name}`}
            >
                <div className="truncate text-xs font-semibold text-[#e7e3df] group-hover:text-white">{session.name}</div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-[#85807b]">
                    <span>{session.nodes.length} {session.nodes.length === 1 ? 'node' : 'nodes'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{duration}</span>
                </div>
            </button>
            <ActionButton label={`Load ${session.name}`} onClick={onLoad} disabled={disabled} className="text-[#ff8467]">
                <FolderOpen size={13} />
            </ActionButton>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
            <span className="truncate text-[10px] text-[#706a66]">{formatLastUsed(session.lastUsedAt)}</span>
            <div className="flex shrink-0 items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
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
                className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6847] focus-visible:ring-offset-1 focus-visible:ring-offset-[#151617] disabled:cursor-not-allowed disabled:opacity-50"
                title={`Load ${workout.name}`}
            >
                <div className="truncate text-xs font-semibold text-[#e7e3df] group-hover:text-white">{workout.name}</div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-[#85807b]">
                    <span>{workout.sets} cycles</span>
                    <span aria-hidden="true">·</span>
                    <span>{workout.reps} activation reps</span>
                </div>
            </button>
            <ActionButton label={`Load ${workout.name}`} onClick={onLoad} disabled={disabled} className="text-[#ff8467]">
                <FolderOpen size={13} />
            </ActionButton>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
            <span className="truncate text-[10px] text-[#706a66]">{formatLastUsed(workout.lastUsedAt)}</span>
            <div className="flex shrink-0 items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
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
    currentTheme,
    setTheme,
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
    onNavigate,
    setupMode,
    width = 248,
    onWidthChange,
}: KineticSidebarProps) => {
    const [libraryTab, setLibraryTab] = useState<LibraryTab>('sessions');
    const [showThemes, setShowThemes] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const autoCollapsedGuestAccountRef = useRef(false);
    const prepTime = useWorkoutStore((state) => state.settings.prepTime);
    const isSetupMode = appPhase === 'setup';
    const isDrawerOpenOnMobile = isMobileViewport && !isCollapsed;
    const shouldShowExpandedRail = !isCollapsed || isMobileViewport;
    const activeSetupMode = setupMode ?? 'workout';
    const railWidth = clampRailWidth(width);
    const appliedRailWidth = isCollapsed && !isMobileViewport
        ? 72
        : (isMobileViewport ? Math.min(railWidth, 320) : railWidth);

    useEffect(() => {
        if (account?.mode !== 'guest') {
            autoCollapsedGuestAccountRef.current = false;
            return;
        }

        if (!isAccountCardCollapsed && !autoCollapsedGuestAccountRef.current) {
            autoCollapsedGuestAccountRef.current = true;
            onToggleAccountCardCollapsed?.();
        }
    }, [account?.mode, isAccountCardCollapsed, onToggleAccountCardCollapsed]);

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

    const accountName = account?.profile?.username
        ? `@${account.profile.username}`
        : account?.mode === 'signed-in-plus'
            ? 'Plus account'
            : account?.mode === 'signed-in-free'
                ? 'Free account'
                : 'Local account';

    const accountPlan = account?.mode === 'signed-in-plus'
        ? 'Plus'
        : account?.mode === 'signed-in-free'
            ? 'Free'
            : account?.bootstrapStatus === 'disabled'
                ? 'Local'
                : 'Guest';

    return (
        <aside
            data-testid="kinetic-sidebar"
            aria-label="MyoREP navigation"
            className={cn(
                'fixed inset-y-0 left-0 z-50 flex h-[100dvh] flex-col overflow-x-hidden border-r border-white/10 bg-[#151617] text-[#f2f0ed] shadow-[8px_0_28px_rgba(0,0,0,0.22)] transition-[width,transform] duration-200 ease-out md:shadow-none',
                isDrawerOpenOnMobile ? 'translate-x-0' : isMobileViewport ? '-translate-x-full' : 'translate-x-0',
            )}
            style={{
                width: isMobileViewport ? `min(${appliedRailWidth}px, calc(100vw - 1rem))` : `${appliedRailWidth}px`,
                minWidth: isMobileViewport ? 0 : `${appliedRailWidth}px`,
                maxWidth: isMobileViewport ? 'calc(100vw - 1rem)' : `${MAX_RAIL_WIDTH}px`,
                paddingTop: 'env(safe-area-inset-top, 0px)',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
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
                    className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-[#ff6847]/80 focus-visible:after:bg-[#ff6847]"
                />
            )}
            <header className={cn('flex min-h-16 shrink-0 items-center border-b border-white/10 px-3', isCollapsed && !isMobileViewport && 'md:justify-center md:px-2')}>
                <div className={cn('flex min-w-0 flex-1 items-center gap-3', isCollapsed && !isMobileViewport && 'md:flex-none')}>
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#ff6847] text-[#161616]" aria-hidden="true">
                        <Activity size={19} strokeWidth={2.4} />
                    </div>
                    {shouldShowExpandedRail && (
                        <div className="min-w-0">
                            <div className="truncate font-['Sora'] text-sm font-bold tracking-[-0.02em]">MyoREP</div>
                            <div className="truncate text-[10px] text-[#89827d]">Kinetic console</div>
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={toggleSidebar}
                    aria-label={isCollapsed ? 'Open navigation' : 'Collapse navigation'}
                    aria-expanded={!isCollapsed}
                    className={cn(
                        'grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#918a85] transition-colors hover:bg-white/[0.08] hover:text-white',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6847] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151617]',
                        isCollapsed && !isMobileViewport && 'md:hidden',
                    )}
                >
                    {isMobileViewport && isCollapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
                </button>
                {isCollapsed && !isMobileViewport && (
                    <button
                        type="button"
                        onClick={toggleSidebar}
                        aria-label="Open navigation"
                        className="hidden h-8 w-8 place-items-center rounded-md text-[#918a85] transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6847] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151617] md:grid"
                    >
                        <ChevronRight size={17} />
                    </button>
                )}
            </header>

            {shouldShowExpandedRail ? (
                <div className="scroll-contain-y min-h-0 flex-1 overflow-y-auto">
                    <nav aria-label="Primary" className="space-y-1 px-2 pb-4 pt-4">
                        <div className="px-2 pb-2 text-[10px] font-semibold text-[#7b746f]">Navigate</div>
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
                            <h2 id="kinetic-library-heading" className="text-xs font-semibold text-[#f2f0ed]">Library</h2>
                            {libraryTab === 'sessions' ? (
                                <button
                                    type="button"
                                    onClick={onCreateSession}
                                    disabled={!isSetupMode || !canAccessSessionBuilder}
                                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-[#ff8061] transition-colors hover:bg-[#ff6847]/10 hover:text-[#ff967b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6847] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    <Plus size={13} />
                                    New
                                </button>
                            ) : (
                                <div className="flex items-center gap-1">
                                    <ActionButton label="Import library" onClick={() => fileInputRef.current?.click()} disabled={!isSetupMode}>
                                        <Upload size={12} />
                                    </ActionButton>
                                    <ActionButton label="Export library" onClick={onExportLibrary}>
                                        <Download size={12} />
                                    </ActionButton>
                                </div>
                            )}
                        </div>

                        <div className="mt-3 flex border-b border-white/10" role="tablist" aria-label="Saved library type">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={libraryTab === 'sessions'}
                                onClick={() => setLibraryTab('sessions')}
                                className={cn(
                                    'flex-1 border-b-2 px-1 pb-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6847] focus-visible:ring-inset',
                                    libraryTab === 'sessions' ? 'border-[#ff6847] text-[#f2f0ed]' : 'border-transparent text-[#77716d] hover:text-[#c0bab5]',
                                )}
                            >
                                Sessions
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={libraryTab === 'workouts'}
                                onClick={() => setLibraryTab('workouts')}
                                className={cn(
                                    'flex-1 border-b-2 px-1 pb-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6847] focus-visible:ring-inset',
                                    libraryTab === 'workouts' ? 'border-[#ff6847] text-[#f2f0ed]' : 'border-transparent text-[#77716d] hover:text-[#c0bab5]',
                                )}
                            >
                                Workouts
                            </button>
                        </div>

                        {libraryTab === 'sessions' ? (
                            <div className="mt-1">
                                {savedSessions.length === 0 ? (
                                    <div className="border-b border-white/[0.07] py-5 text-center text-[11px] text-[#77716d]">No saved sessions</div>
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
                                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[#ff6847] px-2 text-[10px] font-bold text-[#161616] transition-colors hover:bg-[#ff8061] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6847] focus-visible:ring-offset-1 focus-visible:ring-offset-[#151617] disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        <Save size={12} />
                                        Save
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onSaveAsCurrent}
                                        disabled={!isSetupMode}
                                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/10 px-2 text-[10px] font-semibold text-[#b7b1ad] transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6847] focus-visible:ring-offset-1 focus-visible:ring-offset-[#151617] disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        <Copy size={12} />
                                        Save as
                                    </button>
                                </div>
                                {savedWorkouts.length === 0 ? (
                                    <div className="border-b border-white/[0.07] py-5 text-center text-[11px] text-[#77716d]">No saved workouts</div>
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
                            onChange={handleFileSelected}
                            aria-label="Import workout library JSON"
                        />

                        {importSummary && (
                            <div className="mt-3 rounded-lg border border-white/10 bg-[#1c1e20] p-3 text-[10px] text-[#aaa39f]">
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

                    <div className="mx-3 border-t border-white/10" />

                    <section className="px-3 pb-4 pt-4" aria-labelledby="kinetic-theme-heading">
                        <button
                            type="button"
                            onClick={() => setShowThemes((visible) => !visible)}
                            aria-expanded={showThemes}
                            className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left text-xs font-semibold text-[#d0cbc6] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6847]"
                        >
                            <span id="kinetic-theme-heading" className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: themes.find((theme) => theme.id === currentTheme)?.color ?? rail.coral }} />Theme</span>
                            <ChevronDown size={14} className={cn('text-[#77716d] transition-transform', showThemes && 'rotate-180')} />
                        </button>
                        {showThemes && (
                            <div className="mt-2 grid grid-cols-2 gap-1.5">
                                {themes.map((theme) => (
                                    <button
                                        key={theme.id}
                                        type="button"
                                        onClick={() => setTheme(theme.id)}
                                        aria-pressed={currentTheme === theme.id}
                                        title={theme.name}
                                        className={cn(
                                            'flex min-w-0 items-center gap-2 rounded-md border px-2 py-2 text-left text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6847]',
                                            currentTheme === theme.id ? 'border-white/30 bg-white/[0.08] text-white' : 'border-white/10 text-[#908a85] hover:bg-white/[0.06] hover:text-[#d6d0cb]',
                                        )}
                                    >
                                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: theme.color }} aria-hidden="true" />
                                        <span className="truncate">{theme.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    {account && (
                        <section className="border-t border-white/10 px-3 pb-5 pt-4" aria-labelledby="kinetic-account-heading">
                            <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold text-[#f2f0ed]">
                                <UserRound size={14} className="text-[#ff6847]" />
                                <span id="kinetic-account-heading">Account</span>
                            </div>
                            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#1c1e20] px-3 py-2">
                                <div className="min-w-0">
                                    <div className="truncate text-xs font-semibold text-[#e7e3df]">{accountName}</div>
                                    <div className="mt-0.5 text-[10px] text-[#88817c]">{accountPlan}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={onToggleAccountCardCollapsed}
                                    aria-expanded={!isAccountCardCollapsed}
                                    aria-label={isAccountCardCollapsed ? 'Show account details' : 'Hide account details'}
                                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#918a85] transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6847]"
                                >
                                    <ChevronDown size={14} className={cn('transition-transform', !isAccountCardCollapsed && 'rotate-180')} />
                                </button>
                            </div>
                            {!isAccountCardCollapsed && (
                                <div className="kinetic-account-card max-h-[min(38vh,360px)] min-w-0 overflow-x-hidden overflow-y-auto rounded-lg [&>div]:w-full [&>div]:min-w-0 [&>div]:rounded-lg [&>div]:border-white/10 [&>div]:bg-[#1c1e20] [&>div]:shadow-none [&>div>div]:!p-2 [&_button]:min-w-0 [&_button]:whitespace-normal [&_button]:break-words [&_button]:leading-tight [&_input]:min-w-0">
                                    <AccountCard
                                        account={account}
                                        syncSnapshot={syncSnapshot}
                                        syncActions={syncActions}
                                        isCollapsed={false}
                                        onToggleCollapsed={onToggleAccountCardCollapsed}
                                        onSignInWithPassword={onSignInWithPassword}
                                        onSignUpWithPassword={onSignUpWithPassword}
                                        onResendSignUpConfirmation={onResendSignUpConfirmation}
                                        onUpdateUsername={onUpdateUsername}
                                        onSendPasswordReset={onSendPasswordReset}
                                        onUpdatePassword={onUpdatePassword}
                                        onSignOut={onSignOut}
                                        onUpgradeToPlus={onUpgradeToPlus}
                                        onManageSubscription={onManageSubscription}
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
                        'flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff6847] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151617]',
                        showSettings ? 'bg-white/[0.1] text-white' : 'text-[#9d9691] hover:bg-white/[0.07] hover:text-[#f2f0ed]',
                        isCollapsed && !isMobileViewport && 'md:justify-center md:px-0',
                    )}
                >
                    <Settings2 size={17} className={showSettings ? 'text-[#ff6847]' : undefined} />
                    {shouldShowExpandedRail && <span>Settings</span>}
                </button>
                {shouldShowExpandedRail && <div className="mt-2 px-1 text-[10px] text-[#655f5a]">v{APP_VERSION}</div>}
            </footer>
        </aside>
    );
};

export default React.memo(KineticSidebar);
