import { useEffect, useState } from 'react';
import type { CSSProperties, FC } from 'react';
import { createPortal } from 'react-dom';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import type { WorkoutSettings } from '@/store/useWorkoutStore';
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
import { DEFAULT_PROGRESSION_REMINDER_THRESHOLD } from '@/utils/workoutProgression';
import { getReadableForeground } from '@/utils/colors';
import { useDialogFocus } from '@/hooks/useDialogFocus';

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
const normalizeProgressionReminderThreshold = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
        return DEFAULT_PROGRESSION_REMINDER_THRESHOLD;
    }

    return value;
};

const parseProgressionReminderThreshold = (value: string): number | null => {
    if (!/^\d+$/.test(value.trim())) {
        return null;
    }

    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

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

const SettingsPanel: FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
    const settings = useWorkoutStore((state) => state.settings);
    const setSettings = useWorkoutStore((state) => state.setSettings);
    const designVariant = useWorkoutStore((state) => state.designVariant);
    const theme = useWorkoutStore((state) => state.theme);
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
    const panelRef = useDialogFocus(isOpen, onClose);
    const sectionClassName = isKinetic ? 'console-section space-y-4' : layout.section;
    const sectionTitleClassName = isKinetic ? 'console-label flex items-center gap-2' : layout.sectionTitle;
    const fieldLabelClassName = isKinetic ? 'console-label' : layout.fieldLabel;
    const fieldHelpClassName = isKinetic ? 'text-xs leading-relaxed text-[var(--kinetic-muted)]' : layout.fieldHelp;
    const fieldInputClassName = isKinetic ? 'console-input' : layout.fieldInput;
    const toggleRowClassName = isKinetic ? 'flex min-h-16 items-center justify-between gap-4 border-t border-[var(--kinetic-border)] py-3 first:border-t-0' : layout.toggleRow;
    const rawProgressionReminderThreshold = settings.progressionReminderThreshold;
    const progressionReminderThreshold = normalizeProgressionReminderThreshold(rawProgressionReminderThreshold);
    const [progressionReminderThresholdDraft, setProgressionReminderThresholdDraft] = useState(
        String(progressionReminderThreshold),
    );
    const kineticSwitchClassName = isKinetic ? 'console-switch' : undefined;

    const getVisualIdentityColor = (item: VisualIdentityItem) => {
        if (isKinetic) {
            return kineticSettings[item.key as KineticVisualColorKey] ?? KINETIC_DEFAULT_COLOR;
        }

        return settings[item.key as keyof WorkoutSettings] as string;
    };

    const handleChange = <K extends keyof WorkoutSettings>(key: K, value: WorkoutSettings[K]) => {
        setSettings({ [key]: value });
    };

    useEffect(() => {
        setProgressionReminderThresholdDraft(String(progressionReminderThreshold));
    }, [progressionReminderThreshold]);

    const handleProgressionReminderThresholdChange = (value: string) => {
        setProgressionReminderThresholdDraft(value);
        const parsed = parseProgressionReminderThreshold(value);
        if (parsed !== null) {
            handleChange('progressionReminderThreshold', parsed);
        }
    };

    const commitProgressionReminderThreshold = () => {
        const parsed = parseProgressionReminderThreshold(progressionReminderThresholdDraft);
        if (parsed === null) {
            setProgressionReminderThresholdDraft(String(progressionReminderThreshold));
            return;
        }

        setProgressionReminderThresholdDraft(String(parsed));
        handleChange('progressionReminderThreshold', parsed);
    };

    const paceValues = [parseInt(seconds, 10), parseInt(myoWorkSecs, 10)].filter((value) => Number.isFinite(value) && value > 0);
    const concentricMax = paceValues.length > 0 ? Math.min(...paceValues) : undefined;

    const testTTS = () => {
        audioEngine.init();
        audioEngine.speak('Ready 3 2 1 Go');
    };


    const panel = (
        <div
            data-testid="settings-drawer-overlay"
            aria-hidden={!isOpen}
            className={cn(
                layout.overlay,
                isOpen ? layout.overlayOpen : layout.overlayClosed,
                isKinetic ? 'design-kinetic bg-black/75 backdrop-blur-none' : theme,
            )}
            style={isKinetic ? { '--kinetic-theme-color': kineticThemeColor, '--kinetic-on-accent': getReadableForeground(kineticThemeColor), backgroundColor: 'rgb(0 0 0 / 0.7)' } as CSSProperties : undefined}
            onPointerDown={(event) => {
                if (isOpen && event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <Card
                data-testid="settings-drawer-panel"
                ref={panelRef}
                role={isOpen ? 'dialog' : undefined}
                aria-modal={isOpen ? true : undefined}
                aria-labelledby="settings-panel-title"
                tabIndex={-1}
                className={cn(
                    isKinetic ? 'flex h-full w-full max-w-[30rem] flex-col overflow-hidden rounded-none border-l border-[var(--kinetic-border)] bg-[var(--kinetic-bg)] shadow-none' : layout.panel,
                    isOpen ? layout.panelOpen : layout.panelClosed,
                )}
            >
                <CardHeader className={cn(
                    isKinetic ? 'flex shrink-0 flex-row items-center justify-between gap-3 border-b border-[var(--kinetic-border)] bg-[var(--kinetic-panel)] px-5 pb-4 pt-[calc(var(--safe-top)+1rem)]' : layout.header,
                )}>
                    <CardTitle id="settings-panel-title" className={isKinetic ? 'console-heading flex items-center gap-2 text-lg' : layout.title}>
                        <Monitor size={20} />
                        System Configuration
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className={isKinetic ? 'console-icon' : layout.closeButton}
                        aria-label="Close Settings"
                    >
                        <X size={20} />
                    </Button>
                </CardHeader>

                <CardContent className={cn(
                    isKinetic ? 'min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-4 pb-[calc(var(--safe-bottom)+1.5rem)] sm:px-5' : layout.content,
                )}>
                    {isOpen && (
                        <>
                            <section className={sectionClassName} aria-labelledby="settings-design-mode-title">
                                <div className={sectionTitleClassName}>
                                    <Monitor size={16} />
                                    <span id="settings-design-mode-title">Interface Design</span>
                                </div>

                                {isKinetic ? (
                                    <div className="space-y-2">
                                        <Label htmlFor="settings-interface" className="sr-only">Interface design</Label>
                                        <select id="settings-interface" className="console-select" value={selectedDesignVariant} onChange={(event) => setDesignVariant(event.target.value === 'kinetic' ? 'kinetic' : 'classic')}>
                                            <option value="kinetic">Kinetic Console</option>
                                            <option value="classic">Classic</option>
                                        </select>
                                        <p className="text-xs text-[var(--kinetic-muted)]">Saved on this device. Changing the interface keeps your workouts and settings.</p>
                                    </div>
                                ) : (
                                    <fieldset className="space-y-2">
                                        <legend className="sr-only">Choose interface design</legend>
                                        {([{ value: 'classic', label: 'Classic' }, { value: 'kinetic', label: 'Kinetic Console' }] as const).map((option) => (
                                            <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border/50 bg-accent/20 p-3">
                                                <input type="radio" name="design-mode" value={option.value} checked={selectedDesignVariant === option.value} onChange={() => setDesignVariant(option.value)} className="h-4 w-4 accent-primary" />
                                                <span className="text-sm font-semibold">{option.label}</span>
                                            </label>
                                        ))}
                                    </fieldset>
                                )}
                            </section>

                            <section
                                className={sectionClassName}
                            >
                                <div className={sectionTitleClassName}>
                                    <Palette size={16} />
                                    <span>Visual Identity</span>
                                </div>
                                <div className={isKinetic ? 'grid grid-cols-2 gap-3' : layout.visualGrid}>
                                    {visualIdentityItems.map((item) => {
                                        const colorValue = getVisualIdentityColor(item);
                                        const inputId = `settings-${item.key}`;

                                        return (
                                            <div key={item.key} className={isKinetic ? 'min-w-0 space-y-2' : layout.visualCard}>
                                                <Label htmlFor={inputId} className={fieldLabelClassName}>
                                                    {item.label}
                                                </Label>
                                                <div className="flex items-center gap-3">
                                                    {!isKinetic && <div className={layout.colorSwatch} style={{ backgroundColor: colorValue }} />}
                                                    <Input
                                                        id={inputId}
                                                        type="color"
                                                        value={colorValue}
                                                        onChange={(e) => handleChange(item.key as any, e.target.value)}
                                                        className={isKinetic ? 'console-input cursor-pointer p-1' : layout.colorInput}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>

                            <section className={sectionClassName}>
                                <div className={sectionTitleClassName}>
                                    <Zap size={16} />
                                    <span>Logistics</span>
                                </div>
                                <div className={layout.logisticsGrid}>
                                    <div className={layout.field}>
                                        <Label htmlFor="settings-concentric" className={fieldLabelClassName}>Concentric window (s)</Label>
                                        <Input
                                            id="settings-concentric"
                                            type="number"
                                            value={settings.concentricSecond}
                                            onChange={(e) => {
                                                const parsed = parseInt(e.target.value, 10);
                                                const requested = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
                                                handleChange('concentricSecond', concentricMax ? Math.min(requested, concentricMax) : requested);
                                            }}
                                            className={fieldInputClassName}
                                            min={1}
                                            max={concentricMax}
                                        />
                                        <p className={fieldHelpClassName}>
                                            Max = fastest rep pace ({concentricMax ?? 1}s)
                                        </p>
                                    </div>
                                    <div className={layout.field}>
                                        <Label htmlFor="settings-prep" className={fieldLabelClassName}>Prep Buffer (s)</Label>
                                        <Input
                                            id="settings-prep"
                                            min={0}
                                            type="number"
                                            value={settings.prepTime}
                                            onChange={(e) => handleChange('prepTime', parseInt(e.target.value) || 0)}
                                            className={fieldInputClassName}
                                        />
                                    </div>
                                </div>

                                <div className={toggleRowClassName}>
                                    <div className="space-y-0.5">
                                        <Label htmlFor="settings-smooth" className={fieldLabelClassName}>Fluid Animation</Label>
                                        <p className={fieldHelpClassName}>Enable high-frequency UI updates</p>
                                    </div>
                                    <Switch
                                        id="settings-smooth"
                                        checked={settings.smoothAnimation}
                                        onCheckedChange={(checked) => handleChange('smoothAnimation', checked)}
                                        className={kineticSwitchClassName}
                                    />
                                </div>
                            </section>

                            <section className={sectionClassName}>
                                <div className={sectionTitleClassName}>
                                    <Info size={16} />
                                    <span>Progression</span>
                                </div>
                                <div className={layout.field}>
                                    <Label
                                        htmlFor="settings-progression-reminder-threshold"
                                        className={fieldLabelClassName}
                                    >
                                        Progression reminder after
                                    </Label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            id="settings-progression-reminder-threshold"
                                            type="number"
                                            min={1}
                                            step={1}
                                            inputMode="numeric"
                                            value={progressionReminderThresholdDraft}
                                            onChange={(event) => handleProgressionReminderThresholdChange(event.target.value)}
                                            onBlur={commitProgressionReminderThreshold}
                                            aria-describedby="settings-progression-reminder-threshold-help"
                                            className={cn(fieldInputClassName, 'max-w-28')}
                                        />
                                        <span className="text-sm text-muted-foreground">completed sessions</span>
                                    </div>
                                    <p
                                        id="settings-progression-reminder-threshold-help"
                                        className={fieldHelpClassName}
                                    >
                                        Reminds you to review a workout after this many completed sessions. Editing its workout settings or notes resets its count.
                                    </p>
                                </div>
                            </section>

                            <section className={sectionClassName}>
                                <div className={sectionTitleClassName}>
                                    <Info size={16} />
                                    <span>Core Display</span>
                                </div>

                                <div className="space-y-3">
                                    {[
                                        { label: 'Full Screen Mode', key: 'fullScreenMode', desc: 'Active theme colors as background' },
                                        { label: 'Vertical Mode', key: 'upDownMode', desc: 'Large text ECCENTRIC/CONCENTRIC' },
                                    ].map((item) => (
                                        <div key={item.key} className={toggleRowClassName}>
                                            <div className="space-y-0.5">
                                                <Label htmlFor={`settings-${item.key}`} className={fieldLabelClassName}>{item.label}</Label>
                                                <p className={fieldHelpClassName}>{item.desc}</p>
                                            </div>
                                            <Switch
                                                id={`settings-${item.key}`}
                                                checked={(settings as any)[item.key]}
                                                onCheckedChange={(checked) => handleChange(item.key as any, checked)}
                                                className={kineticSwitchClassName}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className={sectionClassName}>
                                <div className={sectionTitleClassName}>
                                    <Volume2 size={16} />
                                    <span>Audio &amp; Voice</span>
                                </div>

                                <div className="space-y-3">
                                    <div className={toggleRowClassName}>
                                        <div className="space-y-0.5">
                                            <Label htmlFor="settings-metronome" className={fieldLabelClassName}>Metronome Ticks</Label>
                                            <p className={fieldHelpClassName}>Audible rhythm during reps</p>
                                        </div>
                                        <Switch
                                            id="settings-metronome"
                                            checked={settings.metronomeEnabled}
                                            onCheckedChange={(checked) => handleChange('metronomeEnabled', checked)}
                                            className={kineticSwitchClassName}
                                        />
                                    </div>

                                    <div className={toggleRowClassName}>
                                        <div className="space-y-0.5">
                                            <Label htmlFor="settings-voice-guidance" className={fieldLabelClassName}>Voice Guidance</Label>
                                            <p className={fieldHelpClassName}>Speak rep counts and timing cues</p>
                                        </div>
                                        <Switch
                                            id="settings-voice-guidance"
                                            checked={settings.ttsEnabled}
                                            onCheckedChange={(checked) => handleChange('ttsEnabled', checked)}
                                            className={kineticSwitchClassName}
                                        />
                                    </div>

                                    {(settings.metronomeEnabled || settings.ttsEnabled) && (
                                        <div className={layout.soundActions}>
                                            {settings.metronomeEnabled && (
                                                <div className={layout.field}>
                                                    <Label htmlFor="settings-tick-sample" className={fieldLabelClassName}>Tick Sample</Label>
                                                    <select
                                                        id="settings-tick-sample"
                                                        value={settings.metronomeSound}
                                                        onChange={(e) => handleChange('metronomeSound', e.target.value)}
                                                        className={isKinetic ? 'console-select' : layout.selectField}
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
                                                    <Button onClick={testTTS} variant="outline" className={isKinetic ? 'console-button' : layout.testButton}>
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
