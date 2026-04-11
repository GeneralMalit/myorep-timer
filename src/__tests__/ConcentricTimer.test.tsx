import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import ConcentricTimer from '@/components/ConcentricTimer';
import { useWorkoutStore } from '@/store/useWorkoutStore';

const resetStore = () => {
    useWorkoutStore.setState({
        settings: {
            activeColor: '#bb86fc',
            restColor: '#03dac6',
            concentricColor: '#cf6679',
            concentricSecond: 1,
            smoothAnimation: true,
            prepTime: 5,
            fullScreenMode: false,
            metronomeEnabled: true,
            metronomeSound: 'woodblock',
            floatingWindow: false,
            upDownMode: false,
            infoVisibility: 'always',
            soundMode: 'metronome',
            ttsEnabled: true,
            pulseEffect: 'always',
            finishedColor: '#4caf50',
            pipShowInfo: true,
        },
        currentRep: 1,
    });
};

describe('ConcentricTimer', () => {
    beforeEach(() => {
        resetStore();
    });

    it('does not animate progress from zero on first mount or across phase changes', async () => {
        const { container, rerender } = render(
            <ConcentricTimer
                outerValue={5}
                outerMax={5}
                isResting={false}
                innerValue={5}
                innerMax={5}
                textMain="00:05"
                textSub="Get Ready"
                isFinished={false}
                isPreparing={true}
            />,
        );

        const outerProgressCircle = container.querySelectorAll('circle[stroke-dasharray]')[0] as SVGCircleElement;
        expect(outerProgressCircle).toHaveStyle({ transition: 'none' });

        await act(async () => {});

        rerender(
            <ConcentricTimer
                outerValue={4}
                outerMax={5}
                isResting={false}
                innerValue={4}
                innerMax={5}
                textMain="00:04"
                textSub="Get Ready"
                isFinished={false}
                isPreparing={true}
            />,
        );

        expect(outerProgressCircle).toHaveStyle({ transition: 'stroke-dashoffset 0.05s linear' });

        rerender(
            <ConcentricTimer
                outerValue={10}
                outerMax={10}
                isResting={false}
                innerValue={10}
                innerMax={10}
                textMain="00:10"
                textSub="Workout"
                isFinished={false}
                isPreparing={false}
            />,
        );

        const nextOuterProgressCircle = container.querySelectorAll('circle[stroke-dasharray]')[0] as SVGCircleElement;
        expect(nextOuterProgressCircle).toHaveStyle({ transition: 'none' });
    });
});
