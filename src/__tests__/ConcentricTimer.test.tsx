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
            kineticThemeColor: '#ffffff',
            kineticActiveColor: '#ffffff',
            kineticRestColor: '#ffffff',
            kineticConcentricColor: '#ffffff',
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
            kineticFinishedColor: '#ffffff',
        },
        currentRep: 1,
        currentSet: 1,
        timerStatus: 'Ready',
        designVariant: 'classic',
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

    it('uses the configured Kinetic palette for active, rest, and concentric phases', () => {
        useWorkoutStore.setState((state) => ({
            designVariant: 'kinetic',
            settings: {
                ...state.settings,
                kineticActiveColor: '#123456',
                kineticRestColor: '#654321',
                kineticConcentricColor: '#abcdef',
                concentricSecond: 1,
                fullScreenMode: false,
            },
        }));

        const { container, rerender } = render(
            <ConcentricTimer
                outerValue={5}
                outerMax={5}
                isResting={false}
                innerValue={5}
                innerMax={5}
                textMain="00:05"
                textSub="Activation pace"
                isFinished={false}
                isPreparing={false}
            />,
        );

        const getProgressCircles = () => Array.from(container.querySelectorAll('circle[stroke]')) as SVGCircleElement[];

        expect(getProgressCircles()[0]).toHaveAttribute('stroke', '#123456');
        expect(getProgressCircles()[1]).toHaveAttribute('stroke', '#123456');

        rerender(
            <ConcentricTimer
                outerValue={5}
                outerMax={5}
                isResting
                innerValue={5}
                innerMax={5}
                textMain="00:05"
                textSub="Rest"
                isFinished={false}
                isPreparing={false}
            />,
        );

        expect(getProgressCircles()).toHaveLength(1);
        expect(getProgressCircles()[0]).toHaveAttribute('stroke', '#654321');

        rerender(
            <ConcentricTimer
                outerValue={5}
                outerMax={5}
                isResting={false}
                innerValue={1}
                innerMax={5}
                textMain="00:01"
                textSub="Concentric"
                isFinished={false}
                isPreparing={false}
            />,
        );

        expect(getProgressCircles()[0]).toHaveAttribute('stroke', '#123456');
        expect(getProgressCircles()[1]).toHaveAttribute('stroke', '#abcdef');
    });

    it('uses a readable dark foreground for a light Kinetic fullscreen palette', () => {
        useWorkoutStore.setState((state) => ({
            designVariant: 'kinetic',
            settings: {
                ...state.settings,
                fullScreenMode: true,
                kineticActiveColor: '#f4e1c1',
                kineticRestColor: '#f4e1c1',
                kineticConcentricColor: '#f4e1c1',
            },
        }));

        const { container } = render(
            <ConcentricTimer
                outerValue={5}
                outerMax={5}
                isResting={false}
                innerValue={5}
                innerMax={5}
                textMain="00:05"
                textSub="Activation pace"
                isFinished={false}
                isPreparing={false}
                fullScreenForegroundColor="#0e1012"
            />,
        );

        const progressCircles = Array.from(container.querySelectorAll('circle[stroke]')) as SVGCircleElement[];
        expect(progressCircles[0]).toHaveAttribute('stroke', '#0e1012');
        expect(progressCircles[0]).not.toHaveAttribute('stroke', '#ffffff');
        expect(progressCircles[1]).toHaveAttribute('stroke', '#0e1012');
        expect(container.querySelector('[style*="color"]')).toHaveStyle({ color: '#0e1012' });
    });
});
