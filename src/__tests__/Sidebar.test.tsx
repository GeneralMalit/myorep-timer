import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Sidebar from '@/components/Sidebar';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { SavedWorkout } from '@/types/savedWorkouts';
import { SavedSession } from '@/types/savedSessions';

const baseWorkout: SavedWorkout = {
    id: 'w-1',
    name: 'Push Day',
    sets: '3',
    reps: '12',
    seconds: '3',
    rest: '20',
    myoReps: '4',
    myoWorkSecs: '2',
    timesUsed: 2,
    lastUsedAt: '2026-03-01T00:00:00.000Z',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
};

const baseSession: SavedSession = {
    id: 's-1',
    name: 'Push Session',
    nodes: [
        {
            id: 'n-1',
            type: 'workout',
            name: 'Push Set',
            config: {
                sets: '2',
                reps: '10',
                seconds: '3',
                rest: '20',
                myoReps: '4',
                myoWorkSecs: '2',
            },
            sourceWorkoutId: null,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
        },
    ],
    timesUsed: 0,
    lastUsedAt: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
};

const baseProps = {
    currentTheme: 'theme-default',
    setTheme: vi.fn(),
    setShowSettings: vi.fn(),
    onOpenProtocolIntel: vi.fn(),
    showSettings: false,
    isCollapsed: false,
    toggleSidebar: vi.fn(),
    appPhase: 'setup' as const,
    savedWorkouts: [baseWorkout],
    onSaveCurrent: vi.fn(),
    onSaveAsCurrent: vi.fn(),
    onLoadWorkout: vi.fn(),
    onRenameWorkout: vi.fn(),
    onDeleteWorkout: vi.fn(),
    onExportWorkouts: vi.fn(),
    onImportWorkouts: vi.fn(),
    importSummary: null,
    clearImportSummary: vi.fn(),
    savedSessions: [baseSession],
    onCreateSession: vi.fn(),
    onLoadSession: vi.fn(),
    onDuplicateSession: vi.fn(),
    onRenameSession: vi.fn(),
    onDeleteSession: vi.fn(),
};

describe('Sidebar', () => {
    beforeEach(() => {
        useWorkoutStore.setState((state) => ({
            settings: {
                ...state.settings,
                prepTime: 5,
            },
        }));
    });

    it('renders saved workouts and saved sessions and triggers actions', () => {
        render(<Sidebar {...baseProps} />);

        expect(screen.getByText('Saved Workouts')).toBeInTheDocument();
        expect(screen.getByText('Saved Sessions')).toBeInTheDocument();
        expect(screen.getByText('Push Day')).toBeInTheDocument();
        expect(screen.getByText('Push Session')).toBeInTheDocument();
        expect(screen.getByText('1:03')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
        fireEvent.click(screen.getByRole('button', { name: /^save as$/i }));
        fireEvent.click(screen.getByRole('button', { name: /export/i }));

        fireEvent.click(screen.getByTitle('Load'));
        fireEvent.click(screen.getByTitle('Rename'));
        fireEvent.click(screen.getByTitle('Delete'));

        expect(baseProps.onSaveCurrent).toHaveBeenCalled();
        expect(baseProps.onSaveAsCurrent).toHaveBeenCalled();
        expect(baseProps.onExportWorkouts).toHaveBeenCalled();
        expect(baseProps.onLoadWorkout).toHaveBeenCalledWith('w-1');
        expect(baseProps.onRenameWorkout).toHaveBeenCalledWith('w-1');
        expect(baseProps.onDeleteWorkout).toHaveBeenCalledWith('w-1');
    });

    it('disables setup-only actions during timer mode and handles file import', async () => {
        const onImportWorkouts = vi.fn();

        render(
            <Sidebar
                {...baseProps}
                appPhase="timer"
                onImportWorkouts={onImportWorkouts}
                importSummary={{ imported: 1, renamed: 0, skipped: 0, errors: [] }}
                savedSessions={[]}
            />,
        );

        expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /import/i })).toBeDisabled();
        expect(screen.getByTitle('Load')).toBeDisabled();

        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        const file = new File([
            JSON.stringify({ schemaVersion: 1, exportedAt: '2026-01-01T00:00:00.000Z', workouts: [] }),
        ], 'workouts.json', { type: 'application/json' });

        fireEvent.change(fileInput, { target: { files: [file] } });

        await waitFor(() => {
            expect(onImportWorkouts).toHaveBeenCalled();
        });

        expect(screen.getByText(/Imported 1/i)).toBeInTheDocument();
    });

    it('renders collapsed mode', () => {
        render(
            <Sidebar
                {...baseProps}
                isCollapsed
                savedWorkouts={[]}
                savedSessions={[]}
            />,
        );

        expect(screen.queryByText('Saved Workouts')).not.toBeInTheDocument();
        expect(screen.queryByText('Saved Sessions')).not.toBeInTheDocument();
        expect(document.querySelector('input[type="file"]')).toBeNull();
    });
});
