import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KineticSessionBuilder from '@/components/kinetic/KineticSessionBuilder';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { useAccountStore } from '@/store/useAccountStore';
import { useSyncStore } from '@/store/useSyncStore';
import type { SyncEntityType } from '@/types/sync';
import { createSyncMetadata } from '@/utils/sync';
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

const resetSyncFeedback = () => {
    useSyncStore.setState({
        syncEnabled: false,
        firstSyncState: 'idle',
        currentUserId: null,
        queuedOperations: [],
        queueStatus: 'idle',
        syncError: null,
        authExpired: false,
    });
    useAccountStore.getState().clearAccountState();
};

const prepareCloudSync = () => {
    useAccountStore.setState({
        entitlement: {
            userId: 'save-feedback-account',
            plan: 'plus',
            cloudSyncEnabled: true,
            updatedAt: '2026-09-01T00:00:00.000Z',
            source: 'supabase',
        },
    });
    useSyncStore.setState({
        syncEnabled: true,
        firstSyncState: 'idle',
        currentUserId: 'save-feedback-account',
        queuedOperations: [],
        queueStatus: 'idle',
        syncError: null,
        authExpired: false,
    });
};

const acknowledgeSavedEntity = (entityType: SyncEntityType, entityId: string) => {
    const queueItem = useSyncStore.getState().queuedOperations.find((item) => (
        item.entityType === entityType && item.entityId === entityId
    ));
    expect(queueItem).toBeDefined();
    if (!queueItem) return;

    const store = useWorkoutStore.getState();
    const record = entityType === 'session'
        ? store.savedSessions.find((entry) => entry.id === entityId)
        : store.savedWorkouts.find((entry) => entry.id === entityId);
    expect(record).toBeDefined();
    if (!record?.sync) return;

    const remoteRevision = queueItem.revision;
    const remoteSyncedAt = new Date(new Date(record.updatedAt).getTime() + 60_000).toISOString();
    const remoteRecord = {
        ...record,
        updatedAt: remoteSyncedAt,
        sync: {
            ...record.sync,
            updatedAt: remoteSyncedAt,
            remoteId: `remote-${entityId}`,
            revision: remoteRevision,
            baseRevision: remoteRevision,
            dirty: false,
            pendingDelete: false,
            deletedAt: null,
            lastSyncedAt: remoteSyncedAt,
        },
    };
    const acknowledged = entityType === 'session'
        ? store.acknowledgeSyncedSession(remoteRecord as typeof store.savedSessions[number], {
            localId: queueItem.localId,
            revision: queueItem.revision,
            remoteRevision,
        })
        : store.acknowledgeSyncedWorkout(remoteRecord as typeof store.savedWorkouts[number], {
            localId: queueItem.localId,
            revision: queueItem.revision,
            remoteRevision,
        });
    expect(acknowledged).toBe(true);
    expect(useSyncStore.getState().acknowledgeUpsert({
        operationId: queueItem.operationId,
        ownerUserId: queueItem.ownerUserId,
        authGeneration: queueItem.authGeneration,
        entityType: queueItem.entityType,
        localId: queueItem.localId,
        revision: queueItem.revision,
        expectedRemoteRevision: queueItem.expectedRemoteRevision,
        syncedAt: remoteSyncedAt,
    })).toBe(true);
};

describe('KineticSessionBuilder', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resetStore();
        resetSyncFeedback();
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

    it('waits for every linked save revision before confirming a session save', () => {
        prepareCloudSync();
        const now = '2026-09-01T00:00:00.000Z';
        const workoutId = 'shared-workout';
        const workout = {
            id: workoutId,
            name: 'Shared workout',
            ...workoutConfig,
            notes: '',
            completedSessionsSinceProgression: 0,
            timesUsed: 0,
            lastUsedAt: null,
            createdAt: now,
            updatedAt: now,
            sync: createSyncMetadata(workoutId, now),
        };
        const sessionA = {
            ...createSession([createWorkoutNode({ sourceWorkoutId: workoutId })]),
            id: 'session-a',
            sync: createSyncMetadata('session-a', now),
        };
        const sessionB = {
            ...createSession([createWorkoutNode({ id: 'workout-node-b', sourceWorkoutId: workoutId })]),
            id: 'session-b',
            sync: createSyncMetadata('session-b', now),
        };
        useWorkoutStore.setState({
            savedSessions: [sessionA, sessionB],
            savedWorkouts: [workout],
            editingSessionId: sessionA.id,
            editingSessionDraft: sessionA,
            editingSessionNodeId: sessionA.nodes[0].id,
        });
        useSyncStore.getState().enqueueEntityChange({
            entityType: 'workout',
            entityId: workout.id,
            localId: workout.sync.localId,
            operation: 'upsert',
            revision: workout.sync.revision,
            expectedRemoteRevision: workout.sync.baseRevision,
        });
        useSyncStore.getState().enqueueEntityChange({
            entityType: 'session',
            entityId: sessionB.id,
            localId: sessionB.sync.localId,
            operation: 'upsert',
            revision: sessionB.sync.revision,
            expectedRemoteRevision: sessionB.sync.baseRevision,
        });

        render(<KineticSessionBuilder />);
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        const notice = screen.getByTestId('builder-save-feedback');
        expect(notice).toHaveTextContent(/waiting for cloud confirmation of 3 saved revisions/i);
        const savedSessionOperation = useSyncStore.getState().queuedOperations.find((item) => (
            item.entityType === 'session' && item.entityId === sessionA.id
        ));
        expect(savedSessionOperation).toBeDefined();
        expect(savedSessionOperation?.revision).toBeGreaterThan(
            (savedSessionOperation?.expectedRemoteRevision ?? 0) + 1,
        );
        act(() => acknowledgeSavedEntity('session', sessionA.id));
        expect(notice).toHaveTextContent(/waiting for cloud confirmation of 2 saved revisions/i);
        expect(notice).not.toHaveTextContent(/synced to the cloud/i);

        act(() => acknowledgeSavedEntity('workout', workout.id));
        expect(notice).toHaveTextContent(/waiting for cloud confirmation/i);
        expect(notice).not.toHaveTextContent(/synced to the cloud/i);

        act(() => acknowledgeSavedEntity('session', sessionB.id));
        expect(notice).toHaveTextContent('Saved locally and synced to the cloud.');
        act(() => vi.advanceTimersByTime(5000));
        expect(notice).toHaveTextContent('Saved locally and synced to the cloud.');
        act(() => useWorkoutStore.setState({
            editingSessionId: sessionB.id,
            editingSessionDraft: sessionB,
            editingSessionNodeId: sessionB.nodes[0].id,
        }));
        expect(screen.queryByTestId('builder-save-feedback')).not.toBeInTheDocument();
    });

    it('keeps Save As status visible while offline and updates after its exact revision is acknowledged', () => {
        prepareCloudSync();
        const session = createSession([createRestNode()]);
        useWorkoutStore.setState({
            savedSessions: [session],
            editingSessionId: session.id,
            editingSessionDraft: session,
            editingSessionNodeId: session.nodes[0].id,
        });

        render(<KineticSessionBuilder />);
        act(() => window.dispatchEvent(new Event('offline')));
        fireEvent.click(screen.getByRole('button', { name: 'Save session as copy' }));
        const dialog = screen.getByRole('dialog', { name: 'Save a copy' });
        fireEvent.change(within(dialog).getByLabelText('Session name'), { target: { value: 'Leg Session Copy' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save copy' }));

        const savedCopy = useWorkoutStore.getState().savedSessions.find((entry) => entry.name === 'Leg Session Copy');
        expect(savedCopy).toBeDefined();
        const notice = screen.getByTestId('builder-save-feedback');
        expect(notice).toHaveTextContent(/saved locally while offline/i);
        act(() => vi.advanceTimersByTime(5000));
        expect(notice).toHaveTextContent(/saved locally while offline/i);

        act(() => window.dispatchEvent(new Event('online')));
        expect(notice).toHaveTextContent(/waiting for cloud confirmation/i);
        act(() => acknowledgeSavedEntity('session', savedCopy!.id));
        expect(notice).toHaveTextContent('Saved locally and synced to the cloud.');
    });

    it('adds independent default workout blocks before appended recovery blocks', () => {
        render(<KineticSessionBuilder />);


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
    });

});
