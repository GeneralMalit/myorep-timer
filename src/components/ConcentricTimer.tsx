import React, { useEffect, useRef, useState } from 'react';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { cn } from '@/lib/utils';

interface ConcentricTimerProps {
    outerValue: number;
    outerMax: number;
    isResting: boolean;
    innerValue: number;
    innerMax: number;
    textMain: string;
    textSub: string;
    isFinished: boolean;
    isPreparing: boolean;
}

const ConcentricTimer: React.FC<ConcentricTimerProps> = ({
    outerValue,
    outerMax,
    isResting,
    innerValue,
    innerMax,
    textMain,
    textSub,
    isFinished,
    isPreparing
}) => {
    const settings = useWorkoutStore((state: any) => state.settings);
    const currentRep = useWorkoutStore((state: any) => state.currentRep);
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const phaseKey = isPreparing ? 'preparing' : (isFinished ? 'finished' : (isResting ? 'resting' : 'working'));
    const hasMountedRef = useRef(false);
    const lastPhaseKeyRef = useRef(phaseKey);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return;
        }

        const mediaQuery = window.matchMedia('(max-width: 767px)');
        const handleViewportChange = (event: MediaQueryListEvent | MediaQueryList) => {
            setIsMobileViewport(event.matches);
        };

        handleViewportChange(mediaQuery);
        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handleViewportChange);
            return () => mediaQuery.removeEventListener('change', handleViewportChange);
        }

        mediaQuery.addListener(handleViewportChange);
        return () => mediaQuery.removeListener(handleViewportChange);
    }, []);

    useEffect(() => {
        hasMountedRef.current = true;
        lastPhaseKeyRef.current = phaseKey;
    }, [phaseKey]);

    // Size Conf
    const size = isMobileViewport ? 360 : 450;
    const center = size / 2;
    const strokeWidth = isMobileViewport ? 10 : 12;

    // Radii
    const outerRadius = (size / 2) - 30;
    const innerRadius = (size / 2) - 70;

    const outerCircumference = 2 * Math.PI * outerRadius;
    const innerCircumference = 2 * Math.PI * innerRadius;

    // Outer Progress
    const safeOuterMax = outerMax > 0 ? outerMax : 1;
    const outerProgress = outerValue / safeOuterMax;
    const clampedOuterProgress = Math.max(0, Math.min(1, outerProgress));
    const outerDashoffset = outerCircumference - (clampedOuterProgress * outerCircumference);

    // Inner Progress
    const safeInnerMax = innerMax > 0 ? innerMax : 1;
    const innerProgress = innerValue / safeInnerMax;
    const clampedInnerProgress = Math.max(0, Math.min(1, innerProgress));
    const innerDashoffset = innerCircumference - (clampedInnerProgress * innerCircumference);

    // Colors
    const isFullScreen = settings.fullScreenMode;
    const outerColor = isFullScreen ? '#ffffff' : (isResting ? settings.restColor : settings.activeColor);

    const isConcentricPhase = !isResting && innerValue <= settings.concentricSecond && innerValue > 0 && !isPreparing && !isFinished;

    let innerColor;
    if (isFullScreen) {
        innerColor = '#ffffff';
    } else {
        innerColor = isConcentricPhase ? settings.concentricColor : settings.activeColor;
    }

    // Transitions
    const animateProgress = hasMountedRef.current && settings.smoothAnimation && lastPhaseKeyRef.current === phaseKey;
    const outerTransition = animateProgress ? 'stroke-dashoffset 0.05s linear' : 'none';
    const innerTransition = animateProgress ? 'stroke-dashoffset 0.05s linear, stroke 0.3s ease' : 'none';

    const upDownMode = settings.upDownMode;
    const isInfoVisible = settings.infoVisibility === 'always' || (settings.infoVisibility === 'resting' && isResting);

    // Up/Down Text
    let upDownText = '';
    let upDownTextColor = isFullScreen ? '#ffffff' : (isResting ? settings.restColor : settings.activeColor);

    if (isFinished) {
        upDownText = 'DONE';
    } else if (isPreparing) {
        upDownText = 'READY';
    } else if (isResting) {
        upDownText = 'REST';
    } else {
        if (isConcentricPhase) {
            upDownText = 'CONCENTRIC';
            upDownTextColor = isFullScreen ? '#ffffff' : settings.concentricColor;
        } else {
            upDownText = 'ECCENTRIC';
            upDownTextColor = isFullScreen ? '#ffffff' : settings.activeColor;
        }
    }

    const shouldPulse = settings.pulseEffect === 'always' || (settings.pulseEffect === 'resting' && (isResting || isPreparing || isFinished));

    return (
        <div
            className={cn(
                "relative mx-auto flex w-full items-center justify-center px-1 select-none sm:px-4",
                isMobileViewport ? "max-w-[22rem]" : "max-w-[28rem]",
                upDownMode && (isMobileViewport ? "min-h-[11rem]" : "min-h-[16rem]")
            )}
        >
            {!upDownMode && (
                <svg
                    viewBox={`0 0 ${size} ${size}`}
                    className={cn(
                        "aspect-square w-full transform -rotate-90 overflow-visible",
                        isMobileViewport ? "max-w-[22rem]" : "max-w-[28rem]",
                    )}
                    aria-hidden="true"
                >
                    {/* Tracks */}
                    <circle
                        key={phaseKey}
                        cx={center}
                        cy={center}
                        r={outerRadius}
                        className="stroke-muted/20"
                        strokeWidth={strokeWidth}
                        fill="none"
                    />
                    {!isResting && !isFinished && (
                        <circle
                            cx={center}
                            cy={center}
                            r={innerRadius}
                            className="stroke-muted/20"
                            strokeWidth={strokeWidth}
                            fill="none"
                        />
                    )}

                    {/* Progress */}
                    <circle
                        cx={center}
                        cy={center}
                        r={outerRadius}
                        stroke={outerColor}
                        strokeWidth={strokeWidth}
                        fill="none"
                        strokeDasharray={outerCircumference}
                        strokeDashoffset={outerDashoffset}
                        strokeLinecap="round"
                        style={{ transition: outerTransition }}
                    />
                    {!isResting && !isFinished && (
                        <circle
                            key={currentRep}
                            cx={center}
                            cy={center}
                            r={innerRadius}
                            stroke={innerColor}
                            strokeWidth={strokeWidth}
                            fill="none"
                            strokeDasharray={innerCircumference}
                            strokeDashoffset={innerDashoffset}
                            strokeLinecap="round"
                            style={{ transition: innerTransition }}
                        />
                    )}
                </svg>
            )}

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                {upDownMode && (
                    <div
                        className={cn(
                            isMobileViewport
                                ? "px-3 text-3xl font-black tracking-tighter transition-all duration-300"
                                : "px-4 text-4xl font-black tracking-tighter transition-all duration-300 sm:text-6xl",
                            shouldPulse && "animate-pulse"
                        )}
                        style={{ color: upDownTextColor }}
                    >
                        {upDownText}
                    </div>
                )}

                {isInfoVisible && (
                    <div className={cn("flex max-w-full flex-col items-center", isMobileViewport ? "px-3" : "px-5 sm:px-8")}>
                        <div
                            className="text-[clamp(3rem,15vw,6rem)] font-black tabular-nums leading-none transition-colors duration-300"
                            style={{ color: isFullScreen ? '#ffffff' : (isConcentricPhase ? settings.concentricColor : settings.activeColor) }}
                        >
                            {textMain}
                        </div>
                        <div className={cn(
                            "mt-2 font-medium uppercase text-muted-foreground",
                            isMobileViewport
                                ? "max-w-[16rem] text-xs tracking-[0.18em]"
                                : "max-w-[18rem] text-sm tracking-[0.22em] sm:max-w-none sm:text-xl sm:tracking-wide",
                        )}>
                            {textSub}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConcentricTimer;
