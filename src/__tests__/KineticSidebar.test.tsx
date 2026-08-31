import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import KineticSidebar from '@/components/kinetic/KineticSidebar';

const baseProps = {
    currentTheme: 'theme-default',
    setTheme: vi.fn(),
    setShowSettings: vi.fn(),
    onOpenProtocolIntel: vi.fn(),
    showSettings: false,
    isCollapsed: false,
    toggleSidebar: vi.fn(),
    appPhase: 'setup' as const,
    savedWorkouts: [],
    onSaveCurrent: vi.fn(),
    onSaveAsCurrent: vi.fn(),
    onLoadWorkout: vi.fn(),
    onRenameWorkout: vi.fn(),
    onDeleteWorkout: vi.fn(),
    onExportLibrary: vi.fn(),
    onImportLibrary: vi.fn(),
    importSummary: null,
    clearImportSummary: vi.fn(),
    savedSessions: [],
    onCreateSession: vi.fn(),
    onLoadSession: vi.fn(),
    onDuplicateSession: vi.fn(),
    onRenameSession: vi.fn(),
    onDeleteSession: vi.fn(),
};

describe('KineticSidebar', () => {
    it('does not render the Classic theme selector in the Kinetic Console rail', () => {
        render(<KineticSidebar {...baseProps} />);

        expect(screen.getByTestId('kinetic-sidebar')).toBeInTheDocument();
        expect(screen.queryByText('Themes')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /deep purple|ocean blue|crimson fire|neon forest/i })).not.toBeInTheDocument();
    });
});
