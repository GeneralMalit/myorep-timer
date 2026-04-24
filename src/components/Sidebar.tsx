import React, { useMemo, useRef } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    Download,
    FolderOpen,
    Palette,
    Pencil,
    Save,
    Settings,
    Trash2,
    Upload,
    Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getResponsiveLayout } from '@/layout';
import { cn } from '@/lib/utils';
import { APP_VERSION } from '@/constants/version';
import AccountCard from '@/components/AccountCard';
import { estimateSessionDurationSeconds, formatEstimatedSessionDuration } from '@/utils/savedSessions';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import type { AccountActionResult, AccountSignUpResult, AccountSnapshot, AccountSyncActions, AccountSyncSnapshot } from '@/types/account';
import { SavedWorkout } from '@/types/savedWorkouts';
import { SavedSession } from '@/types/savedSessions';
import { SavedLibraryImportSummary } from '@/types/savedLibrary';
import { sidebarDesktopLayout } from '@/layout/sidebar.desktop';
import { sidebarMobileLayout } from '@/layout/sidebar.mobile';

export interface SidebarProps {
    currentTheme: string;
    setTheme: (id: string) => void;
    setShowSettings: (show: boolean) => void;
    onOpenProtocolIntel: () => void;
    showSettings: boolean;
    isMobileViewport?: boolean;
    isCollapsed: boolean;
    toggleSidebar: () => void;
    appPhase: 'setup' | 'timer';
    savedWorkouts: SavedWorkout[];
    onSaveCurrent: () => void;
    onSaveAsCurrent: () => void;
    onLoadWorkout: (id: string) => void;
    onRenameWorkout: (id: string) => void;
    onDeleteWorkout: (id: string) => void;
    onExportLibrary: () => void;
    onImportLibrary: (payload: unknown) => void;
    importSummary: SavedLibraryImportSummary | null;
    clearImportSummary: () => void;
    savedSessions: SavedSession[];
    onCreateSession: () => void;
    onLoadSession: (id: string) => void;
    onDuplicateSession: (id: string) => void;
    onRenameSession: (id: string) => void;
    onDeleteSession: (id: string) => void;
    account?: AccountSnapshot;
    syncSnapshot?: AccountSyncSnapshot;
    syncActions?: AccountSyncActions;
    isAccountCardCollapsed?: boolean;
    onToggleAccountCardCollapsed?: () => void;
    onSignInWithPassword?: (email: string, password: string) => Promise<AccountActionResult>;
    onSignUpWithPassword?: (username: string, email: string, password: string) => Promise<AccountSignUpResult>;
    onResendSignUpConfirmation?: (email: string) => Promise<AccountActionResult>;
    onUpdateUsername?: (username: string) => Promise<AccountActionResult>;
    onSendPasswordReset?: (email: string) => Promise<AccountActionResult>;
    onUpdatePassword?: (password: string) => Promise<AccountActionResult>;
    onSignOut?: () => Promise<AccountActionResult>;
    canAccessSessionBuilder?: boolean;
    onUpgradeToPlus?: () => Promise<AccountActionResult>;
    onManageSubscription?: () => Promise<AccountActionResult>;
}

const themes = [
    { id: 'theme-default', name: 'Deep Purple', color: '#bb86fc' },
    { id: 'theme-ocean', name: 'Ocean Blue', color: '#03dac6' },
    { id: 'theme-fire', name: 'Crimson Fire', color: '#cf6679' },
    { id: 'theme-forest', name: 'Neon Forest', color: '#00e676' },
] as const;

const Sidebar: React.FC<SidebarProps> = ({
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
}) => {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const prepTime = useWorkoutStore((state) => state.settings.prepTime);
    const isSetupMode = appPhase === 'setup';
    const layout = getResponsiveLayout(isMobileViewport, sidebarMobileLayout, sidebarDesktopLayout);
    const isHiddenOnMobile = isMobileViewport && isCollapsed;
    const isDrawerOpenOnMobile = isMobileViewport && !isCollapsed;

    const sessionDurations = useMemo(
        () => new Map(savedSessions.map((session) => [session.id, estimateSessionDurationSeconds(session, prepTime)])),
        [savedSessions, prepTime],
    );

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            onImportLibrary(JSON.parse(text));
        } catch {
            onImportLibrary(null);
        } finally {
            event.target.value = '';
        }
    };

    return (
        <aside
            aria-label="Sidebar"
            className={cn(
                layout.asideBase,
                isMobileViewport
                    ? (isDrawerOpenOnMobile ? layout.asideOpen : layout.asideClosed)
                    : (isCollapsed ? layout.asideCollapsed : layout.asideExpanded),
            )}
        >
            <div className={layout.header}>
                {(!isCollapsed || isMobileViewport) && (
                    <div className={layout.headerBrand}>
                        <div className={layout.headerBrandIcon}>
                            <Activity size={18} className="text-primary" />
                        </div>
                        <div className={layout.headerBrandText}>
                            <h2 className={layout.headerTitle}>MyoREP</h2>
                        </div>
                    </div>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleSidebar}
                    className={cn(layout.headerButton, isCollapsed && !isMobileViewport && 'mx-auto')}
                    aria-label={isHiddenOnMobile || isCollapsed ? 'Open Navigation' : 'Close Navigation'}
                >
                    {isHiddenOnMobile || isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </Button>
            </div>

            <div className={layout.content}>
                {(!isCollapsed || isMobileViewport) && (
                    <>
                        {account && (
                            <section>
                                <AccountCard
                                    account={account}
                                    syncSnapshot={syncSnapshot}
                                    syncActions={syncActions}
                                    isCollapsed={isAccountCardCollapsed}
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
                            </section>
                        )}

                        <section className={layout.sectionCard}>
                            <div className={layout.sectionTitle}>
                                <Palette size={14} />
                                <span>Themes</span>
                            </div>
                            <div className={layout.themeGrid}>
                                {themes.map((theme) => (
                                    <button
                                        key={theme.id}
                                        onClick={() => setTheme(theme.id)}
                                        className={cn(
                                            layout.themeButtonBase,
                                            currentTheme === theme.id
                                                ? layout.themeButtonActive
                                                : layout.themeButtonInactive,
                                        )}
                                        title={theme.name}
                                    >
                                        <div
                                            className={layout.themeDot}
                                            style={{ backgroundColor: theme.color, boxShadow: `0 0 8px ${theme.color}44` }}
                                        />
                                        <span className="truncate text-sm font-semibold">{theme.name}</span>
                                    </button>
                                ))}
                            </div>
                        </section>

                        <section className={layout.infoCard}>
                            <div className="space-y-1.5">
                                <div className={layout.infoEyebrow}>Information</div>
                                <Button
                                    type="button"
                                    variant="link"
                                    className={layout.infoButton}
                                    onClick={onOpenProtocolIntel}
                                >
                                    What are "Myo-Reps"?
                                </Button>
                                <p className={layout.infoText}>
                                    What myo-reps are and how this timer interprets them.
                                </p>
                            </div>
                        </section>

                        <section className={layout.sessionsSection}>
                            <div className={layout.sessionsHeader}>
                                <div className="space-y-1">
                                    <div className={layout.sectionEyebrow}>Library</div>
                                    <div className={layout.sessionsTitle}>Saved Sessions</div>
                                </div>
                                <Button variant="outline" size="sm" onClick={onCreateSession} className={layout.sessionsNewButton} disabled={!isSetupMode || !canAccessSessionBuilder}>
                                    New
                                </Button>
                            </div>

                            {!canAccessSessionBuilder ? (
                                <div className={layout.plusCard}>
                                    <div className={layout.plusTitle}>Plus Feature</div>
                                    <div className={layout.plusDescription}>Session Builder is part of Plus.</div>
                                    <p className={layout.plusCopy}>
                                        Build and save multi-node sessions after upgrading to Plus. Free mode keeps the timer local-first without session editing.
                                    </p>
                                    {onUpgradeToPlus && (
                                        <Button
                                            type="button"
                                            className={layout.plusButton}
                                            onClick={() => {
                                                void onUpgradeToPlus();
                                            }}
                                        >
                                            Upgrade to Plus
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className={layout.sessionsList}>
                                    {savedSessions.length === 0 && (
                                        <div className={layout.sessionsEmpty}>
                                            No saved sessions yet
                                        </div>
                                    )}

                                    {savedSessions.map((session, index) => (
                                        <div key={session.id} className={cn(layout.sessionItem, index !== savedSessions.length - 1 && layout.sessionItemDivider)}>
                                            <div className={layout.sessionItemHeader}>
                                                <div className="min-w-0">
                                                    <div className={layout.sessionItemTitle}>{session.name}</div>
                                                    <div className={layout.sessionItemMeta}>
                                                        {session.nodes.length} nodes
                                                        {session.lastUsedAt ? ` - Last ${new Date(session.lastUsedAt).toLocaleDateString()}` : ''}
                                                    </div>
                                                </div>
                                                <div className={layout.sessionItemTimeWrap}>
                                                    <div className={layout.sessionItemTimeLabel}>
                                                        Time
                                                    </div>
                                                    <div className={layout.sessionItemTimeValue}>
                                                        {formatEstimatedSessionDuration(sessionDurations.get(session.id) ?? null)}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={layout.sessionActionsGrid}>
                                                <Button variant="default" size="sm" className={layout.sessionActionButton} onClick={() => onLoadSession(session.id)} disabled={!isSetupMode} title="Load Session">
                                                    Load
                                                </Button>
                                                <Button variant="secondary" size="sm" className={layout.sessionActionButton} onClick={() => onDuplicateSession(session.id)} disabled={!isSetupMode} title="Duplicate Session">
                                                    Copy
                                                </Button>
                                                <Button variant="secondary" size="sm" className={layout.sessionActionButton} onClick={() => onRenameSession(session.id)} disabled={!isSetupMode} title="Rename Session">
                                                    Rename
                                                </Button>
                                                <Button variant="ghost" size="sm" className={layout.sessionActionButton} onClick={() => onDeleteSession(session.id)} disabled={!isSetupMode} title="Delete Session">
                                                    Del
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className={layout.workoutsSection}>
                            <div className="space-y-1">
                                <div className={layout.sectionEyebrow}>Library</div>
                                <div className={layout.workoutsTitle}>Saved Workouts</div>
                            </div>

                            <div className={layout.workoutsActionsGrid}>
                                <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={!isSetupMode} className={layout.workoutsButton} aria-label="Import library" title="Import library">
                                    <Upload size={12} />
                                </Button>
                                <Button variant="secondary" size="sm" onClick={onExportLibrary} className={layout.workoutsButton} aria-label="Export library" title="Export library">
                                    <Download size={12} />
                                </Button>
                                <Button variant="outline" size="sm" onClick={onSaveCurrent} disabled={!isSetupMode} className={layout.workoutsButton} aria-label="Save" title="Save">
                                    <Save size={12} />
                                </Button>
                                <Button variant="secondary" size="sm" onClick={onSaveAsCurrent} disabled={!isSetupMode} className={layout.workoutsButton} aria-label="Save As" title="Save As">
                                    <Save size={12} />
                                </Button>
                            </div>

                            <div className="text-[10px] leading-relaxed text-muted-foreground">
                                To rescue data from deployed main, save the raw <code>myorep-workout-storage</code> localStorage value as JSON and import it here.
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="application/json"
                                className="hidden"
                                onChange={handleFileSelected}
                            />

                            {importSummary && (
                                <div className={layout.workoutsImportSummary}>
                                    <div className={layout.workoutsImportSummaryTitle}>
                                        Workouts: {importSummary.workouts.imported} imported, {importSummary.workouts.renamed} renamed, {importSummary.workouts.skipped} skipped
                                    </div>
                                    <div className={layout.workoutsImportSummaryTitle}>
                                        Sessions: {importSummary.sessions.imported} imported, {importSummary.sessions.renamed} renamed, {importSummary.sessions.skipped} skipped
                                    </div>
                                    {importSummary.errors.length > 0 ? (
                                        <div className={layout.workoutsImportSummaryError}>{importSummary.errors[0]}</div>
                                    ) : (
                                        <div className={layout.workoutsImportSummaryError}>
                                            Tip: you can also import a raw <code>myorep-workout-storage</code> browser snapshot from the deployed main branch.
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        className={layout.workoutsImportSummaryDismiss}
                                        onClick={clearImportSummary}
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            )}

                            <div className={layout.workoutsList}>
                                {savedWorkouts.length === 0 && (
                                    <div className={layout.sessionsEmpty}>
                                        No saved workouts yet
                                    </div>
                                )}

                                {savedWorkouts.map((workout, index) => (
                                    <div key={workout.id} className={cn(layout.workoutItem, index !== savedWorkouts.length - 1 && layout.sessionItemDivider)}>
                                        <div className={layout.workoutItemTitle}>{workout.name}</div>
                                        <div className={layout.workoutItemMeta}>
                                            Used {workout.timesUsed}x
                                            {workout.lastUsedAt ? ` - Last ${new Date(workout.lastUsedAt).toLocaleDateString()}` : ''}
                                        </div>
                                        <div className={layout.workoutItemActionsGrid}>
                                            <Button variant="default" size="sm" className={layout.workoutActionButton} onClick={() => onLoadWorkout(workout.id)} disabled={!isSetupMode} title="Load">
                                                <FolderOpen size={11} />
                                            </Button>
                                            <Button variant="secondary" size="sm" className={layout.workoutActionButton} onClick={() => onRenameWorkout(workout.id)} disabled={!isSetupMode} title="Rename">
                                                <Pencil size={11} />
                                            </Button>
                                            <Button variant="ghost" size="sm" className={layout.workoutActionButton} onClick={() => onDeleteWorkout(workout.id)} disabled={!isSetupMode} title="Delete">
                                                <Trash2 size={11} />
                                            </Button>
                                            <div className={layout.workoutStat}>
                                                {workout.sets}S
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </>
                )}
            </div>

            <div className={layout.footer}>
                <Button
                    variant={showSettings ? 'default' : 'secondary'}
                    className={cn(layout.footerButton, isCollapsed && !isMobileViewport && layout.footerButtonCollapsed)}
                    onClick={() => setShowSettings(!showSettings)}
                    title="Settings"
                    aria-label={showSettings ? 'Close Settings' : 'Open Settings'}
                >
                    <Settings className={cn(layout.footerIcon, showSettings && 'animate-spin-slow')} size={18} />
                    {(!isCollapsed || isMobileViewport) && <span>{showSettings ? 'Close' : 'Settings'}</span>}
                </Button>
                {(!isCollapsed || isMobileViewport) && (
                    <div className={layout.footerVersion}>
                        v{APP_VERSION}
                    </div>
                )}
            </div>
        </aside>
    );
};

export default React.memo(Sidebar);
