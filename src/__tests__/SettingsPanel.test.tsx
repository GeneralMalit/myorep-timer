import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SettingsPanel from '@/components/SettingsPanel';
import { useWorkoutStore } from '@/store/useWorkoutStore';

vi.mock('@/utils/audioEngine', () => ({
    audioEngine: {
        init: vi.fn(),
        speak: vi.fn(),
    },
}));

describe('SettingsPanel', () => {
    beforeEach(() => {
        useWorkoutStore.setState({
            settings: {
                ...useWorkoutStore.getState().settings,
                activeColor: '#bb86fc',
                restColor: '#03dac6',
                concentricColor: '#cf6679',
                concentricSecond: 1,
                prepTime: 5,
                smoothAnimation: true,
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
            seconds: '3',
            myoWorkSecs: '2',
        });
    });

    it('keeps the drawer mounted and animates visibility with overlay and panel classes', () => {
        const onClose = vi.fn();
        const { rerender } = render(<SettingsPanel isOpen={false} onClose={onClose} />);

        expect(screen.getByTestId('settings-drawer-overlay')).toHaveClass('pointer-events-none', 'opacity-0');
        expect(screen.getByTestId('settings-drawer-panel')).toHaveClass('translate-x-[calc(100%+1rem)]');

        rerender(<SettingsPanel isOpen onClose={onClose} />);

        expect(screen.getByTestId('settings-drawer-overlay')).toHaveClass('opacity-100');
        expect(screen.getByTestId('settings-drawer-panel')).toHaveClass('translate-x-0');
        expect(screen.getByText(/system configuration/i)).toBeInTheDocument();
    });

    it('closes from the backdrop and close button while open', () => {
        const onClose = vi.fn();
        render(<SettingsPanel isOpen onClose={onClose} />);

        fireEvent.pointerDown(screen.getByTestId('settings-drawer-overlay'));
        fireEvent.click(screen.getByRole('button', { name: /close settings/i }));

        expect(onClose).toHaveBeenCalledTimes(2);
    });
});
