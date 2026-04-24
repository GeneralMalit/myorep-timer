import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SettingsPanel from '@/components/SettingsPanel';
import { useWorkoutStore } from '@/store/useWorkoutStore';

const setMobileViewport = (matches: boolean) => {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: () => ({
            matches,
            media: '(max-width: 767px)',
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        }),
    });
};

describe('SettingsPanel', () => {
    beforeEach(() => {
        setMobileViewport(false);
        useWorkoutStore.setState((state) => ({
            settings: {
                ...state.settings,
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
        }));
    });

    it('opens with a lightweight shell first and then mounts the settings sections', async () => {
        const onClose = vi.fn();

        render(<SettingsPanel isOpen onClose={onClose} />);

        expect(screen.getByText(/system configuration/i)).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByText(/visual identity/i)).toBeInTheDocument();
            expect(screen.getByText(/sound architecture/i)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /close settings/i }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
