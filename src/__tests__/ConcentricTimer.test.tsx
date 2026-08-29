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
            upDownMode: false,
            infoVisibility: 'always',
            soundMode: 'metronome',
            ttsEnabled: true,
            pulseEffect: 'always',
            finishedColor: '#4caf50',
        },
        currentRep: 1,
    });
};

describe('ConcentricTimer', () => {
    beforeEach(() => {
        resetStore();
    });

    it('updates progress without CSS interpolation at the worker cadence', async () => {
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
        expect(outerProgressCircle.style.transition).toBe('none');

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

        expect(outerProgressCircle.style.transition).toBe('none');

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
        expect(nextOuterProgressCircle).not.toBe(outerProgressCircle);
        expect(nextOuterProgressCircle.style.transition).toBe('none');
    });

    it('does not interpolate a stepped update when fluid animation is disabled', () => {
        useWorkoutStore.setState((state) => ({
            settings: { ...state.settings, smoothAnimation: false },
        }));

        const { container } = render(
            <ConcentricTimer
                outerValue={4}
                outerMax={5}
                isResting={false}
                innerValue={4}
                innerMax={5}
                textMain="00:04"
                textSub="Workout"
                isFinished={false}
                isPreparing={false}
            />,
        );

        const [outerProgressCircle, innerProgressCircle] = container.querySelectorAll('circle[stroke-dasharray]') as unknown as SVGCircleElement[];
        expect(outerProgressCircle.style.transition).toBe('none');
        expect(innerProgressCircle.style.transition).toBe('none');
    });

    it('can keep the kinetic readout visible when global timer info is hidden', () => {
        useWorkoutStore.setState((state) => ({
            settings: { ...state.settings, infoVisibility: 'never' },
        }));

        const { getByText } = render(
            <ConcentricTimer
                outerValue={4}
                outerMax={5}
                isResting={false}
                innerValue={4}
                innerMax={5}
                textMain="00:04"
                textSub="Activation pace"
                isFinished={false}
                isPreparing={false}
                forceInfoVisible
            />,
        );

        expect(getByText('00:04')).toBeInTheDocument();
        expect(getByText('Activation pace')).toBeInTheDocument();
    });
});
