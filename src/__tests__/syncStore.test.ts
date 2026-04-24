import { act } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useAccountStore } from '@/store/useAccountStore';
import { useSyncStore } from '@/store/useSyncStore';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import {
    buildAccountEntitlementFromSupabaseRow,
    buildAccountProfileFromSupabaseRow,
    buildAccountStateFromSupabaseRows,
} from '@/utils/account';
import { createSavedSession, createWorkoutSessionNode } from '@/utils/savedSessions';
import { createSavedWorkout } from '@/utils/savedWorkouts';
import { toSupabaseSavedSessionWriteRow, toSupabaseSavedWorkoutWriteRow } from '@/utils/sync';

const resetAccountStore = () => {
    useAccountStore.getState().clearAccountState();
    useAccountStore.setState({
        bootstrapStatus: 'idle',
        mode: 'guest',
        session: null,
        profile: null,
        entitlement: null,
        syncStatus: 'disabled',
        error: null,
    });
};

const resetWorkoutStore = () => {
    useWorkoutStore.setState({
        settings: {
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
        sets: '',
        reps: '',
        seconds: '',
        rest: '',
        myoReps: '',
        myoWorkSecs: '',
        savedWorkouts: [],
        selectedSavedWorkoutId: null,
        lastImportSummary: null,
        savedSessions: [],
        selectedSavedSessionId: null,
        setupMode: 'workout',
        editingSessionId: null,
        editingSessionDraft: null,
        editingSessionNodeId: null,
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
        activeSessionId: null,
        activeSessionNodeIndex: 0,
        sessionStatus: 'idle',
        isRunningSession: false,
        sessionNodeRuntimeType: null,
        sessionRestTimeLeft: 0,
        sessionLastTickSecond: -1,
        completedSessionWorkoutNodeIds: [],
        showSettings: false,
        isSidebarCollapsed: false,
        theme: 'theme-default',
    });
};

const resetSyncStore = () => {
    useSyncStore.setState({
        syncEnabled: false,
        firstSyncState: 'idle',
        currentUserId: null,
        onboardingRemoteHasData: false,
        recoveryBackup: null,
        pendingChoice: null,
        queuedOperations: [],
        lastSyncedAt: null,
        queueStatus: 'idle',
        syncError: null,
        authExpired: false,
        pendingCounts: { total: 0, workouts: 0, sessions: 0, deletes: 0 },
        hydrateComplete: true,
    });
};

describe('sync store behavior', () => {
    beforeEach(() => {
        resetAccountStore();
        resetWorkoutStore();
        resetSyncStore();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('maps Supabase rows into local account state', () => {
        const session = {
            user: {
                id: 'user-1',
                email: 'athlete@example.com',
                created_at: '2026-03-01T00:00:00.000Z',
                user_metadata: {
                    full_name: 'Athlete One',
                },
            },
        } as Session;

        expect(buildAccountProfileFromSupabaseRow({
            id: 'user-1',
            email: 'athlete@example.com',
            display_name: 'Athlete One',
            created_at: '2026-03-01T00:00:00.000Z',
            updated_at: '2026-03-02T00:00:00.000Z',
        })).toMatchObject({
            userId: 'user-1',
            email: 'athlete@example.com',
            displayName: 'Athlete One',
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-02T00:00:00.000Z',
        });

        expect(buildAccountEntitlementFromSupabaseRow({
            user_id: 'user-1',
            plan: 'plus',
            cloud_sync_enabled: true,
            updated_at: '2026-03-03T00:00:00.000Z',
        })).toMatchObject({
            userId: 'user-1',
            plan: 'plus',
            cloudSyncEnabled: true,
            source: 'supabase',
        });

        expect(buildAccountStateFromSupabaseRows(
            session,
            {
                id: 'user-1',
                email: 'athlete@example.com',
                display_name: 'Athlete One',
                created_at: '2026-03-01T00:00:00.000Z',
                updated_at: '2026-03-02T00:00:00.000Z',
            },
            {
                user_id: 'user-1',
                plan: 'plus',
                cloud_sync_enabled: true,
                updated_at: '2026-03-03T00:00:00.000Z',
            },
        )).toMatchObject({
            mode: 'signed-in-plus',
            syncStatus: 'idle',
            profile: {
                userId: 'user-1',
                displayName: 'Athlete One',
            },
            entitlement: {
                userId: 'user-1',
                plan: 'plus',
                cloudSyncEnabled: true,
                source: 'supabase',
            },
        });
    });

    it('keeps account store transitions local-first and sync-aware', () => {
        const session = {
            user: {
                id: 'user-2',
                email: 'free@example.com',
                created_at: '2026-03-01T00:00:00.000Z',
                user_metadata: {},
            },
        } as Session;

        act(() => {
            useAccountStore.getState().applySession(session);
        });

        expect(useAccountStore.getState()).toMatchObject({
            mode: 'signed-in-free',
            syncStatus: 'disabled',
            profile: {
                userId: 'user-2',
                email: 'free@example.com',
            },
        });

        act(() => {
            useAccountStore.getState().setEntitlement({
                userId: 'user-2',
                plan: 'plus',
                cloudSyncEnabled: true,
                updatedAt: '2026-03-04T00:00:00.000Z',
                source: 'supabase',
            });
        });

        expect(useAccountStore.getState()).toMatchObject({
            mode: 'signed-in-plus',
            syncStatus: 'idle',
            entitlement: {
                plan: 'plus',
                cloudSyncEnabled: true,
                source: 'supabase',
            },
        });

        act(() => {
            useAccountStore.getState().markError('Bootstrap failed');
        });
        expect(useAccountStore.getState()).toMatchObject({
            bootstrapStatus: 'error',
            syncStatus: 'error',
            error: 'Bootstrap failed',
            mode: 'signed-in-plus',
        });

        act(() => {
            useAccountStore.getState().clearAccountState();
        });
        expect(useAccountStore.getState()).toMatchObject({
            bootstrapStatus: 'idle',
            mode: 'guest',
            syncStatus: 'disabled',
            session: null,
        });
    });

    it('keeps synced workout writes and session drafts dirty when they are edited locally', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-01T12:00:00.000Z'));

        const workoutConfig = {
            sets: '3',
            reps: '12',
            seconds: '3',
            rest: '20',
            myoReps: '4',
            myoWorkSecs: '2',
        };
        const workout = createSavedWorkout('Push Day', workoutConfig, '2026-03-30T00:00:00.000Z');
        const syncedWorkout = {
            ...workout,
            sync: {
                ...workout.sync!,
                remoteId: 'remote-workout-1',
                revision: 3,
                dirty: false,
                lastSyncedAt: '2026-03-31T00:00:00.000Z',
            },
        };

        act(() => {
            useWorkoutStore.setState({
                savedWorkouts: [syncedWorkout],
                selectedSavedWorkoutId: syncedWorkout.id,
            });
        });

        const workoutSave = useWorkoutStore.getState().saveWorkoutFromConfig(
            'Push Day Updated',
            workoutConfig,
            syncedWorkout.id,
        );

        expect(workoutSave.ok).toBe(true);
        expect(useWorkoutStore.getState().savedWorkouts[0]).toMatchObject({
            id: syncedWorkout.id,
            name: 'Push Day Updated',
            updatedAt: '2026-04-01T12:00:00.000Z',
            sync: {
                localId: syncedWorkout.id,
                remoteId: 'remote-workout-1',
                revision: 4,
                updatedAt: '2026-04-01T12:00:00.000Z',
                dirty: true,
                pendingDelete: false,
                deletedAt: null,
                lastSyncedAt: '2026-03-31T00:00:00.000Z',
            },
        });

        const sessionNode = createWorkoutSessionNode(
            'Workout Node',
            workoutConfig,
            '2026-03-30T00:00:00.000Z',
        );
        const session = createSavedSession('Session One', [sessionNode], '2026-03-30T00:00:00.000Z');
        const syncedSession = {
            ...session,
            sync: {
                ...session.sync!,
                remoteId: 'remote-session-1',
                revision: 2,
                dirty: false,
                lastSyncedAt: '2026-03-31T00:00:00.000Z',
            },
        };

        act(() => {
            useWorkoutStore.setState({
                savedSessions: [syncedSession],
                editingSessionDraft: syncedSession,
                editingSessionId: syncedSession.id,
                selectedSavedSessionId: syncedSession.id,
                setupMode: 'session',
            });
        });

        const sessionSave = useWorkoutStore.getState().saveSessionDraft('Session One Updated');

        expect(sessionSave.ok).toBe(true);
        expect(useWorkoutStore.getState().savedSessions[0]).toMatchObject({
            id: syncedSession.id,
            name: 'Session One Updated',
            updatedAt: '2026-04-01T12:00:00.000Z',
            sync: {
                localId: syncedSession.id,
                remoteId: 'remote-session-1',
                revision: 3,
                updatedAt: '2026-04-01T12:00:00.000Z',
                dirty: true,
                pendingDelete: false,
                deletedAt: null,
                lastSyncedAt: '2026-03-31T00:00:00.000Z',
            },
        });
    });

    it('serializes local sync metadata into Supabase write rows', () => {
        const workout = createSavedWorkout('Push Day', {
            sets: '3',
            reps: '12',
            seconds: '3',
            rest: '20',
            myoReps: '4',
            myoWorkSecs: '2',
        }, '2026-03-30T00:00:00.000Z');
        const session = createSavedSession(
            'Session One',
            [
                createWorkoutSessionNode(
                    'Workout Node',
                    {
                        sets: '3',
                        reps: '12',
                        seconds: '3',
                        rest: '20',
                        myoReps: '4',
                        myoWorkSecs: '2',
                    },
                    '2026-03-30T00:00:00.000Z',
                ),
            ],
            '2026-03-30T00:00:00.000Z',
        );

        const syncedWorkout = {
            ...workout,
            sync: {
                ...workout.sync!,
                remoteId: 'remote-workout-2',
                revision: 6,
                dirty: false,
                pendingDelete: true,
                deletedAt: '2026-04-01T00:00:00.000Z',
                lastSyncedAt: '2026-03-31T00:00:00.000Z',
            },
        };
        const syncedSession = {
            ...session,
            sync: {
                ...session.sync!,
                remoteId: 'remote-session-2',
                revision: 5,
                dirty: false,
                pendingDelete: true,
                deletedAt: '2026-04-01T00:00:00.000Z',
                lastSyncedAt: '2026-03-31T00:00:00.000Z',
            },
        };

        expect(toSupabaseSavedWorkoutWriteRow(syncedWorkout, 'user-1')).toEqual({
            id: 'remote-workout-2',
            user_id: 'user-1',
            local_id: syncedWorkout.id,
            name: 'Push Day',
            sets: '3',
            reps: '12',
            seconds: '3',
            rest: '20',
            myo_reps: '4',
            myo_work_secs: '2',
            times_used: 0,
            last_used_at: null,
            revision: 6,
            updated_at: '2026-03-30T00:00:00.000Z',
            deleted_at: '2026-04-01T00:00:00.000Z',
        });

        expect(toSupabaseSavedSessionWriteRow(syncedSession, 'user-1')).toEqual({
            id: 'remote-session-2',
            user_id: 'user-1',
            local_id: syncedSession.id,
            name: 'Session One',
            nodes: expect.any(Array),
            times_used: 0,
            last_used_at: null,
            revision: 5,
            updated_at: '2026-03-30T00:00:00.000Z',
            deleted_at: '2026-04-01T00:00:00.000Z',
        });
    });

    it('dedupes repeated queue entries for the same entity to the newest write', () => {
        act(() => {
            useSyncStore.setState({ syncEnabled: true });
            useSyncStore.getState().enqueueEntityChange({
                entityType: 'workout',
                entityId: 'workout-1',
                localId: 'workout-1',
                operation: 'upsert',
                revision: 2,
                queuedAt: '2026-04-12T09:00:00.000Z',
            });
            useSyncStore.getState().enqueueEntityChange({
                entityType: 'workout',
                entityId: 'workout-1',
                localId: 'workout-1',
                operation: 'upsert',
                revision: 3,
                queuedAt: '2026-04-12T09:05:00.000Z',
            });
        });

        expect(useSyncStore.getState().queuedOperations).toHaveLength(1);
        expect(useSyncStore.getState().queuedOperations[0]).toMatchObject({
            revision: 3,
            queuedAt: '2026-04-12T09:05:00.000Z',
        });
        expect(useSyncStore.getState().pendingCounts).toMatchObject({
            total: 1,
            workouts: 1,
            deletes: 0,
        });
    });

    it('clears queued work when sync is turned off on the device', () => {
        act(() => {
            useSyncStore.setState({ syncEnabled: true });
            useSyncStore.getState().enqueueEntityChange({
                entityType: 'session',
                entityId: 'session-1',
                localId: 'session-1',
                operation: 'delete',
                revision: 4,
            });
            useSyncStore.getState().disableSync();
        });

        expect(useSyncStore.getState()).toMatchObject({
            syncEnabled: false,
            queueStatus: 'idle',
            queuedOperations: [],
            pendingCounts: {
                total: 0,
                workouts: 0,
                sessions: 0,
                deletes: 0,
            },
        });
    });
});
