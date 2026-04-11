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
import { cn } from '@/lib/utils';
import { APP_VERSION } from '@/constants/version';
import { estimateSessionDurationSeconds, formatEstimatedSessionDuration } from '@/utils/savedSessions';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { SavedWorkout, SavedWorkoutsImportSummary } from '@/types/savedWorkouts';
import { SavedSession } from '@/types/savedSessions';

interface SidebarProps {
    currentTheme: string;
    setTheme: (id: string) => void;
    setShowSettings: (show: boolean) => void;
    onOpenProtocolIntel: () => void;
    showSettings: boolean;
    isCollapsed: boolean;
    toggleSidebar: () => void;
    appPhase: 'setup' | 'timer';
    savedWorkouts: SavedWorkout[];
    onSaveCurrent: () => void;
    onSaveAsCurrent: () => void;
    onLoadWorkout: (id: string) => void;
    onRenameWorkout: (id: string) => void;
    onDeleteWorkout: (id: string) => void;
    onExportWorkouts: () => void;
    onImportWorkouts: (payload: unknown) => void;
    importSummary: SavedWorkoutsImportSummary | null;
    clearImportSummary: () => void;
    savedSessions: SavedSession[];
    onCreateSession: () => void;
    onLoadSession: (id: string) => void;
    onDuplicateSession: (id: string) => void;
    onRenameSession: (id: string) => void;
    onDeleteSession: (id: string) => void;
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
    isCollapsed,
    toggleSidebar,
    appPhase,
    savedWorkouts,
    onSaveCurrent,
    onSaveAsCurrent,
    onLoadWorkout,
    onRenameWorkout,
    onDeleteWorkout,
    onExportWorkouts,
    onImportWorkouts,
    importSummary,
    clearImportSummary,
    savedSessions,
    onCreateSession,
    onLoadSession,
    onDuplicateSession,
    onRenameSession,
    onDeleteSession,
}) => {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const prepTime = useWorkoutStore((state) => state.settings.prepTime);
    const isSetupMode = appPhase === 'setup';

    const sessionDurations = useMemo(
        () => new Map(savedSessions.map((session) => [session.id, estimateSessionDurationSeconds(session, prepTime)])),
        [savedSessions, prepTime],
    );

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            onImportWorkouts(JSON.parse(text));
        } catch {
            onImportWorkouts(null);
        } finally {
            event.target.value = '';
        }
    };

    return (
        <aside
            aria-label="Sidebar"
            className={cn(
                'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border/60 bg-background transition-all duration-300',
                isCollapsed
                    ? 'w-[4.5rem]'
                    : 'w-[min(20rem,calc(100vw-1rem))] max-w-full',
            )}
        >
            <div className="flex h-20 items-center justify-between border-b border-border/50 px-4 pt-[calc(var(--safe-top)+0.5rem)] md:h-16 md:pt-0">
                {!isCollapsed && (
                    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
                            <Activity size={18} className="text-primary" />
                        </div>
                        <h2 className="pr-2 text-xl font-black italic tracking-tighter text-primary">MyoREP</h2>
                    </div>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleSidebar}
                    className={cn('shrink-0', isCollapsed && 'mx-auto')}
                    aria-label={isCollapsed ? 'Open Navigation' : 'Close Navigation'}
                >
                    {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </Button>
            </div>

            <div className="no-scrollbar flex-1 space-y-8 overflow-y-auto px-4 py-6 pb-[calc(var(--safe-bottom)+1rem)]">
                {!isCollapsed && (
                    <>
                        <section>
                            <div className="mb-4 flex items-center gap-2 px-2 text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
                                <Palette size={14} />
                                <span>Themes</span>
                            </div>
                            <div className="space-y-2">
                                {themes.map((theme) => (
                                    <button
                                        key={theme.id}
                                        onClick={() => setTheme(theme.id)}
                                        className={cn(
                                            'group flex min-h-11 w-full items-center gap-3 rounded-lg p-2 text-left transition-all duration-200',
                                            currentTheme === theme.id
                                                ? 'bg-primary/10 text-primary'
                                                : 'text-muted-foreground hover:bg-accent',
                                        )}
                                        title={theme.name}
                                    >
                                        <div
                                            className="h-3 w-3 shrink-0 rounded-full transition-transform group-hover:scale-125"
                                            style={{ backgroundColor: theme.color, boxShadow: `0 0 8px ${theme.color}44` }}
                                        />
                                        <span className="truncate text-sm font-semibold">{theme.name}</span>
                                    </button>
                                ))}
                            </div>
                        </section>

                        <section className="px-2">
                            <Button
                                type="button"
                                variant="link"
                                className="min-h-11 justify-start p-0 text-left text-xs font-black uppercase tracking-[0.24em]"
                                onClick={onOpenProtocolIntel}
                            >
                                What are "Myo-Reps"?
                            </Button>
                            <p className="mt-1 text-[10px] uppercase tracking-tight text-muted-foreground/70">
                                What myo-reps are and how this timer interprets them.
                            </p>
                        </section>

                        <section className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">Saved Sessions</div>
                                <Button variant="outline" size="sm" onClick={onCreateSession} className="min-h-10 px-3 text-[10px]" disabled={!isSetupMode}>
                                    New
                                </Button>
                            </div>

                            <div className="no-scrollbar max-h-52 space-y-3 overflow-y-auto pr-1">
                                {savedSessions.length === 0 && (
                                    <div className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                                        No saved sessions yet
                                    </div>
                                )}

                                {savedSessions.map((session, index) => (
                                    <div key={session.id} className={cn('space-y-2 pb-3', index !== savedSessions.length - 1 && 'border-b border-border/50')}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-xs font-bold">{session.name}</div>
                                                <div className="text-[10px] uppercase tracking-tight text-muted-foreground">
                                                    {session.nodes.length} nodes
                                                    {session.lastUsedAt ? ` - Last ${new Date(session.lastUsedAt).toLocaleDateString()}` : ''}
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <div className="text-[9px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                                                    Time
                                                </div>
                                                <div className="text-[10px] font-black tracking-tight text-foreground">
                                                    {formatEstimatedSessionDuration(sessionDurations.get(session.id) ?? null)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-4 gap-1">
                                            <Button variant="default" size="sm" className="min-h-10 px-1 text-[9px] font-bold" onClick={() => onLoadSession(session.id)} disabled={!isSetupMode} title="Load Session">
                                                Load
                                            </Button>
                                            <Button variant="secondary" size="sm" className="min-h-10 px-1 text-[9px] font-bold" onClick={() => onDuplicateSession(session.id)} disabled={!isSetupMode} title="Duplicate Session">
                                                Copy
                                            </Button>
                                            <Button variant="secondary" size="sm" className="min-h-10 px-1 text-[9px] font-bold" onClick={() => onRenameSession(session.id)} disabled={!isSetupMode} title="Rename Session">
                                                Rename
                                            </Button>
                                            <Button variant="ghost" size="sm" className="min-h-10 px-1 text-[9px] font-bold" onClick={() => onDeleteSession(session.id)} disabled={!isSetupMode} title="Delete Session">
                                                Del
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="space-y-3">
                            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">Saved Workouts</div>

                            <div className="grid grid-cols-4 gap-2">
                                <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={!isSetupMode} className="min-h-10 w-full px-0" aria-label="Import" title="Import">
                                    <Upload size={12} />
                                </Button>
                                <Button variant="secondary" size="sm" onClick={onExportWorkouts} className="min-h-10 w-full px-0" aria-label="Export" title="Export">
                                    <Download size={12} />
                                </Button>
                                <Button variant="outline" size="sm" onClick={onSaveCurrent} disabled={!isSetupMode} className="min-h-10 w-full px-0" aria-label="Save" title="Save">
                                    <Save size={12} />
                                </Button>
                                <Button variant="secondary" size="sm" onClick={onSaveAsCurrent} disabled={!isSetupMode} className="min-h-10 w-full px-0" aria-label="Save As" title="Save As">
                                    <Save size={12} />
                                </Button>
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="application/json"
                                className="hidden"
                                onChange={handleFileSelected}
                            />

                            {importSummary && (
                                <div className="rounded-lg border border-border/50 bg-accent/20 p-2 text-[10px] leading-relaxed">
                                    <div className="font-bold uppercase tracking-wider text-muted-foreground">
                                        Imported {importSummary.imported}, Renamed {importSummary.renamed}, Skipped {importSummary.skipped}
                                    </div>
                                    {importSummary.errors.length > 0 && (
                                        <div className="mt-1 text-destructive">{importSummary.errors[0]}</div>
                                    )}
                                    <button
                                        type="button"
                                        className="mt-1 font-semibold text-primary"
                                        onClick={clearImportSummary}
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            )}

                            <div className="no-scrollbar max-h-52 space-y-3 overflow-y-auto pr-1">
                                {savedWorkouts.length === 0 && (
                                    <div className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                                        No saved workouts yet
                                    </div>
                                )}

                                {savedWorkouts.map((workout, index) => (
                                    <div key={workout.id} className={cn('space-y-2 pb-3', index !== savedWorkouts.length - 1 && 'border-b border-border/50')}>
                                        <div className="truncate text-xs font-bold">{workout.name}</div>
                                        <div className="text-[10px] uppercase tracking-tight text-muted-foreground">
                                            Used {workout.timesUsed}x
                                            {workout.lastUsedAt ? ` - Last ${new Date(workout.lastUsedAt).toLocaleDateString()}` : ''}
                                        </div>
                                        <div className="grid grid-cols-4 gap-1">
                                            <Button variant="default" size="sm" className="min-h-10 px-1 text-[9px] font-bold" onClick={() => onLoadWorkout(workout.id)} disabled={!isSetupMode} title="Load">
                                                <FolderOpen size={11} />
                                            </Button>
                                            <Button variant="secondary" size="sm" className="min-h-10 px-1 text-[9px] font-bold" onClick={() => onRenameWorkout(workout.id)} disabled={!isSetupMode} title="Rename">
                                                <Pencil size={11} />
                                            </Button>
                                            <Button variant="ghost" size="sm" className="min-h-10 px-1 text-[9px] font-bold" onClick={() => onDeleteWorkout(workout.id)} disabled={!isSetupMode} title="Delete">
                                                <Trash2 size={11} />
                                            </Button>
                                            <div className="flex min-h-10 items-center justify-center rounded border border-border/60 bg-background/60 text-[9px] font-bold">
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

            <div className="border-t border-border p-4">
                <Button
                    variant={showSettings ? 'default' : 'secondary'}
                    className={cn('min-h-11 w-full gap-2 font-bold transition-all', isCollapsed && 'justify-center px-0')}
                    onClick={() => setShowSettings(!showSettings)}
                    title="Settings"
                    aria-label={showSettings ? 'Close Settings' : 'Open Settings'}
                >
                    <Settings className={cn('shrink-0', showSettings && 'animate-spin-slow')} size={18} />
                    {!isCollapsed && <span>{showSettings ? 'Close' : 'Settings'}</span>}
                </Button>
                {!isCollapsed && (
                    <div className="mt-4 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40">
                        v{APP_VERSION}
                    </div>
                )}
            </div>
        </aside>
    );
};

export default React.memo(Sidebar);
