import React, { useEffect, useMemo, useState } from 'react';
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
    forceInfoVisible?: boolean;
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
    isPreparing,
    forceInfoVisible = false,
}) => {
    const settings = useWorkoutStore((state: any) => state.settings);
    const currentRep = useWorkoutStore((state: any) => state.currentRep);
    const currentSet = useWorkoutStore((state: any) => state.currentSet);
    const activeSessionId = useWorkoutStore((state: any) => state.activeSessionId);
    const activeSessionNodeIndex = useWorkoutStore((state: any) => state.activeSessionNodeIndex);
    const timerStatus = useWorkoutStore((state: any) => state.timerStatus);
    const isMobileViewport = useMobileViewport();
    const layout = getResponsiveLayout(isMobileViewport, concentricTimerMobileLayout, concentricTimerDesktopLayout);

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

    const isFullScreen = settings.fullScreenMode;
    const isConcentricPhase = !isResting && innerValue <= settings.concentricSecond && innerValue > 0 && !isPreparing && !isFinished;
    const visualPhase = isFullScreen
        ? 'full-screen'
        : (isPreparing ? 'preparing' : (isFinished ? 'finished' : (isResting ? 'resting' : (isConcentricPhase ? 'concentric' : 'eccentric'))));
    const phaseColors = useMemo(() => {
        if (isFullScreen) {
            return {
                outer: '#ffffff',
                inner: '#ffffff',
                text: '#ffffff',
            };
        }

        const activeColor = settings.activeColor;
        const isConcentric = visualPhase === 'concentric';
        return {
            outer: visualPhase === 'resting' ? settings.restColor : activeColor,
            inner: isConcentric ? settings.concentricColor : activeColor,
            text: isConcentric ? settings.concentricColor : activeColor,
        };
    }, [isFullScreen, settings.activeColor, settings.concentricColor, settings.restColor, visualPhase]);
    // Smooth mode gets its motion from the 50ms worker cadence. CSS transitions
    // are intentionally disabled in both modes so a new interval never animates
    // from the prior ring state back to full.
    const progressStyle = { transition: 'none' };
    const intervalKey = [
        isPreparing ? 'preparing' : (isFinished ? 'finished' : (isResting ? 'resting' : 'working')),
        timerStatus,
        activeSessionId ?? 'standalone',
        activeSessionNodeIndex,
        currentSet,
        outerMax,
    ].join(':');

    const upDownMode = settings.upDownMode;
    const isInfoVisible = forceInfoVisible || settings.infoVisibility === 'always' || (settings.infoVisibility === 'resting' && isResting);

    // Up/Down Text
    let upDownText = '';
    let upDownTextColor = phaseColors.outer;

    if (isFinished) {
        upDownText = 'DONE';
    } else if (isPreparing) {
        upDownText = 'READY';
    } else if (isResting) {
        upDownText = 'REST';
    } else {
        if (isConcentricPhase) {
            upDownText = 'CONCENTRIC';
            upDownTextColor = phaseColors.text;
        } else {
            upDownText = 'ECCENTRIC';
            upDownTextColor = phaseColors.text;
        }
    }

    const upDownTextStyle = useMemo(() => ({ color: upDownTextColor }), [upDownTextColor]);
    const mainTextStyle = useMemo(() => ({ color: phaseColors.text }), [phaseColors.text]);

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
                        key={`outer-track-${intervalKey}`}
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
                        key={`outer-progress-${intervalKey}`}
                        cx={center}
                        cy={center}
                        r={outerRadius}
                        stroke={phaseColors.outer}
                        strokeWidth={strokeWidth}
                        fill="none"
                        strokeDasharray={outerCircumference}
                        strokeDashoffset={outerDashoffset}
                        strokeLinecap="round"
                        style={progressStyle}
                    />
                    {!isResting && !isFinished && (
                        <circle
                            key={`inner-progress-${intervalKey}-${currentRep}`}
                            cx={center}
                            cy={center}
                            r={innerRadius}
                            stroke={phaseColors.inner}
                            strokeWidth={strokeWidth}
                            fill="none"
                            strokeDasharray={innerCircumference}
                            strokeDashoffset={innerDashoffset}
                            strokeLinecap="round"
                            style={progressStyle}
                        />
                    )}
                </svg>
            )}

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                {upDownMode && (
                    <div
                        className={cn(layout.upDownText, shouldPulse && 'animate-pulse')}
                        style={upDownTextStyle}
                    >
                        {upDownText}
                    </div>
                )}

                {isInfoVisible && (
                    <div className={layout.infoWrap}>
                        <div
                            className="text-[clamp(3rem,15vw,6rem)] font-black tabular-nums leading-none transition-colors duration-300"
                            style={mainTextStyle}
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
