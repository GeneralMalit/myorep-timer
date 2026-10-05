import { useMemo } from 'react';
import { Activity, AlertTriangle, ChevronRight, Clock3, RotateCcw, Square, Volume2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { useShallow } from 'zustand/react/shallow';
import { isValidWorkoutConfig, normalizeSetsInput, sanitizeSavedWorkoutConfig } from '@/utils/savedWorkouts';
import { audioEngine } from '@/utils/audioEngine';
import { estimateWorkoutDurationSeconds, formatEstimatedSessionDuration } from '@/utils/savedSessions';
import { getReadableForeground } from '@/utils/colors';

type WorkoutConfigField = 'sets' | 'reps' | 'seconds' | 'rest' | 'myoReps' | 'myoWorkSecs';

interface KineticWorkoutSetupProps {
    onStart: () => void;
}

const KineticWorkoutSetup = ({ onStart }: KineticWorkoutSetupProps) => {
    const {
        settings,
        sets,
        reps,
        seconds,
        rest,
        myoReps,
        myoWorkSecs,
        setWorkoutConfig,
    } = useWorkoutStore(useShallow((state) => ({
        settings: state.settings,
        sets: state.sets,
        reps: state.reps,
        seconds: state.seconds,
        rest: state.rest,
        myoReps: state.myoReps,
        myoWorkSecs: state.myoWorkSecs,
        setWorkoutConfig: state.setWorkoutConfig,
    })));

    const isSingleCycle = normalizeSetsInput(sets) === '1';
    const sanitizedWorkoutConfig = sanitizeSavedWorkoutConfig({ sets, reps, seconds, rest, myoReps, myoWorkSecs });
    const isWorkoutConfigValid = isValidWorkoutConfig(sanitizedWorkoutConfig);
    const missingWorkoutFields = [
        sanitizedWorkoutConfig.sets ? null : 'Total cycles',
        sanitizedWorkoutConfig.reps ? null : 'Activation reps',
        sanitizedWorkoutConfig.seconds ? null : 'Activation pace (sec)',
        isSingleCycle || sanitizedWorkoutConfig.rest ? null : 'Rest interval',
        isSingleCycle || sanitizedWorkoutConfig.myoReps ? null : 'Myo reps',
        isSingleCycle || sanitizedWorkoutConfig.myoWorkSecs ? null : 'Myo pace (sec)',
    ].filter((field): field is string => field !== null);
    const workoutStartHint = isWorkoutConfigValid
        ? null
        : `Enter a whole number of 1 or more for ${missingWorkoutFields.length === 1
            ? missingWorkoutFields[0]
            : `${missingWorkoutFields.slice(0, -1).join(', ')} and ${missingWorkoutFields[missingWorkoutFields.length - 1]}`} to start.`;
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
        disabled?: boolean;
    }> = [
        { key: 'sets', label: 'Total cycles', value: sets, icon: RotateCcw, unit: '' },
        { key: 'reps', label: 'Activation reps', value: reps, icon: Activity, unit: '' },
        { key: 'seconds', label: 'Activation pace', value: seconds, icon: Zap, unit: 'sec' },
        { key: 'rest', label: 'Rest interval', value: rest, icon: Square, unit: 'sec', disabled: isSingleCycle },
        { key: 'myoReps', label: 'Myo reps', value: myoReps, icon: Activity, unit: '', disabled: isSingleCycle },
        { key: 'myoWorkSecs', label: 'Myo pace', value: myoWorkSecs, icon: Zap, unit: 'sec', disabled: isSingleCycle },
    ];

    const adjustControl = (key: WorkoutConfigField, currentValue: string, delta: number) => {
        const current = Number.parseInt(currentValue, 10);
        const nextValue = Math.max(1, (Number.isFinite(current) ? current : 1) + delta);
        setWorkoutConfig({ [key]: String(nextValue) });
    };

    return (
        <section data-testid="kinetic-workout-setup" className="@container mx-auto flex w-full max-w-[1120px] flex-1 flex-col px-4 py-6 sm:px-7 lg:px-10 lg:py-8">
            <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--kinetic-border)] pb-6">
                <div>
                    <div className="console-label mb-2">Training console / Workout</div>
                    <h1 className="console-heading text-3xl sm:text-4xl">Build a workout</h1>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--kinetic-muted)]">Set your activation effort and the Myo-rep cycles that follow.</p>
                </div>
            </header>

            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-[var(--kinetic-border)] bg-[var(--kinetic-panel)] px-4 py-3 text-xs text-[var(--kinetic-muted)]">
                <div className="flex items-center gap-2"><Clock3 size={15} /><span>{settings.prepTime}s preparation</span></div>
                <span aria-hidden="true" className="text-[var(--kinetic-subtle)]">/</span>
                <div className="flex items-center gap-2"><Activity size={15} /><span>Activation</span></div>
                {!isSingleCycle && <><span aria-hidden="true" className="text-[var(--kinetic-subtle)]">→</span><span>Rest + Myo cycles</span></>}
                <div className="ml-auto flex items-center gap-2 font-semibold text-[var(--kinetic-text)]"><Clock3 size={15} /><span>{estimatedDuration} estimated</span></div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 @[344px]:grid-cols-2 @[680px]:grid-cols-3">
                {controls.map((control) => {
                    const Icon = control.icon;
                    return (
                        <div key={control.key} className={cn('console-panel p-3 sm:p-5', control.disabled && 'opacity-50')}>
                            <Label htmlFor={`kinetic-${control.key}`} className="console-label flex items-center gap-2">
                                <Icon size={14} aria-hidden="true" />
                                {control.label}{control.unit ? ` (${control.unit})` : ''}
                            </Label>
                            <div className="mt-4 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-1">
                                <Input
                                    id={`kinetic-${control.key}`}
                                    type="number"
                                    min={1}
                                    value={control.value}
                                    placeholder="—"
                                    disabled={control.disabled}
                                    onChange={(event) => {
                                        const value = control.key === 'sets' ? normalizeSetsInput(event.target.value) : event.target.value;
                                        setWorkoutConfig({ [control.key]: value });
                                    }}
                                    className="console-stepper-input h-14 w-full min-w-0 rounded-lg border-0 bg-[var(--kinetic-panel-inset)] px-1 text-center font-['Sora'] text-3xl font-semibold tabular-nums tracking-tight text-[var(--kinetic-text)] placeholder:text-[var(--kinetic-subtle)] shadow-none focus-visible:ring-2 focus-visible:ring-[var(--kinetic-focus)]"
                                />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Decrease ${control.label}`}
                                        disabled={control.disabled}
                                        onClick={() => adjustControl(control.key, control.value, -1)}
                                        className="console-icon row-start-1 col-start-1"
                                    >
                                        −
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Increase ${control.label}`}
                                        disabled={control.disabled}
                                        onClick={() => adjustControl(control.key, control.value, 1)}
                                        className="console-icon"
                                    >
                                        +
                                    </Button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-6 flex flex-col gap-4 border-t border-[var(--kinetic-border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <p className="max-w-xl text-sm leading-relaxed text-[var(--kinetic-muted)]">{isSingleCycle ? 'One activation set. Rest and Myo settings are not used.' : 'Activation runs once. Remaining cycles alternate rest and short Myo sets.'}</p>
                    {workoutStartHint && (
                        <div
                            role="alert"
                            data-testid="kinetic-workout-start-hint"
                            className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100"
                        >
                            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
                            <span>{workoutStartHint}</span>
                        </div>
                    )}
                </div>
                <Button
                    type="button"
                    disabled={!isWorkoutConfigValid}
                    onClick={() => {
                        audioEngine.init();
                        onStart();
                    }}
                    className="console-button console-button--primary min-h-12 px-6"
                    style={{ backgroundColor: settings.kineticThemeColor ?? '#ffffff', color: getReadableForeground(settings.kineticThemeColor ?? '#ffffff') }}
                >
                    Start workout <ChevronRight size={17} />
                </Button>
            </div>
            <div className="mt-5 flex items-center gap-2 text-xs text-[var(--kinetic-muted)]"><Volume2 size={14} /> Audio, pacing and display controls live in Settings.</div>
        </section>
    );
};


export default KineticWorkoutSetup;
