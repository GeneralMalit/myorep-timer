import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import KineticSessionTimeline from '@/components/kinetic/KineticSessionTimeline';
import type { SavedSession } from '@/types/savedSessions';

const session: SavedSession = {
    id: 'session-1',
    name: 'Long session',
    nodes: Array.from({ length: 24 }, (_, index) => ({
        id: `node-${index + 1}`,
        type: 'rest' as const,
        name: `Block ${index + 1}`,
        seconds: '10',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    })),
    timesUsed: 0,
    lastUsedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('KineticSessionTimeline', () => {
    it('leaves compact timeline scrolling to the timer page', () => {
        render(
            <KineticSessionTimeline
                session={session}
                activeNodeIndex={0}
                timerStatus="Main Set"
                foregroundColor="#f1f3f5"
                mutedColor="#a0a9b7"
                finishedColor="#ffffff"
                themeColor="#ffffff"
            />,
        );

        const timeline = screen.getByRole('list', { name: 'Session progress: Main Set' });
        expect(timeline).not.toHaveClass('max-h-80');
        expect(timeline).not.toHaveClass('overflow-y-auto');
        expect(timeline).toHaveClass('md:max-h-80', 'md:overflow-y-auto');
        expect(screen.getAllByRole('listitem')).toHaveLength(24);
    });
});
