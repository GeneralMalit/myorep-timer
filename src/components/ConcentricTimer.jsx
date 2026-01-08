import React from 'react';
import './ConcentricTimer.css';

const ConcentricTimer = ({
    outerValue,
    outerMax,
    isResting,
    innerValue,
    innerMax,
    settings,
    smoothAnimation,
    currentRep, // Need this for key
    textMain,
    textSub
}) => {

    // Size Conf
    const size = 450;
    const center = size / 2;
    const strokeWidth = 12; // Thicker lines

    // Radii
    const outerRadius = (size / 2) - 30;
    const innerRadius = (size / 2) - 70;

    const outerCircumference = 2 * Math.PI * outerRadius;
    const innerCircumference = 2 * Math.PI * innerRadius;

    // Outer Progress (Reps Remaining or Rest Time)
    const safeOuterMax = outerMax > 0 ? outerMax : 1;
    const outerProgress = outerValue / safeOuterMax;
    const clampedOuterProgress = Math.max(0, Math.min(1, outerProgress));
    const outerDashoffset = outerCircumference - (clampedOuterProgress * outerCircumference);

    // Inner Progress (Rep Timer)
    const safeInnerMax = innerMax > 0 ? innerMax : 1;
    const innerProgress = innerValue / safeInnerMax;
    const clampedInnerProgress = Math.max(0, Math.min(1, innerProgress));
    const innerDashoffset = innerCircumference - (clampedInnerProgress * innerCircumference);

    // Colors
    const isFullScreen = settings.fullScreenMode;
    const outerColor = isFullScreen ? '#ffffff' : (isResting ? settings.restColor : settings.activeColor);

    // Critical Rep Logic (Last Second)
    const isCritical = !isResting && innerValue <= settings.lastSecondThreshold && innerValue > 0;
    let innerColor;
    if (isFullScreen) {
        innerColor = '#ffffff';
    } else {
        innerColor = isCritical ? settings.criticalRepColor : settings.activeColor;
    }

    // Transition Logic
    // Since the component is remounted on Rep Change (via key), we don't need "reset" logic.
    // The new component starts Fresh (Full) with no transition history.
    // We just need smooth transition for the countdown.

    const outerTransition = smoothAnimation
        ? 'stroke-dashoffset 0.5s ease-out'
        : 'none';

    const innerTransition = smoothAnimation
        ? 'stroke-dashoffset 0.05s linear, stroke 0.3s ease'
        : 'none';

    return (
        <div className="concentric-timer-wrapper">
            <svg width={size} height={size} className="concentric-timer-svg">
                {/* Background Tracks */}
                <circle
                    cx={center}
                    cy={center}
                    r={outerRadius}
                    stroke="#333"
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                {!isResting && (
                    <circle
                        cx={center}
                        cy={center}
                        r={innerRadius}
                        stroke="#333"
                        strokeWidth={strokeWidth}
                        fill="none"
                    />
                )}

                {/* Progress Circles */}
                {/* Outer Circle */}
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
                    transform={`rotate(-90 ${center} ${center})`}
                />

                {/* Inner Circle (Hidden during rest) */}
                {!isResting && (
                    <circle
                        key={currentRep} /* Forces instant remount on new rep */
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
                        transform={`rotate(-90 ${center} ${center})`}
                    />
                )}
            </svg>

            <div className="timer-text-overlay">
                <div className="main-time" style={{ color: isFullScreen ? '#ffffff' : settings.activeColor }}>
                    {textMain}
                </div>
                <div className="sub-text">
                    {textSub}
                </div>
            </div>
        </div>
    );
};

export default ConcentricTimer;
