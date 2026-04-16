import React from 'react';
import { useWorkoutStore, WorkoutSettings } from '@/store/useWorkoutStore';
import {
    X,
    Palette,
    Zap,
    Monitor,
    Volume2,
    Info,
    Play
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { audioEngine } from '@/utils/audioEngine';
import { cn } from '@/lib/utils';

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
    const settings = useWorkoutStore((state) => state.settings);
    const setSettings = useWorkoutStore((state) => state.setSettings);
    const seconds = useWorkoutStore((state) => state.seconds);
    const myoWorkSecs = useWorkoutStore((state) => state.myoWorkSecs);

    const handleChange = <K extends keyof WorkoutSettings>(key: K, value: WorkoutSettings[K]) => {
        setSettings({ [key]: value });
    };

    const paceValues = [parseInt(seconds, 10), parseInt(myoWorkSecs, 10)].filter((value) => Number.isFinite(value) && value > 0);
    const concentricMax = paceValues.length > 0 ? Math.min(...paceValues) : undefined;

    const testTTS = () => {
        audioEngine.init();
        audioEngine.speak('Ready 3 2 1 Go');
    };

    return (
        <div
            data-testid="settings-drawer-overlay"
            aria-hidden={!isOpen}
            className={cn(
                "fixed inset-0 z-[100] flex items-stretch justify-end bg-background/80 backdrop-blur-sm transition-opacity duration-300",
                isOpen ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            onPointerDown={(event) => {
                if (isOpen && event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <Card
                data-testid="settings-drawer-panel"
                className={cn(
                    "flex h-full w-[min(22rem,calc(100vw-1rem))] max-w-full flex-col overflow-hidden rounded-l-[2rem] border border-border/70 border-r-0 shadow-2xl transition-transform duration-300 ease-out md:w-full md:max-w-md md:rounded-none md:border-y-0 md:border-l",
                    isOpen ? "translate-x-0" : "translate-x-[calc(100%+1rem)]",
                )}
            >
                <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 bg-muted/25 px-5 pb-4 pt-[calc(var(--safe-top)+1rem)] md:px-6 md:pt-6">
                    <CardTitle className="flex items-center gap-2 text-lg font-black italic tracking-tight sm:text-xl">
                        <Monitor className="text-primary" size={20} />
                        System Configuration
                    </CardTitle>
                    <Button variant="ghost" size="icon" onClick={onClose} className="h-11 w-11 shrink-0 rounded-2xl" aria-label="Close Settings">
                        <X size={20} />
                    </Button>
                </CardHeader>

                <CardContent className="no-scrollbar flex-1 space-y-6 overflow-y-auto px-5 pb-[calc(var(--safe-bottom)+1.5rem)] pt-5 md:px-6 md:pb-10">
                    <section className="space-y-4 rounded-[24px] border border-border/60 bg-card/70 p-4">
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
                            <Palette size={16} />
                            <span>Visual Identity</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {[
                                { label: 'Active', key: 'activeColor' },
                                { label: 'Resting', key: 'restColor' },
                                { label: 'Concentric', key: 'concentricColor' },
                            ].map((item) => (
                                <div key={item.key} className="space-y-2 rounded-2xl border border-border/50 bg-accent/35 p-3">
                                    <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                                        {item.label}
                                    </Label>
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="h-8 w-8 shrink-0 rounded-lg border border-white/10 shadow-inner"
                                            style={{ backgroundColor: (settings as any)[item.key] }}
                                        />
                                        <Input
                                            type="color"
                                            value={(settings as any)[item.key]}
                                            onChange={(e) => handleChange(item.key as any, e.target.value)}
                                            className="h-8 w-full cursor-pointer border-none bg-transparent p-0"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-4 rounded-[24px] border border-border/60 bg-card/70 p-4">
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
                            <Zap size={16} />
                            <span>Logistics</span>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label className="px-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Concentric window (s)</Label>
                                <Input
                                    type="number"
                                    value={settings.concentricSecond}
                                    onChange={(e) => {
                                        const parsed = parseInt(e.target.value, 10);
                                        const requested = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
                                        handleChange('concentricSecond', concentricMax ? Math.min(requested, concentricMax) : requested);
                                    }}
                                    className="border-border/50 bg-accent/40 font-bold"
                                    min={1}
                                    max={concentricMax}
                                />
                                <p className="px-1 text-[10px] uppercase tracking-tight text-muted-foreground">
                                    Max = fastest rep pace ({concentricMax ?? 1}s)
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label className="px-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Prep Buffer (s)</Label>
                                <Input
                                    type="number"
                                    value={settings.prepTime}
                                    onChange={(e) => handleChange('prepTime', parseInt(e.target.value) || 0)}
                                    className="border-border/50 bg-accent/40 font-bold"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-accent/35 p-4">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-bold tracking-tight">Fluid Animation</Label>
                                <p className="text-[10px] font-medium uppercase tracking-tighter text-muted-foreground">Enable high-frequency UI updates</p>
                            </div>
                            <Switch
                                checked={settings.smoothAnimation}
                                onCheckedChange={(checked) => handleChange('smoothAnimation', checked)}
                            />
                        </div>
                    </section>

                    <section className="space-y-4 rounded-[24px] border border-border/60 bg-card/70 p-4">
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
                            <Info size={16} />
                            <span>Core Display</span>
                        </div>

                        <div className="space-y-3">
                            {[
                                { label: 'Full Screen Mode', key: 'fullScreenMode', desc: 'Active theme colors as background' },
                                { label: 'Vertical Mode', key: 'upDownMode', desc: 'Large text ECCENTRIC/CONCENTRIC' },
                            ].map((item) => (
                                <div key={item.key} className="flex items-center justify-between rounded-2xl border border-border/50 bg-accent/35 p-4">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-bold tracking-tight">{item.label}</Label>
                                        <p className="text-[10px] font-medium uppercase tracking-tighter text-muted-foreground">{item.desc}</p>
                                    </div>
                                    <Switch
                                        checked={(settings as any)[item.key]}
                                        onCheckedChange={(checked) => handleChange(item.key as any, checked)}
                                    />
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-4 rounded-[24px] border border-border/60 bg-card/70 p-4">
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
                            <Volume2 size={16} />
                            <span>Sound Architecture</span>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-accent/35 p-4">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-bold tracking-tight">Metronome Ticks</Label>
                                    <p className="text-[10px] font-medium uppercase tracking-tighter text-muted-foreground">Audible rhythm during reps</p>
                                </div>
                                <Switch
                                    checked={settings.metronomeEnabled}
                                    onCheckedChange={(checked) => handleChange('metronomeEnabled', checked)}
                                />
                            </div>

                            <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-accent/35 p-4">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-bold tracking-tight">Voice Feedback (TTS)</Label>
                                    <p className="text-[10px] font-medium uppercase tracking-tighter text-muted-foreground">Speak rep count and timings</p>
                                </div>
                                <Switch
                                    checked={settings.ttsEnabled}
                                    onCheckedChange={(checked) => handleChange('ttsEnabled', checked)}
                                />
                            </div>

                            {(settings.metronomeEnabled || settings.ttsEnabled) && (
                                <div className="grid gap-4 pt-2 animate-in slide-in-from-top-2 duration-300 sm:grid-cols-2">
                                    {settings.metronomeEnabled && (
                                        <div className="space-y-2">
                                            <Label className="px-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Tick Sample</Label>
                                            <select
                                                value={settings.metronomeSound}
                                                onChange={(e) => handleChange('metronomeSound', e.target.value)}
                                                className="h-11 w-full rounded-2xl border border-border/50 bg-accent/35 px-3 text-sm font-bold outline-none"
                                            >
                                                <option value="woodblock">Woodblock</option>
                                                <option value="mechanical">Mechanical</option>
                                                <option value="electronic">High Elec</option>
                                                <option value="low-thud">Deep Thud</option>
                                            </select>
                                        </div>
                                    )}
                                    {settings.ttsEnabled && (
                                        <div className="flex flex-col justify-end">
                                            <Button onClick={testTTS} variant="outline" className="min-h-11 gap-2 rounded-2xl font-black italic tracking-tighter">
                                                <Play size={14} /> TEST VOICES
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>
                </CardContent>
            </Card>
        </div>
    );
};

export default SettingsPanel;
