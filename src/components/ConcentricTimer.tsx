import React, { useEffect, useRef, useState } from 'react';
import { getResponsiveLayout } from '@/layout';
import { concentricTimerDesktopLayout } from '@/layout/concentricTimer.desktop';
import { concentricTimerMobileLayout } from '@/layout/concentricTimer.mobile';
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
    const isMobileViewport = useMobileViewport();
    const phaseKey = isPreparing ? 'preparing' : (isFinished ? 'finished' : (isResting ? 'resting' : 'working'));
    const hasMountedRef = useRef(false);
    const lastPhaseKeyRef = useRef(phaseKey);
    const layout = getResponsiveLayout(isMobileViewport, concentricTimerMobileLayout, concentricTimerDesktopLayout);

    useEffect(() => {
        hasMountedRef.current = true;
        lastPhaseKeyRef.current = phaseKey;
    }, [phaseKey]);

    // Size Conf
    const size = layout.size;
    const center = size / 2;
    const strokeWidth = layout.strokeWidth;

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
                layout.shell,
                upDownMode && layout.shellWithUpDown,
            )}
        >
            {!upDownMode && (
                <svg
                    viewBox={`0 0 ${size} ${size}`}
                    className={layout.svg}
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
                        className={cn(layout.upDownText, shouldPulse && 'animate-pulse')}
                        style={{ color: upDownTextColor }}
                    >
                        {upDownText}
                    </div>
                )}

                {isInfoVisible && (
                    <div className={layout.infoWrap}>
                        <div
                            className="text-[clamp(3rem,15vw,6rem)] font-black tabular-nums leading-none transition-colors duration-300"
                            style={{ color: isFullScreen ? '#ffffff' : (isConcentricPhase ? settings.concentricColor : settings.activeColor) }}
                        >
                            {textMain}
                        </div>
                        <div className={layout.subText}>
                            {textSub}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

function useMobileViewport() {
    const [isMobileViewport, setIsMobileViewport] = useState(false);

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

    return isMobileViewport;
}

export default ConcentricTimer;
