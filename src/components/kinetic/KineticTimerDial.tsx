import { useShallow } from 'zustand/react/shallow';
import { Check } from 'lucide-react';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { cn } from '@/lib/utils';

interface KineticTimerDialProps {
    outerValue: number;
    outerMax: number;
    innerValue: number;
    innerMax: number;
    textMain: string;
    textSub: string;
    isResting: boolean;
    isFinished: boolean;
    isPreparing: boolean;
    fullScreenForegroundColor?: string;
}

const OUTER_RADIUS = 152;
const INNER_RADIUS = 135;
const OUTER_CIRCUMFERENCE = 2 * Math.PI * OUTER_RADIUS;
const INNER_CIRCUMFERENCE = 2 * Math.PI * INNER_RADIUS;

const KineticTimerDial = ({ outerValue, outerMax, innerValue, innerMax, textMain, textSub, isResting, isFinished, isPreparing, fullScreenForegroundColor }: KineticTimerDialProps) => {
    const settings = useWorkoutStore(useShallow((state) => ({
        upDownMode: state.settings.upDownMode,
        pulseEffect: state.settings.pulseEffect,
        concentricSecond: state.settings.concentricSecond,
        active: state.settings.kineticActiveColor,
        rest: state.settings.kineticRestColor,
        concentric: state.settings.kineticConcentricColor,
        finished: state.settings.kineticFinishedColor,
        theme: state.settings.kineticThemeColor,
        fullScreen: state.settings.fullScreenMode,
    })));
    const isConcentric = !isResting && !isPreparing && !isFinished && innerValue > 0 && innerValue <= settings.concentricSecond;
    const phase = isFinished ? 'Complete' : isPreparing ? 'Get ready' : isResting ? 'Recovery' : isConcentric ? 'Concentric' : 'Eccentric';
    const phaseColor = settings.fullScreen && fullScreenForegroundColor
        ? fullScreenForegroundColor
        : `color-mix(in srgb, ${(isFinished ? settings.finished : isPreparing ? settings.theme : isResting ? settings.rest : isConcentric ? settings.concentric : settings.active) ?? '#ffffff'}, white 55%)`;
    const setColor = settings.fullScreen && fullScreenForegroundColor ? fullScreenForegroundColor : isFinished || isPreparing ? phaseColor : `color-mix(in srgb, ${(isResting ? settings.rest : settings.active) ?? '#ffffff'}, white 55%)`;
    const foreground = settings.fullScreen && fullScreenForegroundColor ? fullScreenForegroundColor : 'var(--kinetic-text)';
    const outerProgress = isFinished ? 1 : Math.max(0, Math.min(1, outerMax > 0 ? outerValue / outerMax : 0));
    const innerProgress = Math.max(0, Math.min(1, innerMax > 0 ? innerValue / innerMax : 0));
    const pulse = settings.pulseEffect === 'always' || (settings.pulseEffect === 'resting' && (isResting || isPreparing || isFinished));

    return (
        <div data-testid="kinetic-timer-dial" role="timer" aria-live="off" aria-label={`${phase}: ${textMain}. ${textSub}`} className="@container relative mx-auto aspect-square w-full max-w-[min(80vw,420px)] sm:max-w-[440px]" style={{ color: foreground }}>
            {!settings.upDownMode && (
                <svg viewBox="0 0 360 360" className="h-full w-full -rotate-90" aria-hidden="true">
                    <circle cx="180" cy="180" r={OUTER_RADIUS} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="6" />
                    <circle cx="180" cy="180" r={OUTER_RADIUS} fill="none" stroke={setColor} strokeWidth="6" strokeLinecap="round" strokeDasharray={OUTER_CIRCUMFERENCE} strokeDashoffset={OUTER_CIRCUMFERENCE * (1 - outerProgress)} />
                    {!isResting && !isFinished && (
                        <>
                            <circle cx="180" cy="180" r={INNER_RADIUS} fill="none" stroke="currentColor" strokeOpacity="0.07" strokeWidth="3" />
                            <circle cx="180" cy="180" r={INNER_RADIUS} fill="none" stroke={phaseColor} strokeWidth="3" strokeLinecap="round" strokeDasharray={INNER_CIRCUMFERENCE} strokeDashoffset={INNER_CIRCUMFERENCE * (1 - innerProgress)} />
                        </>
                    )}
                </svg>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
                {isFinished && <Check size={24} className="mb-3" aria-hidden="true" style={{ color: phaseColor }} />}
                <div className={cn('mb-4 text-sm font-semibold', settings.upDownMode && 'text-[clamp(1.5rem,8cqi,2.5rem)] uppercase tracking-wide', settings.upDownMode && pulse && 'animate-pulse')} style={{ color: phaseColor }}>{phase}</div>
                <div className={cn("font-['Sora'] font-semibold leading-none tracking-[-0.065em] tabular-nums", settings.upDownMode ? 'text-[clamp(2.5rem,14cqi,4rem)]' : 'text-[clamp(2.5rem,20cqi,5.75rem)]')}>{textMain}</div>
                <div className="mt-4 max-w-[240px] text-sm leading-relaxed opacity-75">{textSub}</div>
            </div>
        </div>
    );
};

export default KineticTimerDial;
