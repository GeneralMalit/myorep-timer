import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KineticSessionBuilder from '@/components/kinetic/KineticSessionBuilder';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import type { SavedSession, RestSessionNode, WorkoutSessionNode } from '@/types/savedSessions';

const originalMatchMedia = window.matchMedia;

const mockCompactViewport = (matches: boolean) => {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: vi.fn().mockImplementation((media: string) => ({
            matches: media === '(max-width: 1023px)' && matches,
            media,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
};
const workoutConfig = {
    sets: '3',
    reps: '15',
    seconds: '2',
    rest: '20',
    myoReps: '5',
    myoWorkSecs: '2',
};

const createWorkoutNode = (
    overrides: Partial<WorkoutSessionNode> = {},
): WorkoutSessionNode => ({
    id: 'workout-node',
    type: 'workout',
    name: 'Workout 1',
    config: { ...workoutConfig },
    sourceWorkoutId: null,
    notes: '',
    completedSessionsSinceProgression: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
});

const createRestNode = (overrides: Partial<RestSessionNode> = {}): RestSessionNode => ({
    id: 'rest-node',
    type: 'rest',
    name: 'Rest 1',
    seconds: '60',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
});

const createSession = (nodes: SavedSession['nodes']): SavedSession => ({
    id: 'session-1',
    name: 'Leg Session',
    nodes,
    timesUsed: 0,
    lastUsedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
});

const resetStore = () => {
    const state = useWorkoutStore.getState();
    useWorkoutStore.setState({
        settings: {
            ...state.settings,
            progressionReminderThreshold: 3,
        },
        appPhase: 'setup',
        timerStatus: 'Ready',
        isTimerRunning: false,
        savedWorkouts: [],
        selectedSavedWorkoutId: null,
        savedSessions: [],
        selectedSavedSessionId: null,
        setupMode: 'session',
        editingSessionId: null,
        editingSessionDraft: null,
        editingSessionNodeId: null,
        activeSessionId: null,
        activeSessionNodeIndex: 0,
        sessionStatus: 'idle',
        isRunningSession: false,
        sessionNodeRuntimeType: null,
        sessionRestTimeLeft: 0,
        sessionLastTickSecond: -1,
    });
};

describe('KineticSessionBuilder', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resetStore();
        HTMLElement.prototype.scrollIntoView = vi.fn();
        mockCompactViewport(false);
    });

    afterEach(() => {
        vi.useRealTimers();
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            writable: true,
            value: originalMatchMedia,
        });
    });

    it('keeps the session name in the action row and adds valid default blocks at the timeline end', () => {
        render(<KineticSessionBuilder />);

        expect(screen.getAllByLabelText('Session name')).toHaveLength(1);
        expect(screen.queryByLabelText('Add saved workout')).not.toBeInTheDocument();
        expect(screen.getByTestId('kinetic-timeline-add-controls')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Add workout' }));

        let draft = useWorkoutStore.getState().editingSessionDraft;
        expect(draft?.nodes).toHaveLength(1);
        const workout = draft?.nodes[0];
        expect(workout).toMatchObject({
            type: 'workout',
            name: 'Workout 1',
            sourceWorkoutId: null,
            config: workoutConfig,
            completedSessionsSinceProgression: 0,
        });
        expect(useWorkoutStore.getState().editingSessionNodeId).toBe(workout?.id);
        expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Add rest' }));
        draft = useWorkoutStore.getState().editingSessionDraft;
        expect(draft?.nodes).toHaveLength(2);
        expect(draft?.nodes[1]).toMatchObject({ type: 'rest', seconds: '60' });
    });

    it('opens a compact editor sheet and preserves selection when dismissed', () => {
        mockCompactViewport(true);
        render(<KineticSessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: 'Add workout' }));
        const selectedNodeId = useWorkoutStore.getState().editingSessionNodeId;
        const editor = screen.getByRole('dialog', { name: 'Block settings' });
        expect(editor).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close block settings' })).toHaveFocus();

        fireEvent.click(screen.getByRole('button', { name: 'Close block settings' }));
        expect(screen.queryByRole('dialog', { name: 'Block settings' })).not.toBeInTheDocument();
        expect(useWorkoutStore.getState().editingSessionNodeId).toBe(selectedNodeId);

        const selectedCard = screen.getByRole('article', { name: 'Workout Workout 1' });
        fireEvent.click(selectedCard);
        expect(screen.getByRole('dialog', { name: 'Block settings' })).toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'Escape' });

        expect(screen.queryByRole('dialog', { name: 'Block settings' })).not.toBeInTheDocument();
        expect(selectedCard).toHaveFocus();
        expect(useWorkoutStore.getState().editingSessionNodeId).toBe(selectedNodeId);
    });

    it('keeps compact session prompts touch-sized and dismissible by Escape', () => {
        mockCompactViewport(true);
        render(<KineticSessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: 'New' }));

        expect(screen.getByRole('dialog', { name: 'Create a session' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveClass('h-11', 'w-11');
        expect(within(screen.getByRole('dialog', { name: 'Create a session' })).getByRole('textbox', { name: 'Session name' })).toHaveClass('h-11');

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('dialog', { name: 'Create a session' })).not.toBeInTheDocument();
    });

    it('shows an accessible progression reminder for workout blocks at or above the threshold', () => {
        const session = createSession([
            createWorkoutNode({ completedSessionsSinceProgression: 3 }),
            createRestNode(),
        ]);
        useWorkoutStore.setState({
            savedSessions: [session],
            editingSessionId: session.id,
            editingSessionDraft: session,
            editingSessionNodeId: session.nodes[0].id,
        });

        render(<KineticSessionBuilder />);

        expect(screen.getByText('Consider progressing')).toBeInTheDocument();
        expect(screen.getByRole('note', { name: /3 completed sessions since this workout was last changed/i })).toBeInTheDocument();
        expect(screen.getAllByRole('note')).toHaveLength(1);

        act(() => {
            useWorkoutStore.setState({
                settings: {
                    ...useWorkoutStore.getState().settings,
                    progressionReminderThreshold: 4,
                },
            });
        });

        expect(screen.queryByText('Consider progressing')).not.toBeInTheDocument();
    });

    it('links a saved workout through the selected block inspector without adding a second block', () => {
        const session = createSession([createWorkoutNode()]);
        const savedWorkout = {
            id: 'saved-workout',
            name: 'Saved Push Day',
            ...workoutConfig,
            sets: '2',
            reps: '10',
            seconds: '3',
            rest: '25',
            myoReps: '4',
            myoWorkSecs: '2',
            timesUsed: 0,
            lastUsedAt: null,
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
        };
        useWorkoutStore.setState({
            savedSessions: [session],
            editingSessionId: session.id,
            editingSessionDraft: session,
            editingSessionNodeId: session.nodes[0].id,
            savedWorkouts: [savedWorkout],
        });

        render(<KineticSessionBuilder />);

        fireEvent.change(screen.getByLabelText('Linked workout'), { target: { value: savedWorkout.id } });

        const node = useWorkoutStore.getState().editingSessionDraft?.nodes[0];
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes).toHaveLength(1);
        expect(node).toMatchObject({
            sourceWorkoutId: savedWorkout.id,
            name: savedWorkout.name,
            config: {
                sets: '2',
                reps: '10',
                seconds: '3',
                rest: '25',
                myoReps: '4',
                myoWorkSecs: '2',
            },
        });
        expect(screen.getByRole('status')).toHaveTextContent('Workout linked');
    });

    it('renews identical success notifications and never lets the old timer clear the newer one', () => {
        const session = createSession([createWorkoutNode()]);
        useWorkoutStore.setState({
            savedSessions: [session],
            editingSessionId: session.id,
            editingSessionDraft: session,
            editingSessionNodeId: session.nodes[0].id,
        });

        render(<KineticSessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: 'Remove Workout 1' }));
        expect(screen.getByRole('status')).toHaveTextContent('Block removed');

        act(() => {
            vi.advanceTimersByTime(2999);
        });
        fireEvent.click(screen.getByRole('button', { name: 'Add workout' }));
        fireEvent.click(screen.getByRole('button', { name: 'Remove Workout 1' }));

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(screen.getByRole('status')).toHaveTextContent('Block removed');

        act(() => {
            vi.advanceTimersByTime(2999);
        });
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
});
