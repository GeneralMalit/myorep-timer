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
        useWorkoutStore.setState({ designVariant: 'classic' });
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

    it('allows selecting Classic or Kinetic Console and updates the persisted store setting', async () => {
        render(<SettingsPanel isOpen onClose={vi.fn()} />);

        const classic = await screen.findByRole('radio', { name: /classic/i });
        const kinetic = screen.getByRole('radio', { name: /kinetic console/i });

        expect(classic).toBeChecked();
        expect(kinetic).not.toBeChecked();

        fireEvent.click(kinetic);
        expect(kinetic).toBeChecked();
        expect(useWorkoutStore.getState().designVariant).toBe('kinetic');
        expect(screen.getByTestId('settings-drawer-panel')).toHaveClass('bg-[#111412]');

        fireEvent.click(classic);
        expect(classic).toBeChecked();
        expect(useWorkoutStore.getState().designVariant).toBe('classic');
        expect(screen.getByTestId('settings-drawer-panel')).not.toHaveClass('bg-[#111412]');
    });

    it('shows the Kinetic Console visual identity controls and persists each color independently', async () => {
        useWorkoutStore.setState({ designVariant: 'kinetic' });
        useWorkoutStore.setState((state) => ({
            settings: {
                ...state.settings,
                kineticThemeColor: '#ffffff',
                kineticActiveColor: '#ffffff',
                kineticRestColor: '#ffffff',
                kineticConcentricColor: '#ffffff',
                kineticFinishedColor: '#ffffff',
            },
        }));

        render(<SettingsPanel isOpen onClose={vi.fn()} />);

        const colorInputs = {
            theme: await screen.findByLabelText('Theme'),
            active: screen.getByLabelText('Active'),
            resting: screen.getByLabelText('Resting'),
            concentric: screen.getByLabelText('Concentric'),
            finished: screen.getByLabelText('Finished'),
        };

        expect(colorInputs.theme).toHaveValue('#ffffff');
        expect(colorInputs.active).toHaveValue('#ffffff');
        expect(colorInputs.resting).toHaveValue('#ffffff');
        expect(colorInputs.concentric).toHaveValue('#ffffff');
        expect(colorInputs.finished).toHaveValue('#ffffff');

        fireEvent.change(colorInputs.theme, { target: { value: '#102030' } });
        fireEvent.change(colorInputs.active, { target: { value: '#203040' } });
        fireEvent.change(colorInputs.resting, { target: { value: '#304050' } });
        fireEvent.change(colorInputs.concentric, { target: { value: '#405060' } });
        fireEvent.change(colorInputs.finished, { target: { value: '#506070' } });

        expect(useWorkoutStore.getState().settings).toMatchObject({
            kineticThemeColor: '#102030',
            kineticActiveColor: '#203040',
            kineticRestColor: '#304050',
            kineticConcentricColor: '#405060',
            kineticFinishedColor: '#506070',
        });
    });
});
