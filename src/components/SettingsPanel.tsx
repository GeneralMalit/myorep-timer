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

type KineticVisualColorKey =
    | 'kineticThemeColor'
    | 'kineticActiveColor'
    | 'kineticRestColor'
    | 'kineticConcentricColor'
    | 'kineticFinishedColor';

type KineticVisualSettings = WorkoutSettings & Partial<Record<KineticVisualColorKey, string>>;

type VisualIdentityItem = {
    label: string;
    key: keyof WorkoutSettings | KineticVisualColorKey;
};

const KINETIC_DEFAULT_COLOR = '#FFFFFF';

const CLASSIC_VISUAL_COLORS: VisualIdentityItem[] = [
    { label: 'Active', key: 'activeColor' },
    { label: 'Resting', key: 'restColor' },
    { label: 'Concentric', key: 'concentricColor' },
];

const KINETIC_VISUAL_COLORS: VisualIdentityItem[] = [
    { label: 'Theme', key: 'kineticThemeColor' },
    { label: 'Active', key: 'kineticActiveColor' },
    { label: 'Resting', key: 'kineticRestColor' },
    { label: 'Concentric', key: 'kineticConcentricColor' },
    { label: 'Finished', key: 'kineticFinishedColor' },
];

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
    const designVariant = useWorkoutStore((state) => state.designVariant);
    const setDesignVariant = useWorkoutStore((state) => state.setDesignVariant);
    const seconds = useWorkoutStore((state) => state.seconds);
    const myoWorkSecs = useWorkoutStore((state) => state.myoWorkSecs);
    const selectedDesignVariant = designVariant ?? 'classic';
    const isKinetic = selectedDesignVariant === 'kinetic';
    const kineticSettings = settings as KineticVisualSettings;
    const kineticThemeColor = kineticSettings.kineticThemeColor ?? KINETIC_DEFAULT_COLOR;
    const visualIdentityItems = isKinetic ? KINETIC_VISUAL_COLORS : CLASSIC_VISUAL_COLORS;
    const isMobileViewport = useMobileViewport();
    const layout = getResponsiveLayout(isMobileViewport, settingsPanelMobileLayout, settingsPanelDesktopLayout);
    const [shouldRenderContent, setShouldRenderContent] = useState(isOpen);
    const kineticSwitchClassName = isKinetic
        ? 'border-[#424940] bg-[#272c27] data-[state=checked]:border-[#A8FF5A] data-[state=checked]:bg-[#A8FF5A] data-[state=checked]:[&>span]:bg-[#111412] data-[state=unchecked]:bg-[#272c27] focus-visible:ring-[#FF5B36] focus-visible:ring-offset-[#111412]'
        : undefined;

    const getVisualIdentityColor = (item: VisualIdentityItem) => {
        if (isKinetic) {
            return kineticSettings[item.key as KineticVisualColorKey] ?? KINETIC_DEFAULT_COLOR;
        }

        return settings[item.key as keyof WorkoutSettings] as string;
    };

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
                isKinetic && 'bg-black/75 backdrop-blur-none',
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
                    isKinetic && 'w-full max-w-[30rem] rounded-none border-[#343833] bg-[#111412] text-[#F2F0ED] shadow-[-8px_0_20px_rgba(0,0,0,0.25)]',
                )}
            >
                <CardHeader className={cn(layout.header, isKinetic && 'gap-3 border-[#343833] bg-[#171a17] px-5 pb-4 pt-5')}>
                    <CardTitle className={cn(layout.title, isKinetic && 'text-base font-semibold not-italic tracking-tight text-[#F2F0ED]')}>
                        <Monitor className={cn('text-primary', isKinetic && 'text-[#FF5B36]')} size={20} />
                        System Configuration
                    </CardTitle>
                    <Button variant="ghost" size="icon" onClick={onClose} className={cn(layout.closeButton, isKinetic && 'h-9 w-9 rounded-[8px] text-[#C6CAC3] hover:bg-[#252925] hover:text-[#F2F0ED]')} aria-label="Close Settings">
                        <X size={20} />
                    </Button>
                </CardHeader>

                <CardContent className={cn(layout.content, isKinetic && 'space-y-4 px-5 pb-8 pt-4')}>
                    {!shouldRenderContent ? (
                        <div className="space-y-4">
                            <div className={cn('h-32 rounded-[24px] border border-border/60 bg-card/50 p-4', isKinetic && 'rounded-[10px] border-[#343833] bg-[#171a17]')}>
                                <div className={cn('h-3 w-24 animate-pulse rounded-full bg-muted/70', isKinetic && 'bg-[#313731]')} />
                                <div className={cn('mt-4 h-20 rounded-2xl bg-muted/30', isKinetic && 'rounded-[8px] bg-[#232723]')} />
                            </div>
                            <div className={cn('h-24 rounded-[24px] border border-border/60 bg-card/50 p-4', isKinetic && 'rounded-[10px] border-[#343833] bg-[#171a17]')}>
                                <div className={cn('h-3 w-20 animate-pulse rounded-full bg-muted/70', isKinetic && 'bg-[#313731]')} />
                                <div className={cn('mt-4 h-12 rounded-2xl bg-muted/30', isKinetic && 'rounded-[8px] bg-[#232723]')} />
                            </div>
                            <div className={cn('h-24 rounded-[24px] border border-border/60 bg-card/50 p-4', isKinetic && 'rounded-[10px] border-[#343833] bg-[#171a17]')}>
                                <div className={cn('h-3 w-28 animate-pulse rounded-full bg-muted/70', isKinetic && 'bg-[#313731]')} />
                                <div className={cn('mt-4 h-12 rounded-2xl bg-muted/30', isKinetic && 'rounded-[8px] bg-[#232723]')} />
                            </div>
                        </div>
                    ) : (
                        <>
                            <section className={cn(layout.section, isKinetic && 'space-y-3 rounded-[10px] border-[#343833] bg-[#171a17] p-4')} aria-labelledby="settings-design-mode-title">
                                <div className={cn(layout.sectionTitle, isKinetic && 'normal-case text-[11px] font-semibold tracking-[0.08em] text-[#9EA69B]')}>
                                    <Monitor size={16} />
                                    <span id="settings-design-mode-title">Interface Design</span>
                                </div>

                                <fieldset className="space-y-2" aria-describedby="settings-design-mode-description">
                                    <legend className="sr-only">Choose interface design</legend>
                                    <label
                                        htmlFor="settings-design-mode-classic"
                                        className={cn(
                                            'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                                            selectedDesignVariant === 'classic'
                                                ? 'border-primary bg-primary/10'
                                                : 'border-border/50 bg-accent/20 hover:border-primary/50',
                                            isKinetic && (selectedDesignVariant === 'classic'
                                                ? 'border-[#4DABF7] bg-[#4DABF7]/10 hover:border-[#4DABF7]'
                                                : 'border-[#343833] bg-[#111412] hover:border-[#4DABF7]/70'),
                                        )}
                                    >
                                        <input
                                            id="settings-design-mode-classic"
                                            type="radio"
                                            name="design-mode"
                                            value="classic"
                                            checked={selectedDesignVariant === 'classic'}
                                            onChange={() => setDesignVariant('classic')}
                                            className={cn('mt-1 h-4 w-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', isKinetic && 'accent-[#4DABF7] focus-visible:ring-[#4DABF7] focus-visible:ring-offset-[#171a17]')}
                                        />
                                        <span className={cn('space-y-0.5', isKinetic && 'text-[#F2F0ED]')}>
                                            <span className={cn('block text-sm font-bold', isKinetic && 'font-semibold')}>Classic</span>
                                            <span className={cn('block text-xs text-muted-foreground', isKinetic && 'text-[#9EA69B]')}>Keep the current timer layout and controls.</span>
                                        </span>
                                    </label>

                                    <label
                                        htmlFor="settings-design-mode-kinetic"
                                        className={cn(
                                            'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                                            selectedDesignVariant === 'kinetic'
                                                ? 'border-primary bg-primary/10'
                                                : 'border-border/50 bg-accent/20 hover:border-primary/50',
                                            isKinetic && (selectedDesignVariant === 'kinetic'
                                                ? 'border-[#FF5B36] bg-[#FF5B36]/10 hover:border-[#FF5B36]'
                                                : 'border-[#343833] bg-[#111412] hover:border-[#FF5B36]/70'),
                                        )}
                                    >
                                        <input
                                            id="settings-design-mode-kinetic"
                                            type="radio"
                                            name="design-mode"
                                            value="kinetic"
                                            checked={selectedDesignVariant === 'kinetic'}
                                            onChange={() => setDesignVariant('kinetic')}
                                            className={cn('mt-1 h-4 w-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', isKinetic && 'accent-[#FF5B36] focus-visible:ring-[#FF5B36] focus-visible:ring-offset-[#171a17]')}
                                        />
                                        <span className={cn('space-y-0.5', isKinetic && 'text-[#F2F0ED]')}>
                                            <span className={cn('block text-sm font-bold', isKinetic && 'font-semibold')}>Kinetic Console</span>
                                            <span className={cn('block text-xs text-muted-foreground', isKinetic && 'text-[#9EA69B]')}>Use the redesigned workout experience.</span>
                                        </span>
                                    </label>
                                </fieldset>
                                <p id="settings-design-mode-description" className={cn('text-xs text-muted-foreground', isKinetic && 'text-[#8A9285]')}>
                                    Your choice is saved on this device and can be changed at any time.
                                </p>
                            </section>

                            <section
                                className={cn(layout.section, isKinetic && 'space-y-3 rounded-[10px] border-[#343833] bg-[#171a17] p-4')}
                                style={isKinetic ? { '--kinetic-theme-color': kineticThemeColor } as React.CSSProperties : undefined}
                            >
                                <div className={cn(layout.sectionTitle, isKinetic && 'normal-case text-[11px] font-semibold tracking-[0.08em] text-[var(--kinetic-theme-color)]')}>
                                    <Palette size={16} />
                                    <span>Visual Identity</span>
                                </div>
                                <div className={layout.visualGrid}>
                                    {visualIdentityItems.map((item) => {
                                        const colorValue = getVisualIdentityColor(item);
                                        const inputId = `settings-${item.key}`;

                                        return (
                                            <div key={item.key} className={cn(layout.visualCard, isKinetic && 'space-y-2 rounded-[8px] border-[#343833] bg-[#111412] p-3')}>
                                                <Label htmlFor={inputId} className={cn(layout.fieldLabel, isKinetic && 'normal-case px-0 text-[11px] font-medium tracking-normal text-[#C6CAC3]')}>
                                                    {item.label}
                                                </Label>
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className={cn(layout.colorSwatch, isKinetic && 'h-8 w-8 rounded-[7px] border-[var(--kinetic-theme-color)] shadow-none')}
                                                        style={{ backgroundColor: colorValue }}
                                                    />
                                                    <Input
                                                        id={inputId}
                                                        type="color"
                                                        value={colorValue}
                                                        onChange={(e) => handleChange(item.key as any, e.target.value)}
                                                        className={cn(layout.colorInput, isKinetic && 'h-8 rounded-[6px] bg-transparent focus-visible:ring-[var(--kinetic-theme-color)] focus-visible:ring-offset-[#111412]')}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>

                            <section className={cn(layout.section, isKinetic && 'space-y-3 rounded-[10px] border-[#343833] bg-[#171a17] p-4')}>
                                <div className={cn(layout.sectionTitle, isKinetic && 'normal-case text-[11px] font-semibold tracking-[0.08em] text-[#9EA69B]')}>
                                    <Zap size={16} />
                                    <span>Logistics</span>
                                </div>
                                <div className={layout.logisticsGrid}>
                                    <div className={layout.field}>
                                        <Label className={cn(layout.fieldLabel, isKinetic && 'normal-case px-0 text-[11px] font-medium tracking-normal text-[#C6CAC3]')}>Concentric window (s)</Label>
                                        <Input
                                            type="number"
                                            value={settings.concentricSecond}
                                            onChange={(e) => {
                                                const parsed = parseInt(e.target.value, 10);
                                                const requested = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
                                                handleChange('concentricSecond', concentricMax ? Math.min(requested, concentricMax) : requested);
                                            }}
                                            className={cn(layout.fieldInput, isKinetic && 'h-10 rounded-[8px] border-[#424940] bg-[#111412] font-medium text-[#F2F0ED] focus-visible:ring-[#FF5B36] focus-visible:ring-offset-[#171a17]')}
                                            min={1}
                                            max={concentricMax}
                                        />
                                        <p className={cn(layout.fieldHelp, isKinetic && 'normal-case px-0 text-[11px] tracking-normal text-[#8A9285]')}>
                                            Max = fastest rep pace ({concentricMax ?? 1}s)
                                        </p>
                                    </div>
                                    <div className={layout.field}>
                                        <Label className={cn(layout.fieldLabel, isKinetic && 'normal-case px-0 text-[11px] font-medium tracking-normal text-[#C6CAC3]')}>Prep Buffer (s)</Label>
                                        <Input
                                            type="number"
                                            value={settings.prepTime}
                                            onChange={(e) => handleChange('prepTime', parseInt(e.target.value) || 0)}
                                            className={cn(layout.fieldInput, isKinetic && 'h-10 rounded-[8px] border-[#424940] bg-[#111412] font-medium text-[#F2F0ED] focus-visible:ring-[#FF5B36] focus-visible:ring-offset-[#171a17]')}
                                        />
                                    </div>
                                </div>

                                <div className={cn(layout.toggleRow, isKinetic && 'rounded-[8px] border-[#343833] bg-[#111412] p-3')}>
                                    <div className="space-y-0.5">
                                        <Label className={cn(layout.toggleTitle, isKinetic && 'font-medium tracking-normal text-[#F2F0ED]')}>Fluid Animation</Label>
                                        <p className={cn(layout.toggleCopy, isKinetic && 'normal-case text-[11px] font-normal tracking-normal text-[#8A9285]')}>Enable high-frequency UI updates</p>
                                    </div>
                                    <Switch
                                        checked={settings.smoothAnimation}
                                        onCheckedChange={(checked) => handleChange('smoothAnimation', checked)}
                                        className={kineticSwitchClassName}
                                    />
                                </div>
                            </section>

                            <section className={cn(layout.section, isKinetic && 'space-y-3 rounded-[10px] border-[#343833] bg-[#171a17] p-4')}>
                                <div className={cn(layout.sectionTitle, isKinetic && 'normal-case text-[11px] font-semibold tracking-[0.08em] text-[#9EA69B]')}>
                                    <Info size={16} />
                                    <span>Core Display</span>
                                </div>

                                <div className="space-y-3">
                                    {[
                                        { label: 'Full Screen Mode', key: 'fullScreenMode', desc: 'Active theme colors as background' },
                                        { label: 'Vertical Mode', key: 'upDownMode', desc: 'Large text ECCENTRIC/CONCENTRIC' },
                                    ].map((item) => (
                                        <div key={item.key} className={cn(layout.toggleRow, isKinetic && 'rounded-[8px] border-[#343833] bg-[#111412] p-3')}>
                                            <div className="space-y-0.5">
                                                <Label className={cn(layout.toggleTitle, isKinetic && 'font-medium tracking-normal text-[#F2F0ED]')}>{item.label}</Label>
                                                <p className={cn(layout.toggleCopy, isKinetic && 'normal-case text-[11px] font-normal tracking-normal text-[#8A9285]')}>{item.desc}</p>
                                            </div>
                                            <Switch
                                                checked={(settings as any)[item.key]}
                                                onCheckedChange={(checked) => handleChange(item.key as any, checked)}
                                                className={kineticSwitchClassName}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className={cn(layout.section, isKinetic && 'space-y-3 rounded-[10px] border-[#343833] bg-[#171a17] p-4')}>
                                <div className={cn(layout.sectionTitle, isKinetic && 'normal-case text-[11px] font-semibold tracking-[0.08em] text-[#9EA69B]')}>
                                    <Volume2 size={16} />
                                    <span>Sound Architecture</span>
                                </div>

                                <div className="space-y-3">
                                    <div className={cn(layout.toggleRow, isKinetic && 'rounded-[8px] border-[#343833] bg-[#111412] p-3')}>
                                        <div className="space-y-0.5">
                                            <Label className={cn(layout.toggleTitle, isKinetic && 'font-medium tracking-normal text-[#F2F0ED]')}>Metronome Ticks</Label>
                                            <p className={cn(layout.toggleCopy, isKinetic && 'normal-case text-[11px] font-normal tracking-normal text-[#8A9285]')}>Audible rhythm during reps</p>
                                        </div>
                                        <Switch
                                            checked={settings.metronomeEnabled}
                                            onCheckedChange={(checked) => handleChange('metronomeEnabled', checked)}
                                            className={kineticSwitchClassName}
                                        />
                                    </div>

                                    <div className={cn(layout.toggleRow, isKinetic && 'rounded-[8px] border-[#343833] bg-[#111412] p-3')}>
                                        <div className="space-y-0.5">
                                            <Label className={cn(layout.toggleTitle, isKinetic && 'font-medium tracking-normal text-[#F2F0ED]')}>Voice Feedback (TTS)</Label>
                                            <p className={cn(layout.toggleCopy, isKinetic && 'normal-case text-[11px] font-normal tracking-normal text-[#8A9285]')}>Speak rep count and timings</p>
                                        </div>
                                        <Switch
                                            checked={settings.ttsEnabled}
                                            onCheckedChange={(checked) => handleChange('ttsEnabled', checked)}
                                            className={kineticSwitchClassName}
                                        />
                                    </div>

                                    {(settings.metronomeEnabled || settings.ttsEnabled) && (
                                        <div className={layout.soundActions}>
                                            {settings.metronomeEnabled && (
                                                <div className={layout.field}>
                                                    <Label className={cn(layout.fieldLabel, isKinetic && 'normal-case px-0 text-[11px] font-medium tracking-normal text-[#C6CAC3]')}>Tick Sample</Label>
                                                    <select
                                                        value={settings.metronomeSound}
                                                        onChange={(e) => handleChange('metronomeSound', e.target.value)}
                                                        className={cn(layout.selectField, isKinetic && 'h-10 rounded-[8px] border-[#424940] bg-[#111412] font-medium text-[#F2F0ED] focus:border-[#FF5B36] focus:outline-none')}
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
                                                    <Button onClick={testTTS} variant="outline" className={cn(layout.testButton, isKinetic && 'min-h-10 rounded-[8px] border-[#424940] bg-[#111412] font-semibold not-italic tracking-normal text-[#C6CAC3] hover:border-[#4DABF7] hover:bg-[#1A211E] hover:text-[#F2F0ED]')}>
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
