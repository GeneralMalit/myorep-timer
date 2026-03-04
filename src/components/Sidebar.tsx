import React from 'react';
import { Settings, ChevronLeft, ChevronRight, Palette, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SidebarProps {
    currentTheme: string;
    setTheme: (id: string) => void;
    setShowSettings: (show: boolean) => void;
    showSettings: boolean;
    isCollapsed: boolean;
    toggleSidebar: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
    currentTheme,
    setTheme,
    setShowSettings,
    showSettings,
    isCollapsed,
    toggleSidebar
}) => {
    const themes = [
        { id: 'theme-default', name: 'Deep Purple', color: '#bb86fc' },
        { id: 'theme-ocean', name: 'Ocean Blue', color: '#03dac6' },
        { id: 'theme-fire', name: 'Crimson Fire', color: '#cf6679' },
        { id: 'theme-forest', name: 'Neon Forest', color: '#00e676' },
    ];

    return (
        <div
            className={cn(
                "fixed left-0 top-0 h-full bg-card border-r border-border transition-all duration-300 z-50 flex flex-col",
                isCollapsed ? "w-16" : "w-64"
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
                    className={cn("shrink-0", isCollapsed && "mx-auto")}
                >
                    {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </Button>
            </div>

            <div className="flex-1 px-4 py-6 overflow-y-auto no-scrollbar">
                {!isCollapsed && (
                    <div className="flex items-center gap-2 mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground/60 px-2">
                        <Palette size={14} />
                        <span>Themes</span>
                    </div>
                )}
                <div className="space-y-2">
                    {themes.map((theme) => (
                        <button
                            key={theme.id}
                            onClick={() => setTheme(theme.id)}
                            className={cn(
                                "w-full flex items-center gap-3 p-2 rounded-lg transition-all duration-200 group text-left",
                                currentTheme === theme.id
                                    ? "bg-primary/10 text-primary"
                                    : "hover:bg-accent text-muted-foreground"
                            )}
                            title={theme.name}
                        >
                            <div
                                className="w-3 h-3 rounded-full shrink-0 group-hover:scale-125 transition-transform"
                                style={{ backgroundColor: theme.color, boxShadow: `0 0 8px ${theme.color}44` }}
                            />
                            {!isCollapsed && <span className="text-sm font-semibold truncate">{theme.name}</span>}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-4 border-t border-border">
                <Button
                    variant={showSettings ? "default" : "secondary"}
                    className={cn("w-full gap-2 transition-all font-bold", isCollapsed && "px-0 justify-center")}
                    onClick={() => setShowSettings(!showSettings)}
                    title="Settings"
                >
                    <Settings className={cn("shrink-0", showSettings && "animate-spin-slow")} size={18} />
                    {!isCollapsed && <span>{showSettings ? 'Close' : 'Settings'}</span>}
                </Button>
                {!isCollapsed && (
                    <div className="mt-4 text-[10px] text-center font-bold text-muted-foreground/40 uppercase tracking-[0.2em]">
                        v{__APP_VERSION__}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Sidebar;
