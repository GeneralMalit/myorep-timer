import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import App from '@/App';
import { useAccountStore } from '@/store/useAccountStore';
import { useWorkoutStore } from '@/store/useWorkoutStore';

const renderCounters = vi.hoisted(() => ({
    sidebar: vi.fn(),
    settings: vi.fn(),
    timer: vi.fn(),
}));

vi.mock('@/components/Sidebar', () => ({
    default: () => {
        renderCounters.sidebar();
        return <aside data-testid="perf-sidebar" />;
    },
}));

vi.mock('@/components/SettingsPanel', () => ({
    default: ({ isOpen }: { isOpen: boolean }) => {
        renderCounters.settings();
        return isOpen ? <div data-testid="perf-settings" /> : null;
    },
}));

vi.mock('@/components/ProtocolIntelModal', () => ({
    default: () => null,
}));

vi.mock('@/components/SessionBuilder', () => ({
    default: () => null,
}));

vi.mock('@/components/SupabaseBootstrap', () => ({
    default: () => null,
}));

vi.mock('@/components/ConcentricTimer', () => ({
    default: () => {
        renderCounters.timer();
        return <div data-testid="perf-timer" />;
    },
}));

vi.mock('@/utils/audioEngine', () => ({
    audioEngine: {
        init: vi.fn(),
        speak: vi.fn(),
        playTick: vi.fn(),
        scheduleTickSequence: vi.fn(),
        cancelScheduledTicks: vi.fn(),
        cancelSpeech: vi.fn(),
    },
}));

const setDesktopViewport = () => {
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: () => ({
            matches: false,
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

describe('App timer render isolation', () => {
    beforeEach(() => {
        renderCounters.sidebar.mockClear();
        renderCounters.settings.mockClear();
        renderCounters.timer.mockClear();
        setDesktopViewport();
        window.history.replaceState({}, '', 'http://localhost:3000/');

        useWorkoutStore.setState({
            appPhase: 'timer',
            timerStatus: 'Main Set',
            isTimerRunning: false,
            currentSet: 1,
            currentRep: 1,
            isMainRep: true,
            isWorking: true,
            timeLeft: 10,
            setTotalDuration: 30,
            setElapsedTime: 0,
            sets: '2',
            reps: '10',
            seconds: '3',
            rest: '20',
            myoReps: '4',
            myoWorkSecs: '2',
            showSettings: true,
            savedWorkouts: [],
            savedSessions: [],
            selectedSavedWorkoutId: null,
            selectedSavedSessionId: null,
            activeSessionId: null,
            activeSessionNodeIndex: 0,
            sessionStatus: 'idle',
            isRunningSession: false,
            sessionNodeRuntimeType: null,
            settings: {
                ...useWorkoutStore.getState().settings,
                ttsEnabled: false,
                metronomeEnabled: false,
            },
        });

        useAccountStore.getState().clearAccountState();
        useAccountStore.setState({
            bootstrapStatus: 'idle',
            mode: 'guest',
            session: null,
            profile: null,
            entitlement: null,
            syncStatus: 'disabled',
            error: null,
            requiresPasswordReset: false,
        });
    });

    it('keeps sidebar and settings render counts stable across timer-only updates', async () => {
        render(<App />);

        await screen.findByTestId('perf-settings');
        const sidebarRendersBeforeTicks = renderCounters.sidebar.mock.calls.length;
        const settingsRendersBeforeTicks = renderCounters.settings.mock.calls.length;
        const timerRendersBeforeTicks = renderCounters.timer.mock.calls.length;

        act(() => {
            for (let tick = 1; tick <= 20; tick += 1) {
                useWorkoutStore.setState({
                    timeLeft: 10 - (tick * 0.05),
                    setElapsedTime: tick * 0.05,
                });
            }
        });

        expect(renderCounters.timer.mock.calls.length).toBeGreaterThan(timerRendersBeforeTicks);
        expect(renderCounters.sidebar).toHaveBeenCalledTimes(sidebarRendersBeforeTicks);
        expect(renderCounters.settings).toHaveBeenCalledTimes(settingsRendersBeforeTicks);
    });
});
