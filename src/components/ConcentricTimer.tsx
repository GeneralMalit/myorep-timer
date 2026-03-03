import React from 'react';
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

    // Size Conf
    const size = 450;
    const center = size / 2;
    const strokeWidth = 12;

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
    const outerTransition = settings.smoothAnimation ? 'stroke-dashoffset 0.5s ease-out' : 'none';
    const innerTransition = settings.smoothAnimation ? 'stroke-dashoffset 0.05s linear, stroke 0.3s ease' : 'none';

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
        <div className={cn("relative flex items-center justify-center select-none", upDownMode && "h-64")}>
            {!upDownMode && (
                <svg width={size} height={size} className="transform -rotate-90">
                    {/* Tracks */}
                    <circle
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
                            "text-6xl font-black tracking-tighter transition-all duration-300",
                            shouldPulse && "animate-pulse"
                        )}
                        style={{ color: upDownTextColor }}
                    >
                        {upDownText}
                    </div>
                )}

                {isInfoVisible && (
                    <div className="flex flex-col items-center">
                        <div
                            className="text-8xl font-black tabular-nums transition-colors duration-300"
                            style={{ color: isFullScreen ? '#ffffff' : (isConcentricPhase ? settings.concentricColor : settings.activeColor) }}
                        >
                            {textMain}
                        </div>
                        <div className="text-xl font-medium tracking-wide text-muted-foreground uppercase mt-2">
                            {textSub}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConcentricTimer;
