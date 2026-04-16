import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { useAccountStore } from '@/store/useAccountStore';
import { audioEngine } from '@/utils/audioEngine';
import TimerWorker from '@/utils/timerWorker?worker&inline';
import Sidebar from '@/components/Sidebar';
import SettingsPanel from '@/components/SettingsPanel';
import ProtocolIntelModal from '@/components/ProtocolIntelModal';
import ConcentricTimer from '@/components/ConcentricTimer';
import SessionBuilder from '@/components/SessionBuilder';
import SetupModeToggle from '@/components/SetupModeToggle';
import SupabaseBootstrap from '@/components/SupabaseBootstrap';
import SupabaseStatusPill from '@/components/SupabaseStatusPill';
import { useSyncController } from '@/hooks/useSyncController';
import { Capacitor } from '@capacitor/core';
import {
    openBillingPortal,
    refreshBillingEntitlementState,
    startBillingCheckout,
} from '@/lib/billing';
import { initializePaddleCheckoutFromQuery } from '@/lib/paddle';
import { getSupabaseAuthRedirectUrl, getSupabaseClient } from '@/lib/supabase';
import { sendSupabaseMagicLink, signOutSupabase } from '@/lib/supabaseAccount';
import { Play, Square, RotateCcw, ChevronRight, Zap, Activity, Volume2, Menu, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { APP_VERSION } from '@/constants/version';
import { canAccessSessionBuilder } from '@/utils/account';
import { normalizeSetsInput } from '@/utils/savedWorkouts';
import type { AccountActionResult, AccountSnapshot } from '@/types/account';

const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const isBurnoutRepSet = (params: { timerStatus: string; isWorking: boolean; seconds: string; myoWorkSecs: string; }) => {
    if (!params.isWorking) return false;
    if (params.timerStatus !== 'Main Set' && params.timerStatus !== 'Myo Reps') return false;
    const activeRepSeconds = params.timerStatus === 'Main Set'
        ? parseInt(params.seconds || '0', 10)
        : parseInt(params.myoWorkSecs || '0', 10);
    return activeRepSeconds === 1;
};

type AppDialogState =
    | {
        kind: 'prompt' | 'confirm' | 'message';
        title: string;
        description: string;
        confirmLabel: string;
        cancelLabel?: string;
        value?: string;
        tone?: 'default' | 'danger';
        inputLabel?: string;
    }
    | null;

interface AppDialogProps {
    state: AppDialogState;
    value: string;
    onChangeValue: (value: string) => void;
    onClose: () => void;
    onConfirm: () => void;
}

const AppDialog = ({ state, value, onChangeValue, onClose, onConfirm }: AppDialogProps) => {
    if (!state) {
        return null;
    }

    const isPrompt = state.kind === 'prompt';
    const isMessage = state.kind === 'message';

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={state.title}
            className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 px-[max(1rem,var(--safe-left))] py-[max(1rem,var(--safe-bottom))] backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div className="max-h-[calc(var(--viewport-dynamic)-var(--safe-top)-var(--safe-bottom)-1rem)] w-full max-w-md overflow-y-auto rounded-[28px] border border-border/60 bg-background/95 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.45)] scroll-contain-y sm:p-6">
                <div className="space-y-2">
                    <div className="text-[11px] font-black uppercase tracking-[0.32em] text-primary">
                        {isPrompt ? 'Name Action' : isMessage ? 'Status' : 'Confirm Action'}
                    </div>
                    <h2 className="text-2xl font-black italic tracking-tight text-foreground">
                        {state.title}
                    </h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        {state.description}
                    </p>
                </div>

                {isPrompt && (
                    <div className="mt-5 space-y-2">
                        <Label htmlFor="app-dialog-input" className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                            {state.inputLabel ?? 'Name'}
                        </Label>
                        <Input
                            id="app-dialog-input"
                            value={value}
                            onChange={(event) => onChangeValue(event.target.value)}
                            autoFocus
                        />
                    </div>
                )}

                <div className={cn('mt-6 grid gap-2', isMessage ? 'grid-cols-1' : 'grid-cols-2')}>
                    {!isMessage && (
                        <Button type="button" variant="secondary" onClick={onClose} className="rounded-2xl font-black italic tracking-tighter">
                            {state.cancelLabel ?? 'Cancel'}
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant={state.tone === 'danger' ? 'destructive' : 'default'}
                        onClick={onConfirm}
                        className="rounded-2xl font-black italic tracking-tighter"
                    >
                        {state.confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default function App() {
    const {
        settings, sets, reps, seconds, rest, myoReps, myoWorkSecs, setWorkoutConfig,
        savedWorkouts, savedSessions, selectedSavedWorkoutId, lastImportSummary,
        activeSessionId, activeSessionNodeIndex, sessionStatus, isRunningSession, sessionNodeRuntimeType, completeSessionNode,
        appPhase, timerStatus, isTimerRunning, setIsTimerRunning,
        currentSet, currentRep, isMainRep, isWorking, timeLeft, setTotalDuration, setElapsedTime,
        startWorkout, resetWorkout, advanceCycle, updateTimerBaselines,
        saveCurrentWorkout, saveCurrentWorkoutAs, loadWorkout, renameWorkout, deleteWorkout, exportSavedWorkouts, importSavedWorkouts, clearImportSummary,
        createSession, loadSessionForEditing, duplicateSession, renameSession, deleteSession,
        setupMode, setSetupMode, showSettings, setShowSettings, setSettings,
        isSidebarCollapsed, setIsSidebarCollapsed, theme, setTheme
    } = useWorkoutStore();
    const {
        applyAccountState,
        bootstrapStatus,
        mode,
        session,
        profile,
        entitlement,
        syncStatus,
        error,
    } = useAccountStore();
    const [showProtocolIntel, setShowProtocolIntel] = useState(false);
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const [dialogState, setDialogState] = useState<AppDialogState>(null);
    const [dialogValue, setDialogValue] = useState('');
    const [backgroundPauseNotice, setBackgroundPauseNotice] = useState<string | null>(null);
    const isSingleCycle = parseInt(sets, 10) === 1;
    const workerRef = useRef<Worker | null>(null);
    const baseTimeLeft = useRef(0);
    const baseSetElapsedTime = useRef(0);
    const lastSpokenSecondRef = useRef(-1);
    const prepAnnouncedRef = useRef(false);
    const dialogConfirmRef = useRef<((value: string) => void) | null>(null);
    const loadedWorkout = selectedSavedWorkoutId ? savedWorkouts.find((workout) => workout.id === selectedSavedWorkoutId) ?? null : null;
    const activeSession = activeSessionId ? savedSessions.find((session) => session.id === activeSessionId) ?? null : null;
    const activeSessionNode = activeSession?.nodes[activeSessionNodeIndex] ?? null;
    const sessionRestDuration = activeSessionNode?.type === 'rest' ? parseInt(activeSessionNode.seconds || '0', 10) : null;
    const canUseSessionBuilder = canAccessSessionBuilder(entitlement);
    const isSessionSetup = appPhase === 'setup' && setupMode === 'session' && canUseSessionBuilder;
    const isPreparing = timerStatus === 'Preparing';
    const isSidebarOpen = !isSidebarCollapsed;
    const account = useMemo<AccountSnapshot>(() => ({
        bootstrapStatus,
        mode,
        session,
        profile,
        entitlement,
        syncStatus,
        error,
    }), [bootstrapStatus, entitlement, error, mode, profile, session, syncStatus]);
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const mediaQuery = window.matchMedia('(max-width: 767px)');
        const handleViewportChange = (event: MediaQueryListEvent | MediaQueryList) => {
            setIsMobileViewport(event.matches);
            if (event.matches) setIsSidebarCollapsed(true);
        };
        handleViewportChange(mediaQuery);
        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handleViewportChange);
            return () => mediaQuery.removeEventListener('change', handleViewportChange);
        }
        mediaQuery.addListener(handleViewportChange);
        return () => mediaQuery.removeListener(handleViewportChange);
    }, [setIsSidebarCollapsed]);

    useEffect(() => {
        const worker = new TimerWorker();
        workerRef.current = worker;
        worker.onmessage = (e) => {
            if (e.data.action === 'tick') {
                const elapsedSecs = e.data.elapsed / 1000;
                updateTimerBaselines(Math.max(0, baseTimeLeft.current - elapsedSecs), baseSetElapsedTime.current + elapsedSecs);
            }
        };
        return () => worker.terminate();
    }, [updateTimerBaselines]);

    useEffect(() => {
        if (!workerRef.current) return;
        if (isTimerRunning) {
            if (timeLeft > 0.001) {
                workerRef.current.postMessage({ action: 'start', interval: settings.smoothAnimation ? 50 : 250 });
            } else if (timerStatus !== 'Finished') {
                workerRef.current.postMessage({ action: 'stop' });
                baseSetElapsedTime.current = setElapsedTime;
                if (isRunningSession && sessionNodeRuntimeType === 'rest') completeSessionNode();
                else advanceCycle();
            }
        } else {
            workerRef.current.postMessage({ action: 'stop' });
        }
    }, [isTimerRunning, timeLeft <= 0.001, timerStatus, advanceCycle, completeSessionNode, isRunningSession, sessionNodeRuntimeType, settings.smoothAnimation]);

    useEffect(() => {
        if (isRunningSession && sessionNodeRuntimeType === 'workout' && sessionStatus === 'running' && timerStatus === 'Finished') completeSessionNode();
    }, [completeSessionNode, isRunningSession, sessionNodeRuntimeType, sessionStatus, timerStatus]);

    useEffect(() => {
        baseTimeLeft.current = timeLeft;
        if (setElapsedTime === 0) baseSetElapsedTime.current = 0;
        lastSpokenSecondRef.current = -1;
    }, [timerStatus, currentRep, isWorking, isMainRep]);

    useEffect(() => {
        if (isTimerRunning && settings.metronomeEnabled && isWorking && timerStatus !== 'Preparing') {
            const currentSecond = Math.ceil(timeLeft);
            if (currentSecond !== lastSpokenSecondRef.current && currentSecond >= 0) {
                const activeRepTarget = isMainRep ? parseInt(reps || '0', 10) : parseInt(myoReps || '0', 10);
                const suppressVoice = isBurnoutRepSet({ timerStatus, isWorking, seconds, myoWorkSecs });
                const shouldSpeakCurrentSecond = settings.ttsEnabled && !suppressVoice && currentSecond >= 1 && (currentSecond > 1 || activeRepTarget !== 1);
                if (shouldSpeakCurrentSecond) audioEngine.speak(currentSecond);
                if (settings.metronomeEnabled) audioEngine.playTick(settings.metronomeSound);
                lastSpokenSecondRef.current = currentSecond;
            }
        } else if (timerStatus !== 'Preparing') {
            lastSpokenSecondRef.current = -1;
        }
    }, [timeLeft, isTimerRunning, settings, isWorking, timerStatus, isMainRep, reps, myoReps]);

    useEffect(() => {
        if (timerStatus !== 'Preparing' || !isTimerRunning) {
            prepAnnouncedRef.current = false;
            return;
        }
        if (!prepAnnouncedRef.current) {
            if (settings.ttsEnabled) audioEngine.speak('Ready');
            prepAnnouncedRef.current = true;
        }
    }, [timerStatus, isTimerRunning, settings.ttsEnabled]);
    useEffect(() => {
        if (typeof document === 'undefined') {
            return undefined;
        }

        const pauseForBackground = () => {
            if (!isTimerRunning) {
                return;
            }

            setIsTimerRunning(false);
            setBackgroundPauseNotice('Timer paused while the app was in the background. Resume when ready.');
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                pauseForBackground();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', pauseForBackground);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', pauseForBackground);
        };
    }, [isTimerRunning, setIsTimerRunning]);
    useEffect(() => {
        if (isTimerRunning && backgroundPauseNotice) {
            setBackgroundPauseNotice(null);
        }
    }, [backgroundPauseNotice, isTimerRunning]);

    const closeDialog = useCallback(() => {
        setDialogState(null);
        setDialogValue('');
        dialogConfirmRef.current = null;
    }, []);
    const openMessageDialog = useCallback((
        title: string,
        description: string,
        confirmLabel = 'Close',
        onConfirmAction?: () => void,
    ) => {
        dialogConfirmRef.current = onConfirmAction ? () => onConfirmAction() : null;
        setDialogValue('');
        setDialogState({
            kind: 'message',
            title,
            description,
            confirmLabel,
        });
    }, []);
    const openPromptDialog = useCallback((options: {
        title: string;
        description: string;
        value?: string;
        confirmLabel: string;
        inputLabel?: string;
        tone?: 'default' | 'danger';
        onConfirm: (value: string) => void;
    }) => {
        dialogConfirmRef.current = options.onConfirm;
        setDialogValue(options.value ?? '');
        setDialogState({
            kind: 'prompt',
            title: options.title,
            description: options.description,
            value: options.value,
            confirmLabel: options.confirmLabel,
            inputLabel: options.inputLabel,
            tone: options.tone,
        });
    }, []);
    const openConfirmDialog = useCallback((options: {
        title: string;
        description: string;
        confirmLabel: string;
        cancelLabel?: string;
        tone?: 'default' | 'danger';
        onConfirm: () => void;
    }) => {
        dialogConfirmRef.current = () => options.onConfirm();
        setDialogValue('');
        setDialogState({
            kind: 'confirm',
            title: options.title,
            description: options.description,
            confirmLabel: options.confirmLabel,
            cancelLabel: options.cancelLabel,
            tone: options.tone,
        });
    }, []);
    const handleDialogConfirm = useCallback(() => {
        const callback = dialogConfirmRef.current;
        const value = dialogValue;
        closeDialog();
        callback?.(value);
    }, [closeDialog, dialogValue]);
    const toggleSidebar = useCallback(() => setIsSidebarCollapsed(!isSidebarCollapsed), [isSidebarCollapsed, setIsSidebarCollapsed]);
    const handleSaveWorkout = useCallback(() => {
        openPromptDialog({
            title: 'Save workout',
            description: 'Name the current workout template before adding it to your library.',
            value: loadedWorkout?.name ?? '',
            confirmLabel: 'Save Workout',
            inputLabel: 'Workout Name',
            onConfirm: (workoutName) => {
                if (!workoutName.trim()) {
                    return;
                }
                const result = saveCurrentWorkout(workoutName);
                if (!result.ok) openMessageDialog('Could not save workout', result.error ?? 'Could not save workout.');
            },
        });
    }, [loadedWorkout?.name, openMessageDialog, openPromptDialog, saveCurrentWorkout]);
    const handleSaveWorkoutAs = useCallback(() => {
        openPromptDialog({
            title: 'Save workout as',
            description: 'Create a named copy of the current workout without replacing the original.',
            value: loadedWorkout?.name ?? '',
            confirmLabel: 'Save Copy',
            inputLabel: 'Workout Name',
            onConfirm: (workoutName) => {
                if (!workoutName.trim()) {
                    return;
                }
                const result = saveCurrentWorkoutAs(workoutName);
                if (!result.ok) openMessageDialog('Could not save workout', result.error ?? 'Could not save workout.');
            },
        });
    }, [loadedWorkout?.name, openMessageDialog, openPromptDialog, saveCurrentWorkoutAs]);
    const handleLoadWorkout = useCallback((id: string) => {
        const result = loadWorkout(id);
        if (!result.ok) openMessageDialog('Could not load workout', result.error ?? 'Could not load workout.');
    }, [loadWorkout, openMessageDialog]);
    const handleRenameWorkout = useCallback((id: string) => {
        const workout = savedWorkouts.find((entry) => entry.id === id);
        openPromptDialog({
            title: 'Rename workout',
            description: 'Update the workout name without changing the underlying configuration.',
            value: workout?.name ?? '',
            confirmLabel: 'Rename Workout',
            inputLabel: 'Workout Name',
            onConfirm: (nextName) => {
                if (!nextName.trim()) {
                    return;
                }
                const result = renameWorkout(id, nextName);
                if (!result.ok) openMessageDialog('Could not rename workout', result.error ?? 'Could not rename workout.');
            },
        });
    }, [openMessageDialog, openPromptDialog, renameWorkout, savedWorkouts]);
    const handleDeleteWorkout = useCallback((id: string) => {
        const workout = savedWorkouts.find((entry) => entry.id === id);
        openConfirmDialog({
            title: 'Delete workout',
            description: `Delete "${workout?.name ?? 'this workout'}" from your workout library?`,
            confirmLabel: 'Delete Workout',
            tone: 'danger',
            onConfirm: () => deleteWorkout(id),
        });
    }, [deleteWorkout, openConfirmDialog, savedWorkouts]);
    const handleExportWorkouts = useCallback(() => {
        const payload = exportSavedWorkouts();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `myorep-workouts-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }, [exportSavedWorkouts]);
    const handleUpgradeToPlus = useCallback(async (): Promise<AccountActionResult> => {
        if (account.mode === 'guest') {
            setIsSidebarCollapsed(false);
            return {
                ok: false,
                message: 'Sign in first from the account card, then upgrade to Plus.',
            };
        }

        return startBillingCheckout();
    }, [account.mode, setIsSidebarCollapsed]);
    const handleManageSubscription = useCallback(async (): Promise<AccountActionResult> => {
        if (account.mode !== 'signed-in-plus') {
            return {
                ok: false,
                message: 'Upgrade to Plus before managing a subscription.',
            };
        }

        return openBillingPortal();
    }, [account.mode]);
    const handleSessionBuilderLocked = useCallback(() => {
        if (account.mode === 'guest') {
            setIsSidebarCollapsed(false);
            openMessageDialog(
                'Sign in to unlock Session Builder',
                'Session Builder is a Plus feature. Sign in from the account card, then upgrade to Plus to build and save sessions.',
                'Open account',
                () => setIsSidebarCollapsed(false),
            );
            return;
        }

        openMessageDialog(
            'Plus required for Session Builder',
            'Session Builder is included with Plus. Upgrade to start building and saving multi-node workout sessions.',
            'Upgrade to Plus',
            () => {
                void handleUpgradeToPlus();
            },
        );
    }, [account.mode, handleUpgradeToPlus, openMessageDialog, setIsSidebarCollapsed]);
    const handleCreateSession = useCallback(() => {
        if (!canUseSessionBuilder) {
            handleSessionBuilderLocked();
            return;
        }

        openPromptDialog({
            title: 'Create session',
            description: 'Start a new touch-first session flow with a clear session name.',
            value: 'New Session',
            confirmLabel: 'Create Session',
            inputLabel: 'Session Name',
            onConfirm: (name) => {
                if (!name.trim()) {
                    return;
                }
                const result = createSession(name);
                if (!result.ok) openMessageDialog('Could not create session', result.error ?? 'Could not create session.');
            },
        });
    }, [canUseSessionBuilder, createSession, handleSessionBuilderLocked, openMessageDialog, openPromptDialog]);
    const handleLoadSession = useCallback((id: string) => {
        if (!canUseSessionBuilder) {
            handleSessionBuilderLocked();
            return;
        }

        const result = loadSessionForEditing(id);
        if (!result.ok) openMessageDialog('Could not load session', result.error ?? 'Could not load session.');
    }, [canUseSessionBuilder, handleSessionBuilderLocked, loadSessionForEditing, openMessageDialog]);
    const handleDuplicateSession = useCallback((id: string) => {
        if (!canUseSessionBuilder) {
            handleSessionBuilderLocked();
            return;
        }

        const session = savedSessions.find((entry) => entry.id === id);
        openPromptDialog({
            title: 'Duplicate session',
            description: 'Create a named copy of this session in your library.',
            value: `${session?.name ?? 'Session'} Copy`,
            confirmLabel: 'Duplicate Session',
            inputLabel: 'Session Name',
            onConfirm: (name) => {
                if (!name.trim()) {
                    return;
                }
                const result = duplicateSession(id, name);
                if (!result.ok) openMessageDialog('Could not duplicate session', result.error ?? 'Could not duplicate session.');
            },
        });
    }, [canUseSessionBuilder, duplicateSession, handleSessionBuilderLocked, openMessageDialog, openPromptDialog, savedSessions]);
    const handleRenameSession = useCallback((id: string) => {
        if (!canUseSessionBuilder) {
            handleSessionBuilderLocked();
            return;
        }

        const session = savedSessions.find((entry) => entry.id === id);
        openPromptDialog({
            title: 'Rename session',
            description: 'Update the session name without changing its node sequence.',
            value: session?.name ?? '',
            confirmLabel: 'Rename Session',
            inputLabel: 'Session Name',
            onConfirm: (name) => {
                if (!name.trim()) {
                    return;
                }
                const result = renameSession(id, name);
                if (!result.ok) openMessageDialog('Could not rename session', result.error ?? 'Could not rename session.');
            },
        });
    }, [canUseSessionBuilder, handleSessionBuilderLocked, openMessageDialog, openPromptDialog, renameSession, savedSessions]);
    const handleDeleteSession = useCallback((id: string) => {
        if (!canUseSessionBuilder) {
            handleSessionBuilderLocked();
            return;
        }

        const session = savedSessions.find((entry) => entry.id === id);
        openConfirmDialog({
            title: 'Delete session',
            description: `Delete "${session?.name ?? 'this session'}" from your session library?`,
            confirmLabel: 'Delete Session',
            tone: 'danger',
            onConfirm: () => deleteSession(id),
        });
    }, [canUseSessionBuilder, deleteSession, handleSessionBuilderLocked, openConfirmDialog, savedSessions]);
    const handleSetupModeChange = useCallback((nextMode: 'workout' | 'session') => {
        if (nextMode === 'session' && !canUseSessionBuilder) {
            handleSessionBuilderLocked();
            return;
        }

        setSetupMode(nextMode);
    }, [canUseSessionBuilder, handleSessionBuilderLocked, setSetupMode]);
    const handleSendMagicLink = useCallback(async (email: string): Promise<AccountActionResult> => {
        const client = getSupabaseClient();
        if (!client) {
            return { ok: false, message: 'Supabase is not configured for this build.' };
        }

        const normalizedEmail = email.trim();
        const result = await sendSupabaseMagicLink(
            client,
            normalizedEmail,
            getSupabaseAuthRedirectUrl({
                native: Capacitor.isNativePlatform(),
                origin: window.location.origin,
            }),
        );
        if (!result.ok) {
            return { ok: false, message: result.error ?? 'Could not send magic link.' };
        }

        return { ok: true, message: `Magic link sent to ${normalizedEmail}.` };
    }, []);
    const handleSignOut = useCallback(async (): Promise<AccountActionResult> => {
        const client = getSupabaseClient();
        if (!client) {
            return { ok: false, message: 'Supabase is not configured for this build.' };
        }

        const result = await signOutSupabase(client);
        if (!result.ok) {
            return { ok: false, message: result.error ?? 'Could not sign out.' };
        }

        return { ok: true, message: 'Signed out.' };
    }, []);
    const {
        visibleWorkouts,
        visibleSessions,
        syncSnapshot,
        syncActions,
    } = useSyncController({
        account,
        savedWorkouts,
        savedSessions,
        sendMagicLink: handleSendMagicLink,
    });

    useEffect(() => {
        if (setupMode === 'session' && !canUseSessionBuilder) {
            setSetupMode('workout');
        }
    }, [canUseSessionBuilder, setSetupMode, setupMode]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const url = new URL(window.location.href);
        if (!url.searchParams.get('_ptxn')) {
            return;
        }

        void initializePaddleCheckoutFromQuery().catch((error: unknown) => {
            openMessageDialog(
                'Could not open checkout',
                error instanceof Error ? error.message : 'Paddle checkout could not start from this billing link.',
            );
        });
    }, [openMessageDialog]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const url = new URL(window.location.href);
        const billingState = url.searchParams.get('billing');
        if (!billingState) {
            return;
        }

        const clearBillingParam = () => {
            url.searchParams.delete('billing');
            window.history.replaceState({}, '', url.toString());
        };

        if (billingState === 'cancel') {
            openMessageDialog('Checkout canceled', 'Your Plus upgrade was canceled before it completed.');
            clearBillingParam();
            return;
        }

        if (billingState === 'portal') {
            openMessageDialog('Subscription updated', 'Your subscription settings were updated. We refreshed your account state.');
            clearBillingParam();
            return;
        }

        if (billingState !== 'success') {
            clearBillingParam();
            return;
        }

        void refreshBillingEntitlementState()
            .then((resolvedState) => {
                if (resolvedState) {
                    applyAccountState(resolvedState);
                }

                const hasPlus = resolvedState ? canAccessSessionBuilder(resolvedState.entitlement) : canUseSessionBuilder;
                openMessageDialog(
                    hasPlus ? 'Plus activated' : 'Purchase received',
                    hasPlus
                        ? 'Your Plus access is active. Cloud sync and Session Builder are now unlocked.'
                        : 'Your purchase was received. If Plus does not appear yet, give Paddle and Supabase a moment to finish syncing.',
                );
            })
            .catch(() => {
                openMessageDialog('Purchase received', 'Your purchase was received. If Plus does not appear yet, refresh the app in a moment.');
            })
            .finally(() => {
                clearBillingParam();
            });
    }, [applyAccountState, canUseSessionBuilder, openMessageDialog]);

    return (
        <div className={cn("min-h-[100dvh] bg-background text-foreground font-sans selection:bg-primary/30 transition-colors duration-500", theme)}>
            <SupabaseBootstrap />
            {isMobileViewport && isSidebarOpen && (
                <button type="button" className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={toggleSidebar} aria-label="Close Navigation Overlay" />
            )}
            <Sidebar
                currentTheme={theme}
                setTheme={setTheme}
                setShowSettings={setShowSettings}
                onOpenProtocolIntel={() => setShowProtocolIntel(true)}
                showSettings={showSettings}
                isMobileViewport={isMobileViewport}
                isCollapsed={isSidebarCollapsed}
                toggleSidebar={toggleSidebar}
                appPhase={appPhase}
                savedWorkouts={visibleWorkouts}
                onSaveCurrent={handleSaveWorkout}
                onSaveAsCurrent={handleSaveWorkoutAs}
                onLoadWorkout={handleLoadWorkout}
                onRenameWorkout={handleRenameWorkout}
                onDeleteWorkout={handleDeleteWorkout}
                onExportWorkouts={handleExportWorkouts}
                onImportWorkouts={importSavedWorkouts}
                importSummary={lastImportSummary}
                clearImportSummary={clearImportSummary}
                savedSessions={visibleSessions}
                onCreateSession={handleCreateSession}
                onLoadSession={handleLoadSession}
                onDuplicateSession={handleDuplicateSession}
                onRenameSession={handleRenameSession}
                onDeleteSession={handleDeleteSession}
                account={account}
                syncSnapshot={syncSnapshot}
                syncActions={syncActions}
                onSendMagicLink={handleSendMagicLink}
                onSignOut={handleSignOut}
                canAccessSessionBuilder={canUseSessionBuilder}
                onUpgradeToPlus={handleUpgradeToPlus}
                onManageSubscription={handleManageSubscription}
            />
            <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />
            <ProtocolIntelModal isOpen={showProtocolIntel} onClose={() => setShowProtocolIntel(false)} />
            <main
                data-testid="app-main-shell"
                className={cn(
                    "relative overflow-x-hidden overflow-y-auto px-[max(1rem,var(--safe-left))] pb-[calc(var(--safe-bottom)+1rem)] pt-[calc(var(--safe-top)+0.75rem)] transition-[margin] duration-300 scroll-contain-y md:px-6 md:pb-0 md:pt-6",
                    isMobileViewport ? "h-dvh-safe" : "min-h-[100dvh]",
                    isSidebarCollapsed ? "md:ml-[4.5rem]" : "md:ml-72",
                    isSessionSetup ? "md:px-10 md:pt-0" : "",
                )}
            >
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-10 blur-[120px] transition-colors duration-1000" style={{ backgroundColor: timerStatus === 'Preparing' || !isWorking ? settings.restColor : settings.activeColor }} />
                <div className={cn(
                    "relative z-10 flex flex-col md:min-h-[calc(100dvh-3rem)]",
                    isMobileViewport ? "min-h-full" : "min-h-[calc(100dvh-var(--safe-top)-var(--safe-bottom)-1.75rem)]",
                )}>
                    {isMobileViewport && (
                        <header className="mb-4 flex items-center justify-between gap-3 rounded-[1.75rem] border border-border/60 bg-card/80 px-4 py-3 shadow-lg backdrop-blur-xl md:hidden">
                            <Button variant="ghost" size="icon" className="h-11 w-11 rounded-2xl" onClick={toggleSidebar} aria-label="Open Navigation"><Menu size={20} /></Button>
                            <div className="min-w-0 text-center">
                                <div className="text-[10px] font-black uppercase tracking-[0.32em] text-primary">MyoREP</div>
                                <div className="truncate text-sm font-semibold text-muted-foreground">{appPhase === 'setup' ? (isSessionSetup ? 'Session Builder' : 'Workout Setup') : timerStatus}</div>
                            </div>
                            <Button variant={showSettings ? 'default' : 'secondary'} size="icon" className="h-11 w-11 rounded-2xl" onClick={() => setShowSettings(!showSettings)} aria-label={showSettings ? 'Close Settings' : 'Open Settings'}><Settings2 size={18} /></Button>
                        </header>
                    )}
                    {appPhase === 'setup' ? (
                        isSessionSetup ? (
                            <div className="flex min-h-0 flex-1 flex-col md:rounded-none">
                                <SessionBuilder />
                            </div>
                        ) : (
                            <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col items-stretch justify-start">
                                <div
                                    data-testid="workout-setup-shell"
                                    className={cn(
                                        "w-full animate-in fade-in slide-in-from-bottom-4 duration-700",
                                        isMobileViewport ? "space-y-4 px-1 py-2" : "space-y-6 px-2 py-4 sm:px-4 sm:py-5 md:px-6 md:py-6",
                                    )}
                                >
                                    <div className={cn("mx-auto max-w-3xl text-center", isMobileViewport ? "space-y-1.5" : "space-y-2")}>
                                        <h1 className="bg-gradient-to-br from-foreground to-foreground/50 bg-clip-text text-[clamp(2.6rem,11vw,5rem)] font-black italic tracking-tighter text-transparent">
                                            Build a Workout
                                        </h1>
                                        <p className={cn(
                                            "mx-auto max-w-2xl font-medium leading-relaxed text-muted-foreground",
                                            isMobileViewport ? "text-xs" : "text-sm",
                                        )}>
                                            Configure the hypertrophy block, then save it or launch straight into the timer.
                                        </p>
                                    </div>
                                    <div className="flex justify-center">
                                        <SetupModeToggle
                                            mode={setupMode}
                                            onChange={handleSetupModeChange}
                                            className="w-full max-w-md justify-center"
                                            sessionLocked={!canUseSessionBuilder}
                                        />
                                    </div>
                                    <div className={cn(
                                        "grid",
                                        isMobileViewport ? "grid-cols-2 gap-3" : "grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3",
                                    )}>
                                        {[
                                            { label: "Total Cycles", value: sets, key: "sets", icon: RotateCcw },
                                            { label: "Activation Reps", value: reps, key: "reps", icon: Activity },
                                            { label: "Activation Pace (s)", value: seconds, key: "seconds", icon: Zap },
                                            { label: "Rest Interval", value: rest, key: "rest", icon: Square, disableWhenSingleCycle: true },
                                            { label: "Myo Reps", value: myoReps, key: "myoReps", icon: Activity, disableWhenSingleCycle: true },
                                            { label: "Myo Pace (s)", value: myoWorkSecs, key: "myoWorkSecs", icon: Zap, disableWhenSingleCycle: true },
                                        ].map((input) => (
                                            <div key={input.key} className={cn("group", isMobileViewport ? "space-y-2" : "space-y-3", isSingleCycle && input.disableWhenSingleCycle && "opacity-45")}>
                                                <div className={cn("flex items-center gap-2", isMobileViewport ? "px-0.5" : "px-1")}>
                                                    <input.icon size={14} className="text-primary" />
                                                    <Label className={cn(
                                                        "font-black uppercase text-muted-foreground transition-colors group-focus-within:text-primary",
                                                        isMobileViewport ? "text-[9px] tracking-[0.16em]" : "text-[10px] tracking-widest",
                                                    )}>{input.label}</Label>
                                                </div>
                                                <Input
                                                    type="number"
                                                    value={input.value}
                                                    onChange={(e) => {
                                                        const nextValue = input.key === 'sets' ? normalizeSetsInput(e.target.value) : e.target.value;
                                                        setWorkoutConfig({ [input.key]: nextValue });
                                                    }}
                                                    placeholder="0"
                                                    min={input.key === 'sets' ? 1 : undefined}
                                                    disabled={isSingleCycle && input.disableWhenSingleCycle}
                                                    className={cn(
                                                        "rounded-2xl border-border/50 bg-accent/30 font-black italic shadow-sm transition-all group-focus-within:border-primary/50",
                                                        isMobileViewport ? "h-12 px-3 text-lg" : "h-14 text-xl",
                                                        isSingleCycle && input.disableWhenSingleCycle && "cursor-not-allowed bg-muted/35 text-muted-foreground",
                                                    )}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div className={cn(
                                        "rounded-[24px] border border-border/60 bg-card/70",
                                        isMobileViewport ? "flex items-center justify-between gap-3 px-4 py-3" : "flex flex-col gap-4 py-2 sm:flex-row sm:items-center sm:justify-between",
                                    )}>
                                            <div className={cn("space-y-1", isMobileViewport && "min-w-0")}>
                                                <div className="flex items-center gap-2">
                                                    <Volume2 size={16} className="text-primary" />
                                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Voice Guidance</p>
                                                </div>
                                                <p className={cn(
                                                    "font-medium leading-relaxed text-muted-foreground",
                                                    isMobileViewport ? "text-[11px]" : "text-xs",
                                                )}>Toggle spoken countdowns and rep calls without opening the settings panel.</p>
                                            </div>
                                            <div className="flex items-center justify-between gap-3 sm:justify-end">
                                                <Label htmlFor="setup-voice-guidance" className="text-xs font-black uppercase tracking-widest">Voice Guidance</Label>
                                                <Switch id="setup-voice-guidance" checked={settings.ttsEnabled} onCheckedChange={(checked) => setSettings({ ttsEnabled: checked })} aria-label="Voice Guidance" />
                                            </div>
                                    </div>
                                    <Button onClick={() => { audioEngine.init(); startWorkout(); }} className={cn(
                                        "w-full rounded-3xl font-black italic tracking-tighter shadow-lg transition-all hover:scale-[1.01] hover:shadow-primary/20 active:scale-[0.99]",
                                        isMobileViewport ? "h-14 text-base" : "h-16 text-lg sm:h-20 sm:text-2xl",
                                    )}>
                                        INITIALIZE PROTOCOL <ChevronRight className="transition-transform group-hover:translate-x-1" />
                                    </Button>
                                </div>
                            </div>
                        )
                    ) : (
                        <div className={cn(
                            "flex flex-1 flex-col items-center",
                            isMobileViewport ? "justify-start overflow-y-auto" : "justify-center",
                        )}>
                            <div
                                data-testid="timer-screen-shell"
                                className={cn(
                                    "flex w-full max-w-5xl flex-1 flex-col items-center animate-in fade-in zoom-in-95 duration-500",
                                    isMobileViewport
                                        ? "justify-start space-y-4 px-1 py-2 pb-[calc(var(--safe-bottom)+1rem)]"
                                        : "justify-center space-y-5 px-2 py-4 sm:px-4 sm:py-5 md:px-6 md:py-6",
                                )}
                            >
                                {settings.fullScreenMode && (
                                    <div className="fixed inset-0 -z-10 transition-colors duration-1000" style={{ backgroundColor: timerStatus === 'Finished' ? settings.finishedColor : (timerStatus === 'Preparing' || !isWorking) ? settings.restColor : (timeLeft <= settings.concentricSecond && timeLeft > 0 ? settings.concentricColor : settings.activeColor) }} />
                                )}
                                <div className="w-full space-y-4 text-center">
                                    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                                        {isRunningSession && activeSession && !isMobileViewport && <div className="rounded-full border border-primary/30 bg-primary/20 px-4 py-1.5 text-[10px] font-black italic tracking-[0.2em] text-primary sm:text-xs sm:tracking-widest">{activeSession.name}</div>}
                                        <div className="rounded-full border border-primary/30 bg-primary/20 px-4 py-1.5 text-[10px] font-black italic tracking-[0.2em] text-primary sm:text-xs sm:tracking-widest">SET {currentSet} / {sets}</div>
                                        <div className="rounded-full border border-border bg-muted px-4 py-1.5 text-[10px] font-black italic tracking-[0.2em] text-muted-foreground sm:text-xs sm:tracking-widest">{isMainRep ? 'ACTIVATION' : 'MYO REPS'}</div>
                                        {isRunningSession && activeSessionNode && !isMobileViewport && <div className="rounded-full border border-border bg-muted px-4 py-1.5 text-[10px] font-black italic tracking-[0.2em] text-muted-foreground sm:text-xs sm:tracking-widest">NODE {activeSessionNodeIndex + 1} {activeSessionNode.type === 'rest' ? 'REST' : 'WORKOUT'}</div>}
                                    </div>
                                    <h2 className="text-4xl font-black italic uppercase tracking-tighter text-foreground drop-shadow-sm sm:text-5xl">{timerStatus}</h2>
                                    {backgroundPauseNotice && (
                                        <div className="mx-auto w-full max-w-md rounded-[1.5rem] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm font-semibold text-amber-100 shadow-lg">
                                            {backgroundPauseNotice}
                                        </div>
                                    )}
                                    {isMobileViewport && (
                                        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-4 rounded-[1.75rem] border border-border/60 bg-card/80 px-4 py-3 text-left shadow-lg backdrop-blur-xl">
                                            <div className="min-w-0">
                                                <div className="text-[10px] font-black uppercase tracking-[0.26em] text-primary">
                                                    {isRunningSession && activeSession ? activeSession.name : 'Current Block'}
                                                </div>
                                                <div className="mt-1 truncate text-sm font-semibold text-foreground">
                                                    {isRunningSession && activeSessionNode
                                                        ? `${activeSessionNodeIndex + 1}. ${activeSessionNode.name}`
                                                        : (isPreparing ? 'Get ready for the next effort.' : (isWorking ? `Rep ${currentRep}` : 'Recovery before the next effort.'))}
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">Next</div>
                                                <div className="mt-1 text-sm font-black italic tracking-tight text-foreground">
                                                    {timerStatus === 'Finished'
                                                        ? 'Done'
                                                        : (isPreparing ? 'Main Set' : (isWorking ? 'Rest' : 'Work'))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <ConcentricTimer
                                    outerValue={isPreparing
                                        ? timeLeft
                                        : (timerStatus === 'Finished'
                                            ? 0
                                            : (isWorking
                                                ? Math.max(0, setTotalDuration - setElapsedTime)
                                                : timeLeft))}
                                    outerMax={isPreparing
                                        ? settings.prepTime
                                        : (isRunningSession && sessionNodeRuntimeType === 'rest' && sessionRestDuration !== null
                                            ? sessionRestDuration
                                            : (isWorking ? Math.max(setTotalDuration, 1) : parseInt(rest || '1', 10)))}
                                    isResting={!isWorking}
                                    innerValue={timeLeft}
                                    innerMax={timerStatus === 'Preparing' ? settings.prepTime : (isMainRep ? parseInt(seconds || '0', 10) : parseInt(myoWorkSecs || '0', 10))}
                                    textMain={formatTime(Math.ceil(timeLeft))}
                                    textSub={timerStatus === 'Preparing' ? "Get Ready" : (isRunningSession && sessionNodeRuntimeType === 'rest' ? (activeSessionNode?.name ?? 'Session Rest') : (!isWorking ? "Rest Period" : (timerStatus === 'Finished' ? "Protocol Clear" : `Rep ${currentRep}`)))}
                                    isFinished={timerStatus === 'Finished'}
                                    isPreparing={timerStatus === 'Preparing'}
                                />
                                <div className="flex w-full max-w-md flex-col justify-center gap-3 pb-1 sm:max-w-none sm:flex-row sm:gap-4">
                                    <Button onClick={() => { audioEngine.init(); if (timerStatus === 'Finished') resetWorkout(); else setIsTimerRunning(!isTimerRunning); }} variant={isTimerRunning ? "secondary" : "default"} className="min-h-14 min-w-[200px] rounded-2xl px-6 text-lg font-black italic tracking-tighter shadow-md sm:h-16 sm:px-10 sm:text-xl">
                                        {timerStatus === 'Finished' ? <><RotateCcw className="mr-2" /> NEW SESSION</> : (isTimerRunning ? <><Square className="mr-2" /> PAUSE</> : <><Play className="mr-2" /> RESUME</>)}
                                    </Button>
                                    <Button onClick={resetWorkout} variant="ghost" className="min-h-14 rounded-2xl px-6 text-lg font-black italic tracking-tighter text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:h-16 sm:px-10 sm:text-xl">
                                        TERMINATE
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                    {!isSessionSetup && (
                        <footer className={cn(
                            "w-full border-t border-border/50 text-center opacity-50 transition-opacity hover:opacity-100",
                            isMobileViewport ? "mt-5 px-2 py-4" : "mt-8 px-4 py-5 sm:mt-10 sm:px-0 sm:py-6",
                        )}>
                            <div className="text-[10px] font-black uppercase tracking-[0.5em] text-muted-foreground">MYOREP v{APP_VERSION}</div>
                            <div className={cn("flex justify-center", isMobileViewport ? "mt-2" : "mt-3")}>
                                <SupabaseStatusPill />
                            </div>
                            <div className="mt-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Engineered by General Malit</div>
                        </footer>
                    )}
                </div>
            </main>
            <AppDialog
                state={dialogState}
                value={dialogValue}
                onChangeValue={setDialogValue}
                onClose={closeDialog}
                onConfirm={handleDialogConfirm}
            />
        </div>
    );
}
