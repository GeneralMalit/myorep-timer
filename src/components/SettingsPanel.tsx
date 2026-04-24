import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { getResponsiveLayout } from '@/layout';
import { audioEngine } from '@/utils/audioEngine';
import { cn } from '@/lib/utils';
import { settingsPanelDesktopLayout } from '@/layout/settingsPanel.desktop';
import { settingsPanelMobileLayout } from '@/layout/settingsPanel.mobile';

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const useMobileViewport = () => {
    const [isMobileViewport, setIsMobileViewport] = useState(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return false;
        }

        return window.matchMedia('(max-width: 767px)').matches;
    });

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return;
        }

        const mediaQuery = window.matchMedia('(max-width: 767px)');
        const handleViewportChange = (event: MediaQueryListEvent | MediaQueryList) => {
            setIsMobileViewport('matches' in event ? event.matches : mediaQuery.matches);
        };

        handleViewportChange(mediaQuery);

        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handleViewportChange);
            return () => mediaQuery.removeEventListener('change', handleViewportChange);
        }

        mediaQuery.addListener(handleViewportChange);
        return () => mediaQuery.removeListener(handleViewportChange);
    }, []);

    return isMobileViewport;
};

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
    const settings = useWorkoutStore((state) => state.settings);
    const setSettings = useWorkoutStore((state) => state.setSettings);
    const seconds = useWorkoutStore((state) => state.seconds);
    const myoWorkSecs = useWorkoutStore((state) => state.myoWorkSecs);
    const isMobileViewport = useMobileViewport();
    const layout = getResponsiveLayout(isMobileViewport, settingsPanelMobileLayout, settingsPanelDesktopLayout);
    const [shouldRenderContent, setShouldRenderContent] = useState(isOpen);

    const handleChange = <K extends keyof WorkoutSettings>(key: K, value: WorkoutSettings[K]) => {
        setSettings({ [key]: value });
    };

    const paceValues = [parseInt(seconds, 10), parseInt(myoWorkSecs, 10)].filter((value) => Number.isFinite(value) && value > 0);
    const concentricMax = paceValues.length > 0 ? Math.min(...paceValues) : undefined;

    const testTTS = () => {
        audioEngine.init();
        audioEngine.speak('Ready 3 2 1 Go');
    };

    useEffect(() => {
        if (!isOpen) {
            setShouldRenderContent(false);
            return undefined;
        }

        const frame = window.requestAnimationFrame(() => {
            setShouldRenderContent(true);
        });

        return () => window.cancelAnimationFrame(frame);
    }, [isOpen]);

    const panel = (
        <div
            data-testid="settings-drawer-overlay"
            aria-hidden={!isOpen}
            className={cn(
                layout.overlay,
                isOpen ? layout.overlayOpen : layout.overlayClosed,
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
                    layout.panel,
                    isOpen ? layout.panelOpen : layout.panelClosed,
                )}
            >
                <CardHeader className={layout.header}>
                    <CardTitle className={layout.title}>
                        <Monitor className="text-primary" size={20} />
                        System Configuration
                    </CardTitle>
                    <Button variant="ghost" size="icon" onClick={onClose} className={layout.closeButton} aria-label="Close Settings">
                        <X size={20} />
                    </Button>
                </CardHeader>

                <CardContent className={layout.content}>
                    {!shouldRenderContent ? (
                        <div className="space-y-4">
                            <div className="h-32 rounded-[24px] border border-border/60 bg-card/50 p-4">
                                <div className="h-3 w-24 animate-pulse rounded-full bg-muted/70" />
                                <div className="mt-4 h-20 rounded-2xl bg-muted/30" />
                            </div>
                            <div className="h-24 rounded-[24px] border border-border/60 bg-card/50 p-4">
                                <div className="h-3 w-20 animate-pulse rounded-full bg-muted/70" />
                                <div className="mt-4 h-12 rounded-2xl bg-muted/30" />
                            </div>
                            <div className="h-24 rounded-[24px] border border-border/60 bg-card/50 p-4">
                                <div className="h-3 w-28 animate-pulse rounded-full bg-muted/70" />
                                <div className="mt-4 h-12 rounded-2xl bg-muted/30" />
                            </div>
                        </div>
                    ) : (
                        <>
                            <section className={layout.section}>
                                <div className={layout.sectionTitle}>
                                    <Palette size={16} />
                                    <span>Visual Identity</span>
                                </div>
                                <div className={layout.visualGrid}>
                                    {[
                                        { label: 'Active', key: 'activeColor' },
                                        { label: 'Resting', key: 'restColor' },
                                        { label: 'Concentric', key: 'concentricColor' },
                                    ].map((item) => (
                                        <div key={item.key} className={layout.visualCard}>
                                            <Label className={layout.fieldLabel}>
                                                {item.label}
                                            </Label>
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className={layout.colorSwatch}
                                                    style={{ backgroundColor: (settings as any)[item.key] }}
                                                />
                                                <Input
                                                    type="color"
                                                    value={(settings as any)[item.key]}
                                                    onChange={(e) => handleChange(item.key as any, e.target.value)}
                                                    className={layout.colorInput}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className={layout.section}>
                                <div className={layout.sectionTitle}>
                                    <Zap size={16} />
                                    <span>Logistics</span>
                                </div>
                                <div className={layout.logisticsGrid}>
                                    <div className={layout.field}>
                                        <Label className={layout.fieldLabel}>Concentric window (s)</Label>
                                        <Input
                                            type="number"
                                            value={settings.concentricSecond}
                                            onChange={(e) => {
                                                const parsed = parseInt(e.target.value, 10);
                                                const requested = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
                                                handleChange('concentricSecond', concentricMax ? Math.min(requested, concentricMax) : requested);
                                            }}
                                            className={layout.fieldInput}
                                            min={1}
                                            max={concentricMax}
                                        />
                                        <p className={layout.fieldHelp}>
                                            Max = fastest rep pace ({concentricMax ?? 1}s)
                                        </p>
                                    </div>
                                    <div className={layout.field}>
                                        <Label className={layout.fieldLabel}>Prep Buffer (s)</Label>
                                        <Input
                                            type="number"
                                            value={settings.prepTime}
                                            onChange={(e) => handleChange('prepTime', parseInt(e.target.value) || 0)}
                                            className={layout.fieldInput}
                                        />
                                    </div>
                                </div>

                                <div className={layout.toggleRow}>
                                    <div className="space-y-0.5">
                                        <Label className={layout.toggleTitle}>Fluid Animation</Label>
                                        <p className={layout.toggleCopy}>Enable high-frequency UI updates</p>
                                    </div>
                                    <Switch
                                        checked={settings.smoothAnimation}
                                        onCheckedChange={(checked) => handleChange('smoothAnimation', checked)}
                                    />
                                </div>
                            </section>

                            <section className={layout.section}>
                                <div className={layout.sectionTitle}>
                                    <Info size={16} />
                                    <span>Core Display</span>
                                </div>

                                <div className="space-y-3">
                                    {[
                                        { label: 'Full Screen Mode', key: 'fullScreenMode', desc: 'Active theme colors as background' },
                                        { label: 'Vertical Mode', key: 'upDownMode', desc: 'Large text ECCENTRIC/CONCENTRIC' },
                                    ].map((item) => (
                                        <div key={item.key} className={layout.toggleRow}>
                                            <div className="space-y-0.5">
                                                <Label className={layout.toggleTitle}>{item.label}</Label>
                                                <p className={layout.toggleCopy}>{item.desc}</p>
                                            </div>
                                            <Switch
                                                checked={(settings as any)[item.key]}
                                                onCheckedChange={(checked) => handleChange(item.key as any, checked)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className={layout.section}>
                                <div className={layout.sectionTitle}>
                                    <Volume2 size={16} />
                                    <span>Sound Architecture</span>
                                </div>

                                <div className="space-y-3">
                                    <div className={layout.toggleRow}>
                                        <div className="space-y-0.5">
                                            <Label className={layout.toggleTitle}>Metronome Ticks</Label>
                                            <p className={layout.toggleCopy}>Audible rhythm during reps</p>
                                        </div>
                                        <Switch
                                            checked={settings.metronomeEnabled}
                                            onCheckedChange={(checked) => handleChange('metronomeEnabled', checked)}
                                        />
                                    </div>

                                    <div className={layout.toggleRow}>
                                        <div className="space-y-0.5">
                                            <Label className={layout.toggleTitle}>Voice Feedback (TTS)</Label>
                                            <p className={layout.toggleCopy}>Speak rep count and timings</p>
                                        </div>
                                        <Switch
                                            checked={settings.ttsEnabled}
                                            onCheckedChange={(checked) => handleChange('ttsEnabled', checked)}
                                        />
                                    </div>

                                    {(settings.metronomeEnabled || settings.ttsEnabled) && (
                                        <div className={layout.soundActions}>
                                            {settings.metronomeEnabled && (
                                                <div className={layout.field}>
                                                    <Label className={layout.fieldLabel}>Tick Sample</Label>
                                                    <select
                                                        value={settings.metronomeSound}
                                                        onChange={(e) => handleChange('metronomeSound', e.target.value)}
                                                        className={layout.selectField}
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
                                                    <Button onClick={testTTS} variant="outline" className={layout.testButton}>
                                                        <Play size={14} /> TEST VOICES
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </section>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
    return typeof document === 'undefined' ? panel : createPortal(panel, document.body);
};

export default SettingsPanel;
