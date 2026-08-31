import { useMemo } from 'react';
import { Activity, ChevronRight, Clock3, Mic2, RotateCcw, Square, Volume2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { useShallow } from 'zustand/react/shallow';
import { normalizeSetsInput } from '@/utils/savedWorkouts';
import { audioEngine } from '@/utils/audioEngine';
import { estimateWorkoutDurationSeconds, formatEstimatedSessionDuration } from '@/utils/savedSessions';

type WorkoutConfigField = 'sets' | 'reps' | 'seconds' | 'rest' | 'myoReps' | 'myoWorkSecs';

interface KineticWorkoutSetupProps {
    onStart: () => void;
    onSelectSession: () => void;
    canUseSessionBuilder: boolean;
}

const KineticWorkoutSetup = ({ onStart, onSelectSession, canUseSessionBuilder }: KineticWorkoutSetupProps) => {
    const {
        settings,
        sets,
        reps,
        seconds,
        rest,
        myoReps,
        myoWorkSecs,
        setSettings,
        setWorkoutConfig,
    } = useWorkoutStore(useShallow((state) => ({
        settings: state.settings,
        sets: state.sets,
        reps: state.reps,
        seconds: state.seconds,
        rest: state.rest,
        myoReps: state.myoReps,
        myoWorkSecs: state.myoWorkSecs,
        setSettings: state.setSettings,
        setWorkoutConfig: state.setWorkoutConfig,
    })));

    const isSingleCycle = normalizeSetsInput(sets) === '1';
    const estimatedDuration = useMemo(() => {
        const workoutSeconds = estimateWorkoutDurationSeconds({ sets, reps, seconds, rest, myoReps, myoWorkSecs });
        if (workoutSeconds === null) {
            return '--:--';
        }

        const prepSeconds = Number.isFinite(settings.prepTime) ? Math.max(0, Math.floor(settings.prepTime)) : 0;
        return formatEstimatedSessionDuration(workoutSeconds + prepSeconds);
    }, [myoReps, myoWorkSecs, reps, rest, seconds, sets, settings.prepTime]);
    const controls: Array<{
        key: WorkoutConfigField;
        label: string;
        value: string;
        icon: typeof Activity;
        unit: string;
        tone: string;
        disabled?: boolean;
    }> = [
        { key: 'sets', label: 'Total cycles', value: sets, icon: RotateCcw, unit: '', tone: '#f2f0ed' },
        { key: 'reps', label: 'Activation reps', value: reps, icon: Activity, unit: '', tone: settings.kineticActiveColor ?? '#ffffff' },
        { key: 'seconds', label: 'Activation pace', value: seconds, icon: Zap, unit: 'sec', tone: settings.kineticActiveColor ?? '#ffffff' },
        { key: 'rest', label: 'Rest interval', value: rest, icon: Square, unit: 'sec', tone: settings.kineticRestColor ?? '#ffffff', disabled: isSingleCycle },
        { key: 'myoReps', label: 'Myo reps', value: myoReps, icon: Activity, unit: '', tone: settings.kineticConcentricColor ?? '#ffffff', disabled: isSingleCycle },
        { key: 'myoWorkSecs', label: 'Myo pace', value: myoWorkSecs, icon: Zap, unit: 'sec', tone: settings.kineticConcentricColor ?? '#ffffff', disabled: isSingleCycle },
    ];

    const adjustControl = (key: WorkoutConfigField, currentValue: string, delta: number) => {
        const current = Number.parseInt(currentValue, 10);
        const nextValue = Math.max(1, (Number.isFinite(current) ? current : 1) + delta);
        setWorkoutConfig({ [key]: String(nextValue) });
    };

    return (
        <section data-testid="kinetic-workout-setup" className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col px-4 py-6 sm:px-7 lg:px-10 lg:py-10">
            <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="font-['Sora'] text-3xl font-bold tracking-[-0.045em] text-white sm:text-4xl">Build a workout</h1>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">Set the work, then let the clock take over.</p>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    onClick={onSelectSession}
                    className="h-10 self-start rounded-lg border border-white/15 px-3 text-sm text-zinc-300 hover:bg-white/8 hover:text-white sm:self-auto"
                >
                    {canUseSessionBuilder ? 'Build a session' : 'Sessions require Plus'}
                </Button>
            </header>

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border border-white/10 bg-[#15171a] px-4 py-3 text-sm">
                <div className="flex items-center gap-2" style={{ color: settings.kineticActiveColor ?? '#ffffff' }}><Activity size={15} /><span>Activation</span></div>
                <span className="text-zinc-600">→</span>
                <div className="flex items-center gap-2" style={{ color: settings.kineticRestColor ?? '#ffffff' }}><Clock3 size={15} /><span>Rest</span></div>
                <span className="text-zinc-600">→</span>
                <div className="flex items-center gap-2" style={{ color: settings.kineticConcentricColor ?? '#ffffff' }}><Zap size={15} /><span>Myo clusters</span></div>
                <div className="ml-auto flex items-center gap-2 text-zinc-400"><Clock3 size={15} /><span>{estimatedDuration} est.</span></div>
                <div className="flex items-center gap-2 border-l border-white/10 pl-4 text-zinc-300">
                    <Mic2 size={15} />
                    <Label htmlFor="kinetic-voice-guidance" className="cursor-pointer text-sm">Voice guidance</Label>
                    <Switch
                        id="kinetic-voice-guidance"
                        checked={settings.ttsEnabled}
                        onCheckedChange={(ttsEnabled) => setSettings({ ttsEnabled })}
                        className="data-[state=unchecked]:bg-[#272c27] data-[state=checked]:[&>span]:bg-[#111412]"
                        style={{ backgroundColor: settings.ttsEnabled ? (settings.kineticThemeColor ?? '#FF5B36') : '#272c27' }}
                    />
                </div>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {controls.map((control) => {
                    const Icon = control.icon;
                    return (
                        <div key={control.key} className={cn('min-h-48 rounded-xl border border-white/10 bg-[#151719] p-5', control.disabled && 'opacity-45')}>
                            <Label htmlFor={`kinetic-${control.key}`} className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
                                <Icon size={14} style={{ color: control.tone }} />
                                {control.label}{control.unit ? ` (${control.unit})` : ''}
                            </Label>
                            <div className="relative mt-10 flex h-16 items-center">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Decrease ${control.label}`}
                                    disabled={control.disabled}
                                    onClick={() => adjustControl(control.key, control.value, -1)}
                                    className="absolute left-0 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-white/10 text-zinc-300 hover:bg-white/15 hover:text-white"
                                >
                                    −
                                </Button>
                                <Input
                                    id={`kinetic-${control.key}`}
                                    type="number"
                                    min={1}
                                    value={control.value}
                                    disabled={control.disabled}
                                    onChange={(event) => {
                                        const value = control.key === 'sets' ? normalizeSetsInput(event.target.value) : event.target.value;
                                        setWorkoutConfig({ [control.key]: value });
                                    }}
                                    className="absolute inset-x-10 h-16 min-w-0 border-0 bg-transparent p-0 text-center text-5xl font-black tabular-nums tracking-[-0.06em] text-white shadow-none outline-none focus-visible:ring-0"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Increase ${control.label}`}
                                    disabled={control.disabled}
                                    onClick={() => adjustControl(control.key, control.value, 1)}
                                    className="absolute right-0 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-white/10 text-zinc-300 hover:bg-white/15 hover:text-white"
                                >
                                    +
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-4 flex flex-col gap-4 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-zinc-500">One cycle pairs your activation effort with timed myo clusters.</p>
                <Button
                    type="button"
                    onClick={() => {
                        audioEngine.init();
                        onStart();
                    }}
                    className="h-12 rounded-lg px-5 text-sm font-bold hover:brightness-110"
                    style={{ backgroundColor: settings.kineticThemeColor ?? '#ffffff', color: getReadableForeground(settings.kineticThemeColor ?? '#ffffff') }}
                >
                    Start workout <ChevronRight size={17} />
                </Button>
            </div>
            <div className="mt-5 flex items-center gap-2 text-xs text-zinc-500"><Volume2 size={14} /> Change audio and display preferences in Settings.</div>
        </section>
    );
};

const getReadableForeground = (color: string): '#111412' | '#ffffff' => {
    const normalized = color.replace('#', '');
    const expanded = normalized.length === 3
        ? normalized.split('').map((part) => `${part}${part}`).join('')
        : normalized;

    if (!/^[\da-f]{6}$/i.test(expanded)) return '#ffffff';

    const luminance = ((parseInt(expanded.slice(0, 2), 16) * 299)
        + (parseInt(expanded.slice(2, 4), 16) * 587)
        + (parseInt(expanded.slice(4, 6), 16) * 114)) / 1000;

    return luminance >= 150 ? '#111412' : '#ffffff';
};

export default KineticWorkoutSetup;
