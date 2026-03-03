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
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { audioEngine } from '@/utils/audioEngine';

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
    const { settings, setSettings } = useWorkoutStore();

    if (!isOpen) return null;

    const handleChange = <K extends keyof WorkoutSettings>(key: K, value: WorkoutSettings[K]) => {
        setSettings({ [key]: value });
    };

    const testTTS = () => {
        audioEngine.init();
        audioEngine.speak('Ready 3 2 1 Go');
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-end bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
            <Card className="h-full w-full max-w-md rounded-none border-l shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-500">
                <CardHeader className="flex flex-row items-center justify-between border-b pb-4 bg-muted/30">
                    <CardTitle className="text-xl font-black italic tracking-tight flex items-center gap-2">
                        <Monitor className="text-primary" size={20} />
                        System Configuration
                    </CardTitle>
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                        <X size={20} />
                    </Button>
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto pt-6 space-y-8 no-scrollbar pb-10">
                    {/* Visual Identity */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-xs px-1">
                            <Palette size={16} />
                            <span>Visual Identity</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { label: 'Active', key: 'activeColor' },
                                { label: 'Resting', key: 'restColor' },
                                { label: 'Concentric', key: 'concentricColor' },
                            ].map((item) => (
                                <div key={item.key} className="space-y-2 p-3 rounded-xl bg-accent/40 border border-border/50">
                                    <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                                        {item.label}
                                    </Label>
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-8 h-8 rounded-lg shadow-inner border border-white/10 shrink-0"
                                            style={{ backgroundColor: (settings as any)[item.key] }}
                                        />
                                        <Input
                                            type="color"
                                            value={(settings as any)[item.key]}
                                            onChange={(e) => handleChange(item.key as any, e.target.value)}
                                            className="h-8 p-0 border-none bg-transparent cursor-pointer w-full"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Timer Logistics */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-xs px-1">
                            <Zap size={16} />
                            <span>Logistics</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground px-1">Concentric window (s)</Label>
                                <Input
                                    type="number"
                                    value={settings.concentricSecond}
                                    onChange={(e) => handleChange('concentricSecond', parseInt(e.target.value) || 1)}
                                    className="bg-accent/40 font-bold border-border/50"
                                    min={1}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground px-1">Prep Buffer (s)</Label>
                                <Input
                                    type="number"
                                    value={settings.prepTime}
                                    onChange={(e) => handleChange('prepTime', parseInt(e.target.value) || 0)}
                                    className="bg-accent/40 font-bold border-border/50"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-4 rounded-xl bg-accent/40 border border-border/50">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-bold tracking-tight">Fluid Animation</Label>
                                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Enable high-frequency UI updates</p>
                            </div>
                            <Switch
                                checked={settings.smoothAnimation}
                                onCheckedChange={(checked) => handleChange('smoothAnimation', checked)}
                            />
                        </div>
                    </section>

                    {/* Core Display */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-xs px-1">
                            <Info size={16} />
                            <span>Core Display</span>
                        </div>

                        <div className="space-y-3">
                            {[
                                { label: 'Full Screen Mode', key: 'fullScreenMode', desc: 'Active theme colors as background' },
                                { label: 'Vertical Mode', key: 'upDownMode', desc: 'Large text ECCENTRIC/CONCENTRIC' },
                                { label: 'Floating PIP', key: 'floatingWindow', desc: 'Picture-in-Picture window support' },
                            ].map((item) => (
                                <div key={item.key} className="flex items-center justify-between p-4 rounded-xl bg-accent/40 border border-border/50">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-bold tracking-tight">{item.label}</Label>
                                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">{item.desc}</p>
                                    </div>
                                    <Switch
                                        checked={(settings as any)[item.key]}
                                        onCheckedChange={(checked) => handleChange(item.key as any, checked)}
                                    />
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Sound Architecture */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-xs px-1">
                            <Volume2 size={16} />
                            <span>Sound Architecture</span>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-4 rounded-xl bg-accent/40 border border-border/50">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-bold tracking-tight">Metronome Ticks</Label>
                                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Audible rhythm during reps</p>
                                </div>
                                <Switch
                                    checked={settings.metronomeEnabled}
                                    onCheckedChange={(checked) => handleChange('metronomeEnabled', checked)}
                                />
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-xl bg-accent/40 border border-border/50">
                                <div className="space-y-0.5">
                                    <Label className="text-sm font-bold tracking-tight">Voice Feedback (TTS)</Label>
                                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Speak rep count and timings</p>
                                </div>
                                <Switch
                                    checked={settings.ttsEnabled}
                                    onCheckedChange={(checked) => handleChange('ttsEnabled', checked)}
                                />
                            </div>

                            {(settings.metronomeEnabled || settings.ttsEnabled) && (
                                <div className="grid grid-cols-2 gap-4 pt-2 animate-in slide-in-from-top-2 duration-300">
                                    {settings.metronomeEnabled && (
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground px-1">Tick Sample</Label>
                                            <select
                                                value={settings.metronomeSound}
                                                onChange={(e) => handleChange('metronomeSound', e.target.value)}
                                                className="w-full h-10 px-3 rounded-md bg-accent/40 border border-border/50 text-sm font-bold outline-none"
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
                                            <Button onClick={testTTS} variant="outline" className="h-10 gap-2 font-black italic tracking-tighter">
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
