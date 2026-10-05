import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SessionBuilder from '@/components/SessionBuilder';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { audioEngine } from '@/utils/audioEngine';
import { useAccountStore } from '@/store/useAccountStore';
import { useSyncStore } from '@/store/useSyncStore';
import type { SyncEntityType } from '@/types/sync';
import { createSavedSession, createRestSessionNode, createWorkoutSessionNode } from '@/utils/savedSessions';

const baseWorkout = {
    id: 'w-1',
    name: 'Push Day',
    sets: '2',
    reps: '10',
    seconds: '3',
    rest: '20',
    myoReps: '4',
    myoWorkSecs: '2',
    timesUsed: 2,
    lastUsedAt: '2026-03-01T00:00:00.000Z',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
};

const resetStore = () => {
    const store = useWorkoutStore.getState();

    useWorkoutStore.setState({
        settings: {
            ...store.settings,
            prepTime: 5,
        },
        appPhase: 'setup',
        timerStatus: 'Ready',
        isTimerRunning: false,
        currentSet: 1,
        currentRep: 1,
        isMainRep: true,
        isWorking: true,
        timeLeft: 0,
        setTotalDuration: 0,
        setElapsedTime: 0,
        lastTickSecond: -1,
        savedWorkouts: [baseWorkout],
        selectedSavedWorkoutId: baseWorkout.id,
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

    store.setWorkoutConfig({
        sets: '2',
        reps: '10',
        seconds: '3',
        rest: '20',
        myoReps: '4',
        myoWorkSecs: '2',
    });
};

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

describe('SessionBuilder', () => {
    beforeEach(() => {
        setMobileViewport(false);
        resetStore();
        resetSyncFeedback();
    });

    it('covers empty builder actions, draft creation, and invalid save/start branches', () => {
        render(<SessionBuilder />);

        expect(screen.getByText(/Empty canvas/i)).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /^add workout$/i })).toHaveLength(1);
        expect(screen.getAllByRole('button', { name: /^add rest$/i })).toHaveLength(1);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^new session$/i })).toHaveClass('border-primary/60');

        fireEvent.click(screen.getByRole('button', { name: /start/i }));
        let dialog = screen.getByRole('dialog', { name: /no session is ready to start/i });
        expect(within(dialog).getByText(/Create or load a session first/i)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: /got it/i }));

        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
        dialog = screen.getByRole('dialog', { name: /could not save this session/i });
        expect(within(dialog).getByText(/No session draft is open/i)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: /got it/i }));

        fireEvent.click(screen.getByRole('button', { name: /save as/i }));
        dialog = screen.getByRole('dialog', { name: /nothing to save yet/i });
        expect(within(dialog).getByText(/Create or load a session before saving a copy/i)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: /got it/i }));

        fireEvent.click(screen.getByRole('button', { name: /^new session$/i }));
        dialog = screen.getByRole('dialog', { name: /create a new session/i });
        expect(within(dialog).getByDisplayValue('New Session')).toBeInTheDocument();
        fireEvent.change(within(dialog).getByLabelText(/session name/i), { target: { value: 'Alpha Session' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /create session/i }));
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes).toHaveLength(0);
        expect(screen.getByText('0:00')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
        dialog = screen.getByRole('dialog', { name: /could not save this session/i });
        expect(within(dialog).getByText(/Session is invalid/i)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: /got it/i }));

        fireEvent.click(screen.getByRole('button', { name: /start/i }));
        dialog = screen.getByRole('dialog', { name: /could not start this session/i });
        expect(within(dialog).getByText(/Session is invalid/i)).toBeInTheDocument();
    });

    it('waits for the saved session revision acknowledgement instead of trusting queue idle', () => {
        prepareCloudSync();
        const session = createSavedSession(
            'Confirm Session',
            [createRestSessionNode('Recovery', '60', '2026-09-01T00:00:00.000Z')],
            '2026-09-01T00:00:00.000Z',
        );
        useWorkoutStore.setState({
            savedSessions: [session],
            editingSessionId: session.id,
            editingSessionDraft: session,
            editingSessionNodeId: session.nodes[0].id,
            setupMode: 'session',
        });

        render(<SessionBuilder />);
        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

        const notice = screen.getByTestId('builder-save-feedback');
        expect(notice).toHaveTextContent(/saved locally.*waiting for cloud confirmation/i);
        expect(notice).not.toHaveTextContent(/synced to the cloud/i);
        expect(useSyncStore.getState().queuedOperations).toHaveLength(1);

        act(() => useSyncStore.setState({ queueStatus: 'idle' }));
        expect(notice).toHaveTextContent(/waiting for cloud confirmation/i);
        expect(notice).not.toHaveTextContent(/synced to the cloud/i);

        act(() => {
            const queuedOperations = useSyncStore.getState().queuedOperations.map((item) => ({
                ...item,
                lastError: 'Request timed out',
                deadLetteredAt: '2026-09-01T00:01:00.000Z',
            }));
            useSyncStore.setState({
                queuedOperations,
                queueStatus: 'dead-letter',
                syncError: 'Request timed out',
            });
        });
        expect(notice).toHaveTextContent(/cloud sync failed: Request timed out/i);
        expect(notice).not.toHaveTextContent(/synced to the cloud/i);

        act(() => acknowledgeSavedEntity('session', session.id));
        expect(notice).toHaveTextContent('Saved locally and synced to the cloud.');

        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
        expect(notice).toHaveTextContent(/saved locally.*waiting for cloud confirmation/i);
        expect(notice).not.toHaveTextContent(/synced to the cloud/i);
        act(() => {
            useSyncStore.setState({ queuedOperations: [], queueStatus: 'idle' });
            useWorkoutStore.setState((state) => ({
                savedSessions: state.savedSessions.map((record) => ({
                    ...record,
                    sync: {
                        ...record.sync!,
                        dirty: false,
                        baseRevision: record.sync!.revision - 1,
                    },
                })),
            }));
        });
        expect(notice).not.toHaveTextContent(/synced to the cloud/i);
        act(() => useSyncStore.setState({
            currentUserId: 'another-save-feedback-account',
            authGeneration: 'another-save-feedback-generation',
        }));
        expect(screen.queryByTestId('builder-save-feedback')).not.toBeInTheDocument();
    });

    it('reports first-sync choice as pending for Save As copies', () => {
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
            syncEnabled: false,
            firstSyncState: 'pending-choice',
            currentUserId: 'save-feedback-account',
            queueStatus: 'idle',
        });
        const session = createSavedSession(
            'Copy Source',
            [createRestSessionNode('Recovery', '60', '2026-09-01T00:00:00.000Z')],
            '2026-09-01T00:00:00.000Z',
        );
        useWorkoutStore.setState({
            savedSessions: [session],
            editingSessionId: session.id,
            editingSessionDraft: session,
            editingSessionNodeId: session.nodes[0].id,
            setupMode: 'session',
        });

        render(<SessionBuilder />);
        fireEvent.click(screen.getByRole('button', { name: /save as/i }));
        const dialog = screen.getByRole('dialog', { name: /save this session as a copy/i });
        fireEvent.change(within(dialog).getByLabelText(/session name/i), { target: { value: 'Copy Target' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /save copy/i }));

        expect(useWorkoutStore.getState().savedSessions.some((entry) => entry.name === 'Copy Target')).toBe(true);
        expect(screen.getByTestId('builder-save-feedback')).toHaveTextContent(/choose a first-sync option/i);
        expect(screen.getByTestId('builder-save-feedback')).not.toHaveTextContent(/synced to the cloud/i);
    });

    it('keeps explicit workout saves pending until the workout and linked sessions are acknowledged', () => {
        prepareCloudSync();
        const now = '2026-09-01T00:00:00.000Z';
        const linkedWorkout = {
            ...baseWorkout,
            notes: 'Original note',
            sync: {
                localId: baseWorkout.id,
                remoteId: 'remote-workout',
                revision: 1,
                baseRevision: 1,
                updatedAt: baseWorkout.updatedAt,
                dirty: false,
                pendingDelete: false,
                deletedAt: null,
                lastSyncedAt: baseWorkout.updatedAt,
            },
        };
        const linkedNode = {
            ...createWorkoutSessionNode('Push Day', linkedWorkout, now, linkedWorkout.id),
            notes: 'Original note',
        };
        const originalSession = createSavedSession('Linked Session', [linkedNode], now);
        const session = {
            ...originalSession,
            sync: {
                ...originalSession.sync!,
                remoteId: 'remote-session',
                baseRevision: 1,
                dirty: false,
                lastSyncedAt: originalSession.updatedAt,
            },
        };
        useWorkoutStore.setState({
            savedWorkouts: [linkedWorkout],
            savedSessions: [session],
            editingSessionId: session.id,
            editingSessionDraft: session,
            editingSessionNodeId: session.nodes[0].id,
            setupMode: 'session',
        });

        render(<SessionBuilder />);
        fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: 'Updated shared note' } });
        fireEvent.click(screen.getByRole('button', { name: /save workout/i }));

        expect(useWorkoutStore.getState().savedWorkouts[0].notes).toBe('Updated shared note');
        const notice = screen.getByTestId('builder-save-feedback');
        expect(notice).toHaveTextContent(/saved locally.*waiting for cloud confirmation/i);
        expect(notice).not.toHaveTextContent(/synced to the cloud/i);

        const queuedOperations = [...useSyncStore.getState().queuedOperations];
        expect(queuedOperations.some((item) => item.entityType === 'workout' && item.entityId === linkedWorkout.id)).toBe(true);
        act(() => {
            for (const item of queuedOperations) {
                acknowledgeSavedEntity(item.entityType, item.entityId);
            }
        });
        expect(notice).toHaveTextContent('Saved locally and synced to the cloud.');
    });

    it('uses a centered desktop shell so builder content stays aligned in web view', () => {
        render(<SessionBuilder />);

        expect(screen.getByTestId('session-builder-shell')).toHaveClass('mx-auto', 'max-w-[1024px]');
        expect(screen.getByTestId('session-canvas-frame')).toHaveClass('flex-1', 'min-h-[360px]');
        expect(screen.getByText(/Est. Time:/i)).toBeInTheDocument();
    });

    it('keeps the session actions centered in the desktop layout', () => {
        render(<SessionBuilder />);

        expect(screen.getByRole('button', { name: /save as/i }).parentElement).toHaveClass('max-w-[920px]');
        expect(screen.queryByText(/^End$/i)).not.toBeInTheDocument();
    });

    it('shows only node-level unsaved status when a session contains unlinked workout nodes', () => {
        useWorkoutStore.setState({
            editingSessionId: 'legacy-session',
            editingSessionDraft: {
                id: 'legacy-session',
                name: 'Legacy Session',
                nodes: [
                    {
                        id: 'legacy-node',
                        type: 'workout',
                        name: 'Workout 1',
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
            },
        });

        render(<SessionBuilder />);

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByText(/^unsaved$/i)).toBeInTheDocument();
        expect(screen.getByText('LEGACY SESSION')).toBeInTheDocument();
        expect(screen.getByText('UNSAVED CHANGES')).toBeInTheDocument();
    });

    it('shows the current session name and none when the draft matches the saved session', () => {
        useWorkoutStore.setState({
            savedSessions: [{
                id: 'saved-session',
                name: 'Saved Session',
                nodes: [
                    {
                        id: 'saved-node',
                        type: 'workout',
                        name: 'Workout 1',
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
            }],
            editingSessionId: 'saved-session',
            editingSessionDraft: {
                id: 'saved-session',
                name: 'Saved Session',
                nodes: [
                    {
                        id: 'saved-node',
                        type: 'workout',
                        name: 'Workout 1',
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
            },
        });

        render(<SessionBuilder />);

        expect(screen.getByText('SAVED SESSION')).toBeInTheDocument();
        expect(screen.queryByText(/none/i)).not.toBeInTheDocument();
    });

    it('shows a builder dialog error when creating a session without a name', () => {
        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new session$/i }));
        const dialog = screen.getByRole('dialog', { name: /create a new session/i });
        fireEvent.change(within(dialog).getByLabelText(/session name/i), { target: { value: '' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /create session/i }));

        const messageDialog = screen.getByRole('dialog', { name: /could not create this session/i });
        expect(within(messageDialog).getByText(/session name is required/i)).toBeInTheDocument();
    });

    it('lets mobile canvas panning start from the visible board surface', () => {
        setMobileViewport(true);
        resetStore();

        useWorkoutStore.setState({
            editingSessionId: 'mobile-pan-session',
            editingSessionDraft: {
                id: 'mobile-pan-session',
                name: 'Mobile Pan Session',
                nodes: [
                    {
                        id: 'mobile-pan-node',
                        type: 'workout',
                        name: 'Workout 1',
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
            },
        });

        render(<SessionBuilder />);

        const viewport = screen.getByTestId('session-canvas-viewport');
        const board = screen.getByTestId('session-canvas-board');
        const editButton = screen.getByRole('button', { name: /edit workout 1/i });
        const requestFrameSpy = vi.spyOn(globalThis, 'requestAnimationFrame');

        expect(board).toHaveStyle({ transform: 'translate3d(28px, 28px, 0)' });

        fireEvent.pointerDown(board, { pointerId: 1, clientX: 120, clientY: 120 });
        fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 164, clientY: 150 });
        fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 180, clientY: 160 });

        expect(requestFrameSpy).toHaveBeenCalledTimes(1);

        fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 180, clientY: 160 });

        expect(board).toHaveStyle({ transform: 'translate3d(88px, 68px, 0)' });

        fireEvent.pointerDown(editButton, { pointerId: 2, clientX: 90, clientY: 90 });
        fireEvent.pointerMove(viewport, { pointerId: 2, clientX: 140, clientY: 140 });
        fireEvent.pointerUp(viewport, { pointerId: 2, clientX: 140, clientY: 140 });

        expect(board).toHaveStyle({ transform: 'translate3d(88px, 68px, 0)' });
        requestFrameSpy.mockRestore();
    });

    it('resets the mobile canvas position when a different session draft is loaded', async () => {
        setMobileViewport(true);
        resetStore();

        useWorkoutStore.setState({
            editingSessionId: 'session-a',
            editingSessionDraft: {
                id: 'session-a',
                name: 'Long Session',
                nodes: [
                    {
                        id: 'node-a',
                        type: 'workout',
                        name: 'Workout 1',
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
            },
        });

        render(<SessionBuilder />);

        const viewport = screen.getByTestId('session-canvas-viewport');
        const board = screen.getByTestId('session-canvas-board');

        fireEvent.pointerDown(board, { pointerId: 1, clientX: 120, clientY: 120 });
        fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 164, clientY: 150 });
        fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 164, clientY: 150 });

        expect(board).toHaveStyle({ transform: 'translate3d(72px, 58px, 0)' });

        act(() => {
            useWorkoutStore.setState({
                editingSessionId: 'session-b',
                editingSessionDraft: {
                    id: 'session-b',
                    name: 'Short Session',
                    nodes: [
                        {
                            id: 'node-b',
                            type: 'rest',
                            name: 'Rest 1',
                            seconds: '45',
                            createdAt: '2026-03-01T00:00:00.000Z',
                            updatedAt: '2026-03-01T00:00:00.000Z',
                        },
                    ],
                    timesUsed: 0,
                    lastUsedAt: null,
                    createdAt: '2026-03-01T00:00:00.000Z',
                    updatedAt: '2026-03-01T00:00:00.000Z',
                },
            });
        });

        await waitFor(() => {
            expect(board).toHaveStyle({ transform: 'translate3d(28px, 28px, 0)' });
        });
    });

    it('keeps the mobile empty canvas actionable with bottom add controls', () => {
        setMobileViewport(true);
        resetStore();

        render(<SessionBuilder />);

        expect(screen.getByTestId('session-canvas-frame')).toBeInTheDocument();
        expect(screen.queryByText(/empty canvas/i)).not.toBeInTheDocument();
        expect(screen.getByText(/add a workout or rest block to start this session/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^add workout$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^add rest$/i })).toBeInTheDocument();
    });

    it('closes builder dialogs from the backdrop', () => {
        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new session$/i }));
        const dialog = screen.getByRole('dialog', { name: /create a new session/i });

        fireEvent.pointerDown(dialog, { target: dialog });
        expect(screen.queryByRole('dialog', { name: /create a new session/i })).not.toBeInTheDocument();
    });

    it('dismisses the builder dialog with Escape and restores focus to its opener', () => {
        render(<SessionBuilder />);

        const opener = screen.getByRole('button', { name: /^new session$/i });
        opener.focus();
        fireEvent.click(opener);
        expect(screen.getByRole('dialog', { name: /create a new session/i })).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'Escape' });

        expect(screen.queryByRole('dialog', { name: /create a new session/i })).not.toBeInTheDocument();
        expect(opener).toHaveFocus();
    });

    it('labels numeric node fields and restores focus when the editor closes', () => {
        const nowIso = '2026-09-01T00:00:00.000Z';
        const session = createSavedSession(
            'Accessible Session',
            [
                createWorkoutSessionNode('Accessible Workout', {
                    sets: '2',
                    reps: '10',
                    seconds: '3',
                    rest: '20',
                    myoReps: '4',
                    myoWorkSecs: '2',
                }, nowIso),
                createRestSessionNode('Recovery', '45', nowIso),
            ],
            nowIso,
        );
        useWorkoutStore.setState({
            editingSessionId: session.id,
            editingSessionDraft: session,
            editingSessionNodeId: null,
            setupMode: 'session',
        });

        render(<SessionBuilder />);

        const workoutOpener = screen.getByRole('button', { name: 'Edit Accessible Workout' });
        workoutOpener.focus();
        fireEvent.click(workoutOpener);
        const workoutEditor = screen.getByRole('dialog', { name: /workout node editor/i });
        for (const label of ['Sets', 'Reps', 'Seconds', 'Rest', 'Myo Reps', 'Myo Pace']) {
            expect(within(workoutEditor).getByLabelText(label)).toHaveAttribute('type', 'number');
        }
        expect(workoutEditor.contains(document.activeElement)).toBe(true);
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(workoutOpener).toHaveFocus();

        fireEvent.click(screen.getByRole('button', { name: 'Edit Recovery' }));
        const restEditor = screen.getByRole('dialog', { name: /rest node editor/i });
        expect(within(restEditor).getByLabelText('Rest Seconds')).toHaveAttribute('type', 'number');
    });

    it('restores a removed block in its original place with the undo action', () => {
        const nowIso = '2026-09-01T00:00:00.000Z';
        const session = createSavedSession(
            'Undo Session',
            [
                createRestSessionNode('First Recovery', '30', nowIso),
                createRestSessionNode('Removed Recovery', '45', nowIso),
                createRestSessionNode('Last Recovery', '60', nowIso),
            ],
            nowIso,
        );
        useWorkoutStore.setState({
            editingSessionId: session.id,
            editingSessionDraft: session,
            editingSessionNodeId: null,
            setupMode: 'session',
        });

        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: 'Delete Removed Recovery' }));
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes.map((node) => node.name)).toEqual([
            'First Recovery',
            'Last Recovery',
        ]);

        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes.map((node) => node.name)).toEqual([
            'First Recovery',
            'Removed Recovery',
            'Last Recovery',
        ]);
    });

    it('adds a session-local workout node without creating or linking a saved workout', () => {
        useWorkoutStore.setState({
            selectedSavedWorkoutId: null,
            savedWorkouts: [baseWorkout],
        });

        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new session$/i }));
        const dialog = screen.getByRole('dialog', { name: /create a new session/i });
        fireEvent.change(within(dialog).getByLabelText(/session name/i), { target: { value: 'No Link Session' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /create session/i }));

        fireEvent.click(screen.getByRole('button', { name: /^add workout$/i }));
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes).toHaveLength(1);
        expect(useWorkoutStore.getState().savedWorkouts).toHaveLength(1);
        const node = useWorkoutStore.getState().editingSessionDraft?.nodes[0];
        expect(node?.type).toBe('workout');
        if (node?.type === 'workout') {
            expect(node.sourceWorkoutId).toBeNull();
        }
    });

    it('adds a valid default session-local workout node independently of the current workout config', () => {
        useWorkoutStore.setState({
            selectedSavedWorkoutId: null,
            savedWorkouts: [],
            sets: '',
            reps: '',
            seconds: '',
            rest: '',
            myoReps: '',
            myoWorkSecs: '',
        });

        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new session$/i }));
        const dialog = screen.getByRole('dialog', { name: /create a new session/i });
        fireEvent.change(within(dialog).getByLabelText(/session name/i), { target: { value: 'Broken Session' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /create session/i }));

        fireEvent.click(screen.getByRole('button', { name: /^add workout$/i }));

        expect(screen.queryByRole('dialog', { name: /could not add this workout node/i })).not.toBeInTheDocument();
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes).toHaveLength(1);
        const node = useWorkoutStore.getState().editingSessionDraft?.nodes[0];
        expect(node?.type).toBe('workout');
        if (node?.type === 'workout') {
            expect(node.sourceWorkoutId).toBeNull();
            expect(node.config).toMatchObject({
                sets: '3',
                reps: '15',
                seconds: '2',
                rest: '20',
                myoReps: '5',
                myoWorkSecs: '2',
            });
        }
    });

    it('shows a create-session error when the dialog is submitted without a valid name', () => {
        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new session$/i }));
        const dialog = screen.getByRole('dialog', { name: /create a new session/i });
        fireEvent.change(within(dialog).getByLabelText(/session name/i), { target: { value: '' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /create session/i }));

        const errorDialog = screen.getByRole('dialog', { name: /could not create this session/i });
        expect(within(errorDialog).getByText(/session name is required/i)).toBeInTheDocument();
    });


    it('shows progression reminders only for workout nodes at the configured threshold', () => {
        useWorkoutStore.setState((state) => ({
            settings: {
                ...state.settings,
                progressionReminderThreshold: 3,
            },
            setupMode: 'session',
            editingSessionNodeId: null,
            editingSessionDraft: {
                id: 'progression-session',
                name: 'Progression Session',
                nodes: [
                    {
                        id: 'progression-workout',
                        type: 'workout',
                        name: 'Workout 1',
                        config: {
                            sets: '2',
                            reps: '10',
                            seconds: '3',
                            rest: '20',
                            myoReps: '4',
                            myoWorkSecs: '2',
                        },
                        sourceWorkoutId: null,
                        notes: '',
                        completedSessionsSinceProgression: 3,
                        createdAt: '2026-03-01T00:00:00.000Z',
                        updatedAt: '2026-03-01T00:00:00.000Z',
                    },
                    {
                        id: 'below-threshold-workout',
                        type: 'workout',
                        name: 'Workout 2',
                        config: {
                            sets: '2', reps: '10', seconds: '3', rest: '20', myoReps: '4', myoWorkSecs: '2',
                        },
                        sourceWorkoutId: null,
                        notes: '',
                        completedSessionsSinceProgression: 2,
                        createdAt: '2026-03-01T00:00:00.000Z',
                        updatedAt: '2026-03-01T00:00:00.000Z',
                    },
                    {
                        id: 'progression-rest',
                        type: 'rest',
                        name: 'Rest 1',
                        seconds: '20',
                        createdAt: '2026-03-01T00:00:00.000Z',
                        updatedAt: '2026-03-01T00:00:00.000Z',
                    },
                ],
                timesUsed: 0,
                lastUsedAt: null,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
            },
        }));

        render(<SessionBuilder />);

        expect(screen.getAllByText('Consider progressing')).toHaveLength(1);
        expect(screen.getByLabelText(/3 completed sessions since this workout was last changed/i)).toBeInTheDocument();
        expect(screen.queryByLabelText(/completed sessions since this rest was last changed/i)).not.toBeInTheDocument();
    });

    it('shows workout notes in the editor and on the canvas card', () => {
        useWorkoutStore.setState({
            setupMode: 'session',
            editingSessionNodeId: 'notes-node',
            editingSessionDraft: {
                id: 'session-notes',
                name: 'Notes Session',
                nodes: [
                    {
                        id: 'notes-node',
                        type: 'workout',
                        name: 'Workout 1',
                        config: {
                            sets: '2',
                            reps: '10',
                            seconds: '3',
                            rest: '20',
                            myoReps: '4',
                            myoWorkSecs: '2',
                        },
                        notes: '',
                        sourceWorkoutId: baseWorkout.id,
                        createdAt: '2026-03-01T00:00:00.000Z',
                        updatedAt: '2026-03-01T00:00:00.000Z',
                    },
                ],
                timesUsed: 0,
                lastUsedAt: null,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
            },
            savedWorkouts: [baseWorkout],
        });

        render(<SessionBuilder />);

        const dialog = screen.getByRole('dialog', { name: /workout node editor/i });
        const notesInput = within(dialog).getByLabelText(/notes/i);
        fireEvent.change(notesInput, { target: { value: 'Prev 60kg' } });

        const editedNode = useWorkoutStore.getState().editingSessionDraft?.nodes[0];
        expect(editedNode?.type === 'workout' ? editedNode.notes : '').toBe('Prev 60kg');
        expect(screen.getByRole('button', { name: /edit workout 1/i }).closest('[draggable="true"]'))
            .toHaveTextContent(/prev 60kg/i);
    });

    it('shows a missing-link warning when a node points to a deleted workout', () => {
        useWorkoutStore.setState({
            setupMode: 'session',
            editingSessionNodeId: 'missing-link-node',
            editingSessionDraft: {
                id: 'session-missing-link',
                name: 'Missing Link Session',
                nodes: [
                    {
                        id: 'missing-link-node',
                        type: 'workout',
                        name: 'Workout 1',
                        config: {
                            sets: '2',
                            reps: '10',
                            seconds: '3',
                            rest: '20',
                            myoReps: '4',
                            myoWorkSecs: '2',
                        },
                        sourceWorkoutId: 'deleted-workout',
                        createdAt: '2026-03-01T00:00:00.000Z',
                        updatedAt: '2026-03-01T00:00:00.000Z',
                    },
                ],
                timesUsed: 0,
                lastUsedAt: null,
                createdAt: '2026-03-01T00:00:00.000Z',
                updatedAt: '2026-03-01T00:00:00.000Z',
            },
        });

        render(<SessionBuilder />);

        expect(screen.getByText(/missing workout link/i)).toBeInTheDocument();
        expect(screen.getByText(/no longer in your library/i)).toBeInTheDocument();
    });

    it('adds the generic default workout when standalone setup values are blank', () => {
        useWorkoutStore.setState({
            selectedSavedWorkoutId: null,
            savedWorkouts: [],
        });
        useWorkoutStore.getState().setWorkoutConfig({
            sets: '',
            reps: '',
            seconds: '',
            rest: '',
            myoReps: '',
            myoWorkSecs: '',
        });

        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new session$/i }));
        const dialog = screen.getByRole('dialog', { name: /create a new session/i });
        fireEvent.change(within(dialog).getByLabelText(/session name/i), { target: { value: 'Broken Session' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /create session/i }));

        fireEvent.click(screen.getByRole('button', { name: /^add workout$/i }));
        expect(screen.queryByRole('dialog', { name: /could not add this workout node/i })).not.toBeInTheDocument();
        const createdNode = useWorkoutStore.getState().editingSessionDraft?.nodes.find((node) => node.type === 'workout');
        expect(createdNode?.type).toBe('workout');
        if (createdNode?.type === 'workout') {
            expect(createdNode.sourceWorkoutId).toBeNull();
            expect(createdNode.config).toMatchObject({
                sets: '3',
                reps: '15',
                seconds: '2',
                rest: '20',
                myoReps: '5',
                myoWorkSecs: '2',
            });
        }
    });

    it('builds, edits, saves, and starts a valid session', () => {
        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new session$/i }));
        const createDialog = screen.getByRole('dialog', { name: /create a new session/i });
        fireEvent.change(within(createDialog).getByLabelText(/session name/i), { target: { value: 'Leg Session' } });
        fireEvent.click(within(createDialog).getByRole('button', { name: /create session/i }));
        fireEvent.click(screen.getByRole('button', { name: /^add workout$/i }));

        const orderedButtons = [
            screen.getByRole('button', { name: /^new session$/i }),
            screen.getByRole('button', { name: /^Save$/i }),
            screen.getByRole('button', { name: /^Save As$/i }),
            screen.getByRole('button', { name: /^Start$/i }),
        ];
        for (let index = 0; index < orderedButtons.length - 1; index += 1) {
            expect(
                orderedButtons[index].compareDocumentPosition(orderedButtons[index + 1]) & Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
        }
        expect(screen.getByRole('textbox', { name: /session name/i }).compareDocumentPosition(orderedButtons[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getByRole('button', { name: /^add workout$/i }).compareDocumentPosition(orderedButtons[orderedButtons.length - 1]) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();

        expect(useWorkoutStore.getState().editingSessionDraft?.nodes).toHaveLength(1);
        expect(screen.getByRole('button', { name: /edit workout 1/i })).toBeInTheDocument();
        expect(screen.getByText('15 @ 2s + (2 * 5 @ 2s)')).toBeInTheDocument();
        expect(screen.getByText('1:35')).toBeInTheDocument();
        const initialWorkoutNode = useWorkoutStore.getState().editingSessionDraft?.nodes.find((node) => node.type === 'workout');
        if (initialWorkoutNode?.type === 'workout') {
            expect(initialWorkoutNode.sourceWorkoutId).toBeNull();
        }

        fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
        expect(useWorkoutStore.getState().savedSessions).toHaveLength(1);

        fireEvent.click(screen.getByRole('button', { name: /edit workout 1/i }));

        const workoutDialog = screen.getByRole('dialog', { name: /workout node editor/i });
        const workoutNameInput = within(workoutDialog).getByLabelText(/^name$/i);
        fireEvent.change(workoutNameInput, { target: { value: '' } });
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes.find((node) => node.type === 'workout')?.name).toBe('');
        fireEvent.change(workoutNameInput, { target: { value: '  Push Day  ' } });
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes.find((node) => node.type === 'workout')?.name).toBe('  Push Day  ');

        const workoutInputs = within(workoutDialog).getAllByRole('spinbutton');
        fireEvent.change(workoutInputs[0], { target: { value: '0' } });

        const draftAfterWorkoutEdit = useWorkoutStore.getState().editingSessionDraft;
        const workoutNode = draftAfterWorkoutEdit?.nodes.find((node) => node.type === 'workout');
        if (workoutNode?.type === 'workout') {
            expect(workoutNode.config.sets).toBe('1');
        }
        expect(workoutInputs[3]).toBeDisabled();
        expect(workoutInputs[4]).toBeDisabled();
        expect(workoutInputs[5]).toBeDisabled();

        const workoutTargetSelect = within(workoutDialog).getByLabelText(/workout target/i) as HTMLSelectElement;
        fireEvent.change(workoutTargetSelect, { target: { value: baseWorkout.id } });
        fireEvent.click(within(workoutDialog).getByRole('button', { name: /import workout/i }));

        const draftAfterImport = useWorkoutStore.getState().editingSessionDraft;
        const importedWorkoutNode = draftAfterImport?.nodes.find((node) => node.type === 'workout');
        if (importedWorkoutNode?.type === 'workout') {
            expect(importedWorkoutNode.config.sets).toBe(baseWorkout.sets);
            expect(importedWorkoutNode.config.reps).toBe(baseWorkout.reps);
            expect(importedWorkoutNode.sourceWorkoutId).toBe(baseWorkout.id);
        }

        fireEvent.change(workoutNameInput, { target: { value: 'Push Day Updated' } });
        fireEvent.click(within(workoutDialog).getByRole('button', { name: /save workout/i }));

        expect(useWorkoutStore.getState().savedWorkouts).toHaveLength(1);
        expect(useWorkoutStore.getState().savedWorkouts[0].name).toBe('Push Day Updated');

        fireEvent.change(workoutTargetSelect, { target: { value: '__new__' } });
        fireEvent.change(workoutNameInput, { target: { value: 'Push Day Copy' } });
        fireEvent.click(within(workoutDialog).getByRole('button', { name: /save workout/i }));

        expect(useWorkoutStore.getState().savedWorkouts).toHaveLength(2);
        expect(useWorkoutStore.getState().savedWorkouts[1].name).toBe('Push Day Copy');

        fireEvent.click(workoutDialog);
        expect(screen.getByRole('dialog', { name: /workout node editor/i })).toBeInTheDocument();

        fireEvent.click(within(workoutDialog).getByRole('button', { name: /close node editor/i }));
        expect(screen.queryByRole('dialog', { name: /workout node editor/i })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^add rest$/i }));
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes).toHaveLength(2);
        expect(screen.getByRole('button', { name: /edit rest 1/i })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /edit rest 1/i }));
        const restDialog = screen.getByRole('dialog', { name: /rest node editor/i });
        fireEvent.change(within(restDialog).getByRole('spinbutton'), { target: { value: '45' } });

        const restNode = useWorkoutStore.getState().editingSessionDraft?.nodes.find((node) => node.type === 'rest');
        if (restNode?.type === 'rest') {
            expect(restNode.seconds).toBe('45');
        }

        fireEvent.click(within(restDialog).getByRole('button', { name: /close node editor/i }));

        fireEvent.click(screen.getByRole('button', { name: /^Save As$/i }));
        const saveAsDialog = screen.getByRole('dialog', { name: /save this session as a copy/i });
        expect(within(saveAsDialog).getByDisplayValue('Leg Session')).toBeInTheDocument();
        fireEvent.change(within(saveAsDialog).getByLabelText(/session name/i), { target: { value: 'Leg Session Copy' } });
        fireEvent.click(within(saveAsDialog).getByRole('button', { name: /save copy/i }));
        expect(useWorkoutStore.getState().savedSessions).toHaveLength(2);

        const audioInitSpy = vi.spyOn(audioEngine, 'init').mockImplementation(() => {});
        fireEvent.click(screen.getByRole('button', { name: /start/i }));
        expect(audioInitSpy).toHaveBeenCalledTimes(1);
        audioInitSpy.mockRestore();
        expect(useWorkoutStore.getState().appPhase).toBe('timer');
        expect(useWorkoutStore.getState().timerStatus).toBe('Preparing');
        expect(useWorkoutStore.getState().timeLeft).toBe(useWorkoutStore.getState().settings.prepTime);
        expect(useWorkoutStore.getState().isRunningSession).toBe(true);

        useWorkoutStore.getState().advanceCycle();
        expect(useWorkoutStore.getState().timerStatus).toBe('Main Set');
        expect(useWorkoutStore.getState().timeLeft).toBe(3);
    });

    it('shows unsaved workout messaging and links the node when it is saved', () => {
        useWorkoutStore.setState({
            setupMode: 'session',
            editingSessionNodeId: 'legacy-node',
            editingSessionDraft: {
                id: 'session-legacy',
                name: 'Legacy Session',
                nodes: [
                    {
                        id: 'legacy-node',
                        type: 'workout',
                        name: 'Legacy Node',
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
            },
        });

        render(<SessionBuilder />);

        expect(screen.getAllByText(/^unsaved$/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/only exists inside this session right now/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /export workout/i })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /export workout/i }));

        const legacyNode = useWorkoutStore.getState().editingSessionDraft?.nodes[0];
        expect(legacyNode?.type).toBe('workout');
        if (legacyNode?.type === 'workout') {
            expect(legacyNode.sourceWorkoutId).toBeTruthy();
        }
    });

    it('supports a pannable mobile canvas and keeps the builder scroll-friendly', () => {
        setMobileViewport(true);
        useWorkoutStore.setState({
            setupMode: 'session',
            editingSessionDraft: {
                id: 'mobile-session',
                name: 'Mobile Session',
                nodes: [
                    {
                        id: 'mobile-node',
                        type: 'workout',
                        name: 'Workout 1',
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
            },
        });

        render(<SessionBuilder />);

        const viewport = screen.getByTestId('session-canvas-viewport');
        const board = screen.getByTestId('session-canvas-board');
        const shell = screen.getByTestId('session-builder-shell');
        const card = screen.getByRole('button', { name: /edit workout 1/i }).closest('[draggable="false"]');
        const initialStyle = board.getAttribute('style') ?? '';

        expect(shell.className).toContain('max-w-none');
        expect(card).toHaveClass('w-[min(14.5rem,66vw)]', 'min-h-[132px]');
        expect(screen.queryByText(/^End$/i)).not.toBeInTheDocument();

        fireEvent.pointerDown(viewport, { clientX: 220, clientY: 260, target: viewport });
        fireEvent.pointerMove(viewport, { clientX: 170, clientY: 210 });
        fireEvent.pointerUp(viewport);

        expect(board.getAttribute('style') ?? '').not.toBe(initialStyle);
        expect(screen.getByRole('button', { name: /move workout 1 left/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /move workout 1 right/i })).toBeInTheDocument();
    });

    it('reorders nodes when dropping a dragged node onto a middle node', () => {
        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new session$/i }));
        const createDialog = screen.getByRole('dialog', { name: /create a new session/i });
        fireEvent.change(within(createDialog).getByLabelText(/session name/i), { target: { value: 'Drag Session' } });
        fireEvent.click(screen.getByRole('button', { name: /create session/i }));
        fireEvent.click(screen.getByRole('button', { name: /^add workout$/i }));
        fireEvent.click(screen.getByRole('button', { name: /^add rest$/i }));
        fireEvent.click(screen.getByRole('button', { name: /^add workout$/i }));

        const workoutOne = screen.getByRole('button', { name: /edit workout 1/i }).closest('[draggable="true"]') as HTMLElement;
        const workoutTwo = screen.getByRole('button', { name: /edit workout 2/i }).closest('[draggable="true"]') as HTMLElement;
        expect(workoutOne).toBeTruthy();
        expect(workoutTwo).toBeTruthy();

        const dataTransfer = {
            data: {} as Record<string, string>,
            dropEffect: 'move',
            effectAllowed: 'move',
            files: [],
            items: [],
            types: [],
            setData(format: string, value: string) {
                this.data[format] = value;
            },
            getData(format: string) {
                return this.data[format] ?? '';
            },
            clearData() {
                this.data = {};
            },
            setDragImage() {},
        } as unknown as DataTransfer;

        fireEvent.dragStart(workoutOne, { dataTransfer });
        fireEvent.dragOver(workoutTwo, { dataTransfer });
        fireEvent.drop(workoutTwo, { dataTransfer });

        expect(useWorkoutStore.getState().editingSessionDraft?.nodes.map((node) => node.name)).toEqual([
            'Rest 1',
            'Workout 1',
            'Workout 2',
        ]);
    });

    it('supports touch-friendly node movement controls', () => {
        render(<SessionBuilder />);

        fireEvent.click(screen.getByRole('button', { name: /^new session$/i }));
        const createDialog = screen.getByRole('dialog', { name: /create a new session/i });
        fireEvent.change(within(createDialog).getByLabelText(/session name/i), { target: { value: 'Touch Session' } });
        fireEvent.click(screen.getByRole('button', { name: /create session/i }));
        fireEvent.click(screen.getByRole('button', { name: /^add workout$/i }));
        fireEvent.click(screen.getByRole('button', { name: /^add rest$/i }));
        fireEvent.click(screen.getByRole('button', { name: /^add workout$/i }));

        fireEvent.click(screen.getByRole('button', { name: /move rest 1 left/i }));
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes.map((node) => node.name)).toEqual([
            'Rest 1',
            'Workout 1',
            'Workout 2',
        ]);

        fireEvent.click(screen.getByRole('button', { name: /move rest 1 right/i }));
        expect(useWorkoutStore.getState().editingSessionDraft?.nodes.map((node) => node.name)).toEqual([
            'Workout 1',
            'Rest 1',
            'Workout 2',
        ]);
    });
});
