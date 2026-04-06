import React, { useMemo, useRef } from 'react';
import {
    Settings,
    ChevronLeft,
    ChevronRight,
    Palette,
    Activity,
    Save,
    Upload,
    Download,
    FolderOpen,
    Pencil,
    Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SavedWorkout, SavedWorkoutsImportSummary } from '@/types/savedWorkouts';
import { APP_VERSION } from '@/constants/version';

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
}

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
}) => {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const isSetupMode = appPhase === 'setup';

    const themes = [
        { id: 'theme-default', name: 'Deep Purple', color: '#bb86fc' },
        { id: 'theme-ocean', name: 'Ocean Blue', color: '#03dac6' },
        { id: 'theme-fire', name: 'Crimson Fire', color: '#cf6679' },
        { id: 'theme-forest', name: 'Neon Forest', color: '#00e676' },
    ];

    const sortedWorkouts = useMemo(
        () => [...savedWorkouts].sort((a, b) => a.name.localeCompare(b.name)),
        [savedWorkouts],
    );

    const handleOpenImport = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        try {
            const text = await file.text();
            const payload = JSON.parse(text);
            onImportWorkouts(payload);
        } catch {
            onImportWorkouts(null);
        } finally {
            event.target.value = '';
        }
    };

    return (
        <div
            className={cn(
                'fixed left-0 top-0 h-full bg-card border-r border-border transition-all duration-300 z-50 flex flex-col',
                isCollapsed ? 'w-16' : 'w-64',
            )}
        >
            <div className="p-4 flex items-center justify-between h-16 border-b border-border/50">
                {!isCollapsed && (
                    <div className="flex items-center gap-2 overflow-hidden">
                        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                            <Activity size={18} className="text-primary" />
                        </div>
                        <h2 className="text-xl font-black italic tracking-tighter text-primary pr-2">MyoREP</h2>
                    </div>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleSidebar}
                    className={cn('shrink-0', isCollapsed && 'mx-auto')}
                >
                    {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </Button>
            </div>

            <div className="flex-1 px-4 py-6 overflow-y-auto no-scrollbar space-y-8">
                {!isCollapsed && (
                    <>
                        <section>
                            <div className="flex items-center gap-2 mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground/60 px-2">
                                <Palette size={14} />
                                <span>Themes</span>
                            </div>
                            <div className="space-y-2">
                                {themes.map((theme) => (
                                    <button
                                        key={theme.id}
                                        onClick={() => setTheme(theme.id)}
                                        className={cn(
                                            'w-full flex items-center gap-3 p-2 rounded-lg transition-all duration-200 group text-left',
                                            currentTheme === theme.id
                                                ? 'bg-primary/10 text-primary'
                                                : 'hover:bg-accent text-muted-foreground',
                                        )}
                                        title={theme.name}
                                    >
                                        <div
                                            className="w-3 h-3 rounded-full shrink-0 group-hover:scale-125 transition-transform"
                                            style={{ backgroundColor: theme.color, boxShadow: `0 0 8px ${theme.color}44` }}
                                        />
                                        <span className="text-sm font-semibold truncate">{theme.name}</span>
                                    </button>
                                ))}
                            </div>
                        </section>

                        <section className="px-2">
                            <Button
                                type="button"
                                variant="link"
                                className="h-auto p-0 text-left text-xs font-black uppercase tracking-[0.24em]"
                                onClick={onOpenProtocolIntel}
                            >
                                Protocol Intel
                            </Button>
                            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/70 uppercase tracking-tight">
                                What myo-reps are and how this timer interprets them.
                            </p>
                        </section>

                        <section className="border border-border/50 rounded-xl p-3 space-y-3">
                            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">Saved Workouts</div>

                            <div className="grid grid-cols-4 gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleOpenImport}
                                    disabled={!isSetupMode}
                                    className="h-7 w-full px-0"
                                    aria-label="Import"
                                    title="Import"
                                >
                                    <Upload size={12} />
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={onExportWorkouts}
                                    className="h-7 w-full px-0"
                                    aria-label="Export"
                                    title="Export"
                                >
                                    <Download size={12} />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onSaveCurrent}
                                    disabled={!isSetupMode}
                                    className="h-7 w-full px-0"
                                    aria-label="Save"
                                    title="Save"
                                >
                                    <Save size={12} />
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={onSaveAsCurrent}
                                    disabled={!isSetupMode}
                                    className="h-7 w-full px-0"
                                    aria-label="Save As"
                                    title="Save As"
                                >
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
                                        <div className="text-destructive mt-1">{importSummary.errors[0]}</div>
                                    )}
                                    <button
                                        type="button"
                                        className="mt-1 text-primary font-semibold"
                                        onClick={clearImportSummary}
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            )}

                            <div className="space-y-2 max-h-52 overflow-y-auto no-scrollbar pr-1">
                                {sortedWorkouts.length === 0 && (
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 p-2 border border-dashed border-border rounded-lg">
                                        No saved workouts yet
                                    </div>
                                )}

                                {sortedWorkouts.map((workout) => (
                                    <div key={workout.id} className="rounded-lg border border-border/50 bg-accent/20 p-2 space-y-2">
                                        <div className="text-xs font-bold truncate">{workout.name}</div>
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-tight">
                                            Used {workout.timesUsed}x
                                            {workout.lastUsedAt ? ` • Last ${new Date(workout.lastUsedAt).toLocaleDateString()}` : ''}
                                        </div>
                                        <div className="grid grid-cols-4 gap-1">
                                            <Button
                                                variant="default"
                                                size="sm"
                                                className="h-6 px-1 text-[9px] font-bold"
                                                onClick={() => onLoadWorkout(workout.id)}
                                                disabled={!isSetupMode}
                                                title="Load"
                                            >
                                                <FolderOpen size={11} />
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="h-6 px-1 text-[9px] font-bold"
                                                onClick={() => onRenameWorkout(workout.id)}
                                                disabled={!isSetupMode}
                                                title="Rename"
                                            >
                                                <Pencil size={11} />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 px-1 text-[9px] font-bold"
                                                onClick={() => onDeleteWorkout(workout.id)}
                                                disabled={!isSetupMode}
                                                title="Delete"
                                            >
                                                <Trash2 size={11} />
                                            </Button>
                                            <div className="h-6 text-[9px] font-bold flex items-center justify-center rounded bg-background/60 border border-border/60">
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

            <div className="p-4 border-t border-border">
                <Button
                    variant={showSettings ? 'default' : 'secondary'}
                    className={cn('w-full gap-2 transition-all font-bold', isCollapsed && 'px-0 justify-center')}
                    onClick={() => setShowSettings(!showSettings)}
                    title="Settings"
                >
                    <Settings className={cn('shrink-0', showSettings && 'animate-spin-slow')} size={18} />
                    {!isCollapsed && <span>{showSettings ? 'Close' : 'Settings'}</span>}
                </Button>
                {!isCollapsed && (
                    <div className="mt-4 text-[10px] text-center font-bold text-muted-foreground/40 uppercase tracking-[0.2em]">
                        v{APP_VERSION}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Sidebar;

