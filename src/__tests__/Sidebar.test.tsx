import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Sidebar from '@/components/Sidebar';
import { SavedWorkout } from '@/types/savedWorkouts';

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

describe('Sidebar', () => {
    it('renders saved workouts and triggers actions', () => {
        const onSaveCurrent = vi.fn();
        const onLoadWorkout = vi.fn();
        const onRenameWorkout = vi.fn();
        const onDeleteWorkout = vi.fn();
        const onExportWorkouts = vi.fn();

        render(
            <Sidebar
                currentTheme="theme-default"
                setTheme={vi.fn()}
                setShowSettings={vi.fn()}
                showSettings={false}
                isCollapsed={false}
                toggleSidebar={vi.fn()}
                appPhase="setup"
                savedWorkouts={[baseWorkout]}
                onSaveCurrent={onSaveCurrent}
                onLoadWorkout={onLoadWorkout}
                onRenameWorkout={onRenameWorkout}
                onDeleteWorkout={onDeleteWorkout}
                onExportWorkouts={onExportWorkouts}
                onImportWorkouts={vi.fn()}
                importSummary={null}
                clearImportSummary={vi.fn()}
            />,
        );

        expect(screen.getByText('Saved Workouts')).toBeInTheDocument();
        expect(screen.getByText('Push Day')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /save/i }));
        fireEvent.click(screen.getByRole('button', { name: /export/i }));

        const loadButton = screen.getByTitle('Load');
        const renameButton = screen.getByTitle('Rename');
        const deleteButton = screen.getByTitle('Delete');

        fireEvent.click(loadButton);
        fireEvent.click(renameButton);
        fireEvent.click(deleteButton);

        expect(onSaveCurrent).toHaveBeenCalled();
        expect(onExportWorkouts).toHaveBeenCalled();
        expect(onLoadWorkout).toHaveBeenCalledWith('w-1');
        expect(onRenameWorkout).toHaveBeenCalledWith('w-1');
        expect(onDeleteWorkout).toHaveBeenCalledWith('w-1');
    });

    it('disables setup-only actions during timer mode and handles file import', async () => {
        const onImportWorkouts = vi.fn();

        render(
            <Sidebar
                currentTheme="theme-default"
                setTheme={vi.fn()}
                setShowSettings={vi.fn()}
                showSettings={false}
                isCollapsed={false}
                toggleSidebar={vi.fn()}
                appPhase="timer"
                savedWorkouts={[baseWorkout]}
                onSaveCurrent={vi.fn()}
                onLoadWorkout={vi.fn()}
                onRenameWorkout={vi.fn()}
                onDeleteWorkout={vi.fn()}
                onExportWorkouts={vi.fn()}
                onImportWorkouts={onImportWorkouts}
                importSummary={{ imported: 1, renamed: 0, skipped: 0, errors: [] }}
                clearImportSummary={vi.fn()}
            />,
        );

        expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
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

    it('renders collapsed mode and handles invalid import payload', async () => {
        const onImportWorkouts = vi.fn();

        render(
            <Sidebar
                currentTheme="theme-default"
                setTheme={vi.fn()}
                setShowSettings={vi.fn()}
                showSettings={false}
                isCollapsed={true}
                toggleSidebar={vi.fn()}
                appPhase="setup"
                savedWorkouts={[]}
                onSaveCurrent={vi.fn()}
                onLoadWorkout={vi.fn()}
                onRenameWorkout={vi.fn()}
                onDeleteWorkout={vi.fn()}
                onExportWorkouts={vi.fn()}
                onImportWorkouts={onImportWorkouts}
                importSummary={null}
                clearImportSummary={vi.fn()}
            />,
        );

        expect(screen.queryByText('Saved Workouts')).not.toBeInTheDocument();
        const fileInput = document.querySelector('input[type="file"]');
        expect(fileInput).toBeNull();
    });
});

