import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { useAccountStore } from '@/store/useAccountStore';
import { audioEngine } from '@/utils/audioEngine';
import TimerWorker from '@/utils/timerWorker?worker&inline';
import Sidebar from '@/components/Sidebar';
import type { SidebarProps } from '@/components/Sidebar';
import ConcentricTimer from '@/components/ConcentricTimer';
import KineticWorkoutSetup from '@/components/kinetic/KineticWorkoutSetup';
import KineticSidebar from '@/components/kinetic/KineticSidebar';
import SetupModeToggle from '@/components/SetupModeToggle';
import { getResponsiveLayout } from '@/layout';
import { appShellMobile } from '@/layout/appShell.mobile';
import { appShellDesktop } from '@/layout/appShell.desktop';
import { Play, Square, RotateCcw, ChevronRight, Zap, Activity, Volume2, Menu, Settings2, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { APP_VERSION } from '@/constants/version';
import { canAccessSessionBuilder } from '@/utils/account';
import { normalizeSetsInput } from '@/utils/savedWorkouts';
import type { AccountActionResult, AccountSnapshot } from '@/types/account';

const LazySettingsPanel = lazy(() => import('@/components/SettingsPanel'));
const LazyProtocolIntelModal = lazy(() => import('@/components/ProtocolIntelModal'));
const LazySessionBuilder = lazy(() => import('@/components/SessionBuilder'));
const LazyKineticSessionBuilder = lazy(() => import('@/components/kinetic/KineticSessionBuilder'));
const LazySupabaseBootstrap = lazy(() => import('@/components/SupabaseBootstrap'));
const shouldBootstrapSupabase = import.meta.env.VITE_ENABLE_SUPABASE === 'true';
// Development-only visual preview. This unlocks local UI paths without ever
// altering real entitlement data, production builds, or Capacitor releases.
const isLocalPlusPreview = import.meta.env.DEV
    && import.meta.env.MODE !== 'test'
    && import.meta.env.VITE_LOCAL_PLUS_PREVIEW !== 'false';

const LazySyncedSidebar = lazy(async () => {
    const { useSyncController } = await import('@/hooks/useSyncController');

    const SyncedSidebar = (props: SidebarProps) => {
        const account = props.account as AccountSnapshot;
        const {
            visibleWorkouts,
            visibleSessions,
            syncSnapshot,
            syncActions,
        } = useSyncController({
            account,
            savedWorkouts: props.savedWorkouts,
            savedSessions: props.savedSessions,
        });

        return (
            <Sidebar
                {...props}
                savedWorkouts={visibleWorkouts}
                savedSessions={visibleSessions}
                syncSnapshot={syncSnapshot}
                syncActions={syncActions}
            />
        );
    };

    return { default: SyncedSidebar };
});

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

const getMetronomeOffsets = (remainingTime: number, includeImmediateBoundary: boolean) => {
    if (!Number.isFinite(remainingTime) || remainingTime <= 0.001) {
        return [];
    }

    const wholeSeconds = Math.floor(remainingTime + 0.001);
    const fraction = remainingTime - Math.floor(remainingTime);
    const firstGridOffset = fraction <= 0.001 || fraction >= 0.999 ? 0 : fraction;
    const offsets = Array.from({ length: wholeSeconds }, (_, index) => Number((firstGridOffset + index).toFixed(3)));

    if (includeImmediateBoundary && offsets[0] !== 0) {
        offsets.unshift(0);
    }

    return offsets;
};

const getMonotonicEpochMs = () => performance.timeOrigin + performance.now();

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
    layout: {
        dialogOverlay: string;
        dialogPanel: string;
    };
}

const AppDialog = ({ state, value, onChangeValue, onClose, onConfirm, layout }: AppDialogProps) => {
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
            className={layout.dialogOverlay}
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div className={layout.dialogPanel}>
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

interface TimerSurfaceProps {
    isMobileViewport: boolean;
    timerScreenShell: string;
}

const TimerSurface = ({ isMobileViewport, timerScreenShell }: TimerSurfaceProps) => {
    const {
        settings,
        sets,
        reps,
        seconds,
        rest,
        myoReps,
        myoWorkSecs,
        activeSessionId,
        activeSessionNodeIndex,
        sessionStatus,
        isRunningSession,
        sessionNodeRuntimeType,
        timerStatus,
        isTimerRunning,
        currentSet,
        currentRep,
        isMainRep,
        isWorking,
        timeLeft,
        setTotalDuration,
        setElapsedTime,
        savedSessions,
        designVariant,
        setIsTimerRunning,
        completeSessionNode,
        resetWorkout,
        applyTimerElapsed,
        skipSection,
    } = useWorkoutStore(useShallow((state) => ({
        settings: state.settings,
        sets: state.sets,
        reps: state.reps,
        seconds: state.seconds,
        rest: state.rest,
        myoReps: state.myoReps,
        myoWorkSecs: state.myoWorkSecs,
        activeSessionId: state.activeSessionId,
        activeSessionNodeIndex: state.activeSessionNodeIndex,
        sessionStatus: state.sessionStatus,
        isRunningSession: state.isRunningSession,
        sessionNodeRuntimeType: state.sessionNodeRuntimeType,
        timerStatus: state.timerStatus,
        isTimerRunning: state.isTimerRunning,
        currentSet: state.currentSet,
        currentRep: state.currentRep,
        isMainRep: state.isMainRep,
        isWorking: state.isWorking,
        timeLeft: state.timeLeft,
        setTotalDuration: state.setTotalDuration,
        setElapsedTime: state.setElapsedTime,
        savedSessions: state.savedSessions,
        designVariant: state.designVariant,
        setIsTimerRunning: state.setIsTimerRunning,
        completeSessionNode: state.completeSessionNode,
        resetWorkout: state.resetWorkout,
        applyTimerElapsed: state.applyTimerElapsed,
        skipSection: state.skipSection,
    })));
    const workerRef = useRef<Worker | null>(null);
    const lastWorkerElapsedRef = useRef(0);
    const lastWorkerSampleEpochRef = useRef<number | null>(null);
    const timerRunIdRef = useRef(0);
    const activeTimerRunIdRef = useRef<number | null>(null);
    const smoothAnimationRef = useRef(settings.smoothAnimation);
    const lastSpokenSecondRef = useRef(-1);
    const metronomeScheduleKeyRef = useRef<string | null>(null);
    const lastMetronomeSectionKeyRef = useRef<string | null>(null);
    const prepAnnouncedRef = useRef(false);
    const activeSession = activeSessionId
        ? savedSessions.find((session) => session.id === activeSessionId) ?? null
        : null;
    const activeSessionNode = activeSession?.nodes[activeSessionNodeIndex] ?? null;
    const sessionRestDuration = activeSessionNode?.type === 'rest'
        ? parseInt(activeSessionNode.seconds || '0', 10)
        : null;
    const isPreparing = timerStatus === 'Preparing';
    const fullScreenBackgroundColor = timerStatus === 'Finished'
        ? settings.finishedColor
        : (isPreparing || !isWorking)
            ? settings.restColor
            : (timeLeft <= settings.concentricSecond && timeLeft > 0
                ? settings.concentricColor
                : settings.activeColor);
    const fullScreenBackgroundStyle = useMemo(
        () => ({ backgroundColor: fullScreenBackgroundColor }),
        [fullScreenBackgroundColor],
    );

    useEffect(() => {
        smoothAnimationRef.current = settings.smoothAnimation;
    }, [settings.smoothAnimation]);

    const startTimerWorker = useCallback(() => {
        if (!workerRef.current) return;
        const runId = timerRunIdRef.current + 1;
        timerRunIdRef.current = runId;
        activeTimerRunIdRef.current = runId;
        lastWorkerElapsedRef.current = 0;
        lastWorkerSampleEpochRef.current = getMonotonicEpochMs();
        workerRef.current.postMessage({ action: 'start', interval: smoothAnimationRef.current ? 50 : 250, runId });
    }, []);

    const flushAndStopTimerWorker = useCallback(() => {
        if (!workerRef.current || activeTimerRunIdRef.current === null) return;

        const now = getMonotonicEpochMs();
        const lastSample = lastWorkerSampleEpochRef.current;
        activeTimerRunIdRef.current = null;
        workerRef.current.postMessage({ action: 'stop' });
        lastWorkerElapsedRef.current = 0;
        lastWorkerSampleEpochRef.current = null;

        if (lastSample !== null) {
            applyTimerElapsed(Math.max(0, (now - lastSample) / 1000));
        }
    }, [applyTimerElapsed]);

    useEffect(() => {
        const worker = new TimerWorker();
        workerRef.current = worker;
        worker.postMessage({ action: 'stop' });
        worker.onmessage = (event) => {
            if (event.data.action !== 'tick') return;
            if (typeof event.data.runId === 'number' && event.data.runId !== activeTimerRunIdRef.current) {
                return;
            }

            const elapsedSecs = event.data.elapsed / 1000;
            const sampleEpochMs = typeof event.data.sampleEpochMs === 'number' ? event.data.sampleEpochMs : null;
            const deltaSeconds = sampleEpochMs !== null && lastWorkerSampleEpochRef.current !== null
                ? Math.max(0, (sampleEpochMs - lastWorkerSampleEpochRef.current) / 1000)
                : Math.max(0, elapsedSecs - lastWorkerElapsedRef.current);
            lastWorkerElapsedRef.current = elapsedSecs;
            lastWorkerSampleEpochRef.current = sampleEpochMs ?? getMonotonicEpochMs();
            applyTimerElapsed(deltaSeconds);
        };

        return () => {
            activeTimerRunIdRef.current = null;
            worker.terminate();
        };
    }, [applyTimerElapsed]);

    useEffect(() => {
        if (!workerRef.current) return;
        if (isTimerRunning) {
            startTimerWorker();
            return;
        }

        activeTimerRunIdRef.current = null;
        workerRef.current.postMessage({ action: 'stop' });
        lastWorkerElapsedRef.current = 0;
        lastWorkerSampleEpochRef.current = null;
    }, [isTimerRunning, startTimerWorker]);

    useEffect(() => {
        if (
            isRunningSession
            && sessionNodeRuntimeType === 'workout'
            && sessionStatus === 'running'
            && timerStatus === 'Finished'
        ) {
            completeSessionNode();
        }
    }, [completeSessionNode, isRunningSession, sessionNodeRuntimeType, sessionStatus, timerStatus]);

    useEffect(() => {
        audioEngine.cancelSpeech();
        lastSpokenSecondRef.current = -1;
    }, [timerStatus, currentRep, isWorking, isMainRep]);

    useEffect(() => {
        if (!isTimerRunning || !settings.ttsEnabled || timerStatus === 'Finished') {
            audioEngine.cancelSpeech();
        }
    }, [isTimerRunning, settings.ttsEnabled, timerStatus]);

    useEffect(() => {
        const canScheduleMetronome = isTimerRunning
            && settings.metronomeEnabled
            && isWorking
            && timerStatus !== 'Preparing'
            && timeLeft > 0.001;
        const sectionTimeLeft = setTotalDuration > 0
            ? Math.max(0, setTotalDuration - setElapsedTime)
            : timeLeft;
        const scheduleWindow = Math.ceil(sectionTimeLeft / 30);
        const sectionKey = canScheduleMetronome
            ? [activeSessionId ?? 'standalone', activeSessionNodeIndex, timerStatus, currentSet, isMainRep ? 'main' : 'myo'].join('|')
            : null;
        const scheduleKey = canScheduleMetronome
            ? [sectionKey, scheduleWindow, settings.metronomeSound].join('|')
            : null;

        if (!canScheduleMetronome || !scheduleKey) {
            if (metronomeScheduleKeyRef.current !== null) {
                audioEngine.cancelScheduledTicks();
                metronomeScheduleKeyRef.current = null;
            }
            return;
        }

        if (metronomeScheduleKeyRef.current === scheduleKey) {
            return;
        }

        const offsets = getMetronomeOffsets(
            sectionTimeLeft,
            lastMetronomeSectionKeyRef.current !== sectionKey,
        ).slice(0, 30);
        if (offsets.length > 0) {
            audioEngine.scheduleTickSequence(settings.metronomeSound, offsets);
            metronomeScheduleKeyRef.current = scheduleKey;
            lastMetronomeSectionKeyRef.current = sectionKey;
        }
    }, [activeSessionId, activeSessionNodeIndex, currentSet, isMainRep, isTimerRunning, isWorking, setElapsedTime, setTotalDuration, settings.metronomeEnabled, settings.metronomeSound, timeLeft, timerStatus]);

    useEffect(() => () => {
        audioEngine.cancelScheduledTicks();
        audioEngine.cancelSpeech();
    }, []);

    useEffect(() => {
        if (isTimerRunning && settings.ttsEnabled && isWorking && timerStatus !== 'Preparing') {
            const currentSecond = Math.ceil(timeLeft);
            if (currentSecond !== lastSpokenSecondRef.current && currentSecond >= 0) {
                const activeRepTarget = isMainRep ? parseInt(reps || '0', 10) : parseInt(myoReps || '0', 10);
                const suppressVoice = isBurnoutRepSet({ timerStatus, isWorking, seconds, myoWorkSecs });
                const shouldSpeakCurrentSecond = !suppressVoice
                    && currentSecond >= 1
                    && (currentSecond > 1 || activeRepTarget !== 1);
                if (shouldSpeakCurrentSecond) audioEngine.speak(currentSecond);
                lastSpokenSecondRef.current = currentSecond;
            }
        } else if (timerStatus !== 'Preparing') {
            lastSpokenSecondRef.current = -1;
        }
    }, [isMainRep, isTimerRunning, isWorking, myoReps, myoWorkSecs, reps, seconds, settings.ttsEnabled, timeLeft, timerStatus]);

    useEffect(() => {
        if (timerStatus !== 'Preparing' || !isTimerRunning) {
            prepAnnouncedRef.current = false;
            return;
        }

        if (!prepAnnouncedRef.current) {
            if (settings.ttsEnabled) audioEngine.speak('Ready');
            prepAnnouncedRef.current = true;
        }
    }, [isTimerRunning, settings.ttsEnabled, timerStatus]);

    const pauseOrResume = () => {
        audioEngine.init();
        if (timerStatus === 'Finished') {
            audioEngine.cancelSpeech();
            resetWorkout();
            return;
        }

        if (isTimerRunning) {
            flushAndStopTimerWorker();
            audioEngine.cancelSpeech();
            setIsTimerRunning(false);
            return;
        }

        setIsTimerRunning(true);
    };

    const skipActiveSection = () => {
        audioEngine.init();
        audioEngine.cancelSpeech();
        const wasRunning = useWorkoutStore.getState().isTimerRunning;
        if (wasRunning) flushAndStopTimerWorker();
        skipSection();
        if (wasRunning && useWorkoutStore.getState().isTimerRunning) startTimerWorker();
    };

    const terminateWorkout = () => {
        audioEngine.cancelSpeech();
        audioEngine.cancelScheduledTicks();
        resetWorkout();
    };

    if (designVariant === 'kinetic') {
        const isSessionRunner = Boolean(isRunningSession && activeSession);
        const phaseLabel = timerStatus === 'Finished'
            ? 'Protocol complete'
            : (isPreparing ? 'Get ready' : (!isWorking ? (isSessionRunner ? 'Transition rest' : 'Recovery') : (isMainRep ? 'Activation pace' : 'Myo pace')));
        const phaseDetail = timerStatus === 'Finished'
            ? 'Great work. Start a fresh workout when ready.'
            : (isRunningSession && sessionNodeRuntimeType === 'rest'
                ? (activeSessionNode?.name ?? 'Session rest')
                : (isWorking ? `Rep ${currentRep} / ${isMainRep ? reps : myoReps}` : `Next: ${isMainRep ? 'work interval' : 'myo work'}`));

        return (
            <section data-testid="kinetic-timer-surface" className="flex min-h-full w-full flex-1 flex-col bg-[#0e1012] px-4 py-5 text-white sm:px-7 lg:px-10 lg:py-7">
                <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 pb-4 text-sm">
                    <div className="font-['Sora'] font-semibold tracking-[-0.025em] text-white">
                        {isSessionRunner ? activeSession?.name : 'Workout'}
                    </div>
                    <span className="h-4 border-l border-white/15" />
                    <span className="text-zinc-400">{isSessionRunner ? `Block ${activeSessionNodeIndex + 1} / ${activeSession?.nodes.length ?? 0}` : `Set ${currentSet} / ${sets}`}</span>
                    <span className="h-4 border-l border-white/15" />
                    <span className="text-zinc-400">{timerStatus}</span>
                    <button type="button" className="ml-auto text-xs font-medium text-zinc-400 transition-colors hover:text-white" onClick={terminateWorkout}>End {isSessionRunner ? 'session' : 'workout'}</button>
                </header>

                <div className="mx-auto grid w-full max-w-[1120px] flex-1 items-center gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="flex flex-col items-center justify-center">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                            {phaseLabel}
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
                            textSub={phaseDetail}
                            isFinished={timerStatus === 'Finished'}
                            isPreparing={isPreparing}
                        />
                        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                            <Button onClick={pauseOrResume} className="h-12 rounded-lg bg-[#ff5b36] px-5 text-sm font-bold text-white hover:bg-[#ff6a47]">
                                {timerStatus === 'Finished' ? <><RotateCcw size={16} /> New workout</> : (isTimerRunning ? <><Square size={15} /> Pause</> : <><Play size={16} /> Resume</>)}
                            </Button>
                            {timerStatus !== 'Finished' && (
                                <Button onClick={skipActiveSection} variant="outline" className="h-12 rounded-lg border-white/15 bg-transparent px-4 text-sm text-zinc-300 hover:bg-white/8 hover:text-white">
                                    <SkipForward size={16} /> Skip {isSessionRunner ? 'block' : 'phase'}
                                </Button>
                            )}
                        </div>
                    </div>

                    {isSessionRunner ? (
                        <aside className="border-l border-white/10 pl-5">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Session timeline</div>
                            <ol className="mt-5 space-y-1">
                                {activeSession?.nodes.map((node, index) => {
                                    const isComplete = index < activeSessionNodeIndex;
                                    const isActive = index === activeSessionNodeIndex;
                                    return (
                                        <li key={node.id} className={cn('border-l-2 py-3 pl-4 text-sm', isComplete ? 'border-[#a8ff5a] text-zinc-500' : (isActive ? 'border-[#74c7ff] text-white' : 'border-white/15 text-zinc-500'))}>
                                            <div className="font-medium">{node.name}</div>
                                            <div className="mt-1 text-xs text-zinc-500">{node.type === 'rest' ? `${node.seconds} sec rest` : `${node.config.sets} cycles · ${node.config.reps} reps`}</div>
                                        </li>
                                    );
                                })}
                            </ol>
                        </aside>
                    ) : (
                        <aside className="border-l border-white/10 pl-5">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Protocol</div>
                            <div className="mt-5 space-y-4 text-sm">
                                <div className={cn('border-l-2 pl-4', isPreparing ? 'border-[#ff5b36] text-white' : 'border-[#a8ff5a] text-zinc-500')}>Preparation</div>
                                <div className={cn('border-l-2 pl-4', timerStatus === 'Main Set' ? 'border-[#a8ff5a] text-white' : 'border-white/15 text-zinc-500')}>Activation · {reps} reps</div>
                                <div className={cn('border-l-2 pl-4', timerStatus === 'Resting' ? 'border-[#74c7ff] text-white' : 'border-white/15 text-zinc-500')}>Rest · {rest || '0'} sec</div>
                                <div className={cn('border-l-2 pl-4', timerStatus === 'Myo Reps' ? 'border-[#a8ff5a] text-white' : 'border-white/15 text-zinc-500')}>Myo clusters · {myoReps} reps</div>
                            </div>
                        </aside>
                    )}
                </div>
            </section>
        );
    }

    return (
        <div className={cn(
            "flex flex-1 flex-col items-center",
            isMobileViewport ? "justify-start overflow-y-auto" : "justify-center",
        )}>
            <div data-testid="timer-screen-shell" className={timerScreenShell}>
                {settings.fullScreenMode && (
                    <div aria-hidden="true" className="fixed inset-0 -z-10" style={fullScreenBackgroundStyle} />
                )}
                <div className="w-full space-y-4 text-center">
                    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                        {isRunningSession && activeSession && !isMobileViewport && <div className="rounded-full border border-primary/30 bg-primary/20 px-4 py-1.5 text-[10px] font-black italic tracking-[0.2em] text-primary sm:text-xs sm:tracking-widest">{activeSession.name}</div>}
                        <div className="rounded-full border border-primary/30 bg-primary/20 px-4 py-1.5 text-[10px] font-black italic tracking-[0.2em] text-primary sm:text-xs sm:tracking-widest">SET {currentSet} / {sets}</div>
                        <div className="rounded-full border border-border bg-muted px-4 py-1.5 text-[10px] font-black italic tracking-[0.2em] text-muted-foreground sm:text-xs sm:tracking-widest">{isMainRep ? 'ACTIVATION' : 'MYO REPS'}</div>
                        {isRunningSession && activeSessionNode && !isMobileViewport && <div className="rounded-full border border-border bg-muted px-4 py-1.5 text-[10px] font-black italic tracking-[0.2em] text-muted-foreground sm:text-xs sm:tracking-widest">NODE {activeSessionNodeIndex + 1} {activeSessionNode.type === 'rest' ? 'REST' : 'WORKOUT'}</div>}
                    </div>
                    <h2 className="text-4xl font-black italic uppercase tracking-tighter text-foreground drop-shadow-sm sm:text-5xl">{timerStatus}</h2>
                    {isMobileViewport && (
                        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-4 rounded-[1.75rem] border border-border/60 bg-card px-4 py-3 text-left shadow-sm">
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
                    <Button onClick={pauseOrResume} className="min-h-14 min-w-[200px] rounded-2xl bg-black px-6 text-lg font-black italic tracking-tighter text-white shadow-md hover:bg-black/90 sm:h-16 sm:px-10 sm:text-xl">
                        {timerStatus === 'Finished' ? <><RotateCcw className="mr-2" /> NEW SESSION</> : (isTimerRunning ? <><Square className="mr-2" /> PAUSE</> : <><Play className="mr-2" /> RESUME</>)}
                    </Button>
                    {timerStatus !== 'Finished' && (
                        <Button onClick={skipActiveSection} className="min-h-14 rounded-2xl bg-black px-6 text-lg font-black italic tracking-tighter text-white shadow-md hover:bg-black/90 sm:h-16 sm:px-10 sm:text-xl">
                            <SkipForward className="mr-2" /> SKIP SECTION
                        </Button>
                    )}
                    <Button onClick={terminateWorkout} className="min-h-14 rounded-2xl bg-black px-6 text-lg font-black italic tracking-tighter text-white shadow-md hover:bg-black/90 sm:h-16 sm:px-10 sm:text-xl">
                        TERMINATE
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default function App() {
    const {
        settings, sets, reps, seconds, rest, myoReps, myoWorkSecs, setWorkoutConfig,
        editingSessionDraft, savedWorkouts, savedSessions, selectedSavedWorkoutId, lastImportSummary,
        appPhase, timerStatus, isWorking, startWorkout,
        saveCurrentWorkout, saveCurrentWorkoutAs, loadWorkout, renameWorkout, deleteWorkout, exportSavedLibrary, importSavedLibrary, clearImportSummary,
        createSession, loadSessionForEditing, duplicateSession, renameSession, deleteSession,
        setupMode, setSetupMode, showSettings, setShowSettings, setSettings,
        isSidebarCollapsed, setIsSidebarCollapsed, isAccountCardCollapsed, setIsAccountCardCollapsed, theme, setTheme, designVariant
    } = useWorkoutStore(useShallow((state) => ({
        settings: state.settings,
        sets: state.sets,
        reps: state.reps,
        seconds: state.seconds,
        rest: state.rest,
        myoReps: state.myoReps,
        myoWorkSecs: state.myoWorkSecs,
        setWorkoutConfig: state.setWorkoutConfig,
        editingSessionDraft: state.editingSessionDraft,
        savedWorkouts: state.savedWorkouts,
        savedSessions: state.savedSessions,
        selectedSavedWorkoutId: state.selectedSavedWorkoutId,
        lastImportSummary: state.lastImportSummary,
        appPhase: state.appPhase,
        timerStatus: state.timerStatus,
        isWorking: state.isWorking,
        startWorkout: state.startWorkout,
        saveCurrentWorkout: state.saveCurrentWorkout,
        saveCurrentWorkoutAs: state.saveCurrentWorkoutAs,
        loadWorkout: state.loadWorkout,
        renameWorkout: state.renameWorkout,
        deleteWorkout: state.deleteWorkout,
        exportSavedLibrary: state.exportSavedLibrary,
        importSavedLibrary: state.importSavedLibrary,
        clearImportSummary: state.clearImportSummary,
        createSession: state.createSession,
        loadSessionForEditing: state.loadSessionForEditing,
        duplicateSession: state.duplicateSession,
        renameSession: state.renameSession,
        deleteSession: state.deleteSession,
        setupMode: state.setupMode,
        setSetupMode: state.setSetupMode,
        showSettings: state.showSettings,
        setShowSettings: state.setShowSettings,
        setSettings: state.setSettings,
        isSidebarCollapsed: state.isSidebarCollapsed,
        setIsSidebarCollapsed: state.setIsSidebarCollapsed,
        isAccountCardCollapsed: state.isAccountCardCollapsed,
        setIsAccountCardCollapsed: state.setIsAccountCardCollapsed,
        theme: state.theme,
        setTheme: state.setTheme,
        designVariant: state.designVariant,
    })));
    const {
        applyAccountState,
        bootstrapStatus,
        mode,
        session,
        profile,
        entitlement,
        syncStatus,
        error,
        requiresPasswordReset,
        setPasswordRecoveryMode,
    } = useAccountStore(useShallow((state) => ({
        applyAccountState: state.applyAccountState,
        bootstrapStatus: state.bootstrapStatus,
        mode: state.mode,
        session: state.session,
        profile: state.profile,
        entitlement: state.entitlement,
        syncStatus: state.syncStatus,
        error: state.error,
        requiresPasswordReset: state.requiresPasswordReset,
        setPasswordRecoveryMode: state.setPasswordRecoveryMode,
    })));
    const [showProtocolIntel, setShowProtocolIntel] = useState(false);
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const [dialogState, setDialogState] = useState<AppDialogState>(null);
    const [dialogValue, setDialogValue] = useState('');
    const [kineticSidebarWidth, setKineticSidebarWidth] = useState(248);
    const isSingleCycle = parseInt(sets, 10) === 1;
    const dialogConfirmRef = useRef<((value: string) => void) | null>(null);
    const loadedWorkout = selectedSavedWorkoutId ? savedWorkouts.find((workout) => workout.id === selectedSavedWorkoutId) ?? null : null;
    const canUseSessionBuilder = isLocalPlusPreview || canAccessSessionBuilder(entitlement);
    const canUseCloudSync = mode === 'signed-in-plus' && entitlement?.cloudSyncEnabled === true;
    const isSessionSetup = appPhase === 'setup' && setupMode === 'session' && canUseSessionBuilder;
    const nodeCount = editingSessionDraft?.nodes.length ?? 0;
    const sessionSummary = useMemo(() => {
        if (!editingSessionDraft) {
            return 'Create a session, then edit nodes directly in the canvas.';
        }
        return `${nodeCount} node${nodeCount === 1 ? '' : 's'} in the chain.`;
    }, [editingSessionDraft, nodeCount]);

    const isSidebarOpen = !isSidebarCollapsed;
    const appShellLayout = getResponsiveLayout(isMobileViewport, appShellMobile, appShellDesktop);
    const desktopTimerAccentStyle = useMemo(() => ({
        '--timer-phase-color': timerStatus === 'Preparing' || !isWorking
            ? settings.restColor
            : settings.activeColor,
    } as CSSProperties), [isWorking, settings.activeColor, settings.restColor, timerStatus]);
    const account = useMemo<AccountSnapshot>(() => ({
        bootstrapStatus,
        mode,
        session,
        profile,
        entitlement,
        syncStatus,
        error,
        requiresPasswordReset,
    }), [bootstrapStatus, entitlement, error, mode, profile, requiresPasswordReset, session, syncStatus]);
    const visibleWorkouts = useMemo(
        () => savedWorkouts.filter((workout) => !workout.sync?.pendingDelete),
        [savedWorkouts],
    );
    const visibleSessions = useMemo(
        () => savedSessions.filter((savedSession) => !savedSession.sync?.pendingDelete),
        [savedSessions],
    );
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
    const handleExportLibrary = useCallback(() => {
        const payload = exportSavedLibrary();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `myorep-library-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }, [exportSavedLibrary]);
    const handleUpgradeToPlus = useCallback(async (): Promise<AccountActionResult> => {
        if (account.mode === 'guest') {
            setIsSidebarCollapsed(false);
            return {
                ok: false,
                message: 'Sign in first from the account card, then upgrade to Plus.',
            };
        }

        const { startBillingCheckout } = await import('@/lib/billing');
        return startBillingCheckout();
    }, [account.mode, setIsSidebarCollapsed]);
    const handleManageSubscription = useCallback(async (): Promise<AccountActionResult> => {
        if (account.mode !== 'signed-in-plus') {
            return {
                ok: false,
                message: 'Upgrade to Plus before managing a subscription.',
            };
        }

        const { openBillingPortal } = await import('@/lib/billing');
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
    const handleSignOut = useCallback(async (): Promise<AccountActionResult> => {
        const [{ getSupabaseClient }, { signOutSupabase }] = await Promise.all([
            import('@/lib/supabase'),
            import('@/lib/supabaseAccount'),
        ]);
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
    const handleSignInWithPassword = useCallback(async (email: string, password: string): Promise<AccountActionResult> => {
        const [{ getSupabaseClient }, { signInSupabaseWithPassword }] = await Promise.all([
            import('@/lib/supabase'),
            import('@/lib/supabaseAccount'),
        ]);
        const client = getSupabaseClient();
        if (!client) {
            return { ok: false, message: 'Supabase is not configured for this build.' };
        }

        const result = await signInSupabaseWithPassword(client, email, password);
        if (!result.ok) {
            return { ok: false, message: result.error ?? 'Could not sign in with password.' };
        }

        return { ok: true, message: 'Signed in with password.' };
    }, []);
    const handleSignUpWithPassword = useCallback(async (username: string, email: string, password: string) => {
        const [
            { Capacitor },
            { getSupabaseAuthRedirectUrl, getSupabaseClient },
            { signUpSupabaseWithPassword },
        ] = await Promise.all([
            import('@capacitor/core'),
            import('@/lib/supabase'),
            import('@/lib/supabaseAccount'),
        ]);
        const client = getSupabaseClient();
        if (!client) {
            return { ok: false, message: 'Supabase is not configured for this build.' };
        }

        const redirectTo = getSupabaseAuthRedirectUrl({
            native: Capacitor.isNativePlatform(),
            origin: typeof window !== 'undefined' ? window.location.origin : null,
        });

        const result = await signUpSupabaseWithPassword(
            client,
            username,
            email.trim(),
            password,
            redirectTo,
        );
        if (!result.ok) {
            return { ok: false, message: result.error ?? 'Could not create your account.' };
        }

        return {
            ok: true,
            message: result.requiresEmailVerification
                ? 'Account created. Check your email for the confirmation magic link before signing in with your password.'
                : 'Account created successfully.',
        };
    }, []);
    const handleResendSignUpConfirmation = useCallback(async (email: string): Promise<AccountActionResult> => {
        const [
            { Capacitor },
            { getSupabaseAuthRedirectUrl, getSupabaseClient },
            { resendSupabaseSignUpConfirmation },
        ] = await Promise.all([
            import('@capacitor/core'),
            import('@/lib/supabase'),
            import('@/lib/supabaseAccount'),
        ]);
        const client = getSupabaseClient();
        if (!client) {
            return { ok: false, message: 'Supabase is not configured for this build.' };
        }

        const redirectTo = getSupabaseAuthRedirectUrl({
            native: Capacitor.isNativePlatform(),
            origin: typeof window !== 'undefined' ? window.location.origin : null,
        });
        const result = await resendSupabaseSignUpConfirmation(client, email, redirectTo);
        if (!result.ok) {
            return { ok: false, message: result.error ?? 'Could not resend the confirmation email.' };
        }

        return { ok: true, message: `Confirmation magic link sent to ${email}.` };
    }, []);
    const handleUpdateUsername = useCallback(async (username: string): Promise<AccountActionResult> => {
        const [
            { getSupabaseClient },
            { loadSupabaseAccountState, updateSupabaseUsername },
        ] = await Promise.all([
            import('@/lib/supabase'),
            import('@/lib/supabaseAccount'),
        ]);
        const client = getSupabaseClient();
        if (!client) {
            return { ok: false, message: 'Supabase is not configured for this build.' };
        }

        if (!session) {
            return { ok: false, message: 'Sign in first to update your username.' };
        }

        const result = await updateSupabaseUsername(session, username);
        if (!result.ok) {
            return { ok: false, message: result.error ?? 'Could not update your username.' };
        }

        const resolved = await loadSupabaseAccountState(client, session);
        applyAccountState(resolved);
        return { ok: true, message: 'Username updated.' };
    }, [applyAccountState, session]);
    const handleSendPasswordReset = useCallback(async (email: string): Promise<AccountActionResult> => {
        const [
            { Capacitor },
            { getSupabaseAuthRedirectUrl, getSupabaseClient },
            { sendSupabasePasswordReset },
        ] = await Promise.all([
            import('@capacitor/core'),
            import('@/lib/supabase'),
            import('@/lib/supabaseAccount'),
        ]);
        const client = getSupabaseClient();
        if (!client) {
            return { ok: false, message: 'Supabase is not configured for this build.' };
        }

        const normalizedEmail = email.trim();
        const result = await sendSupabasePasswordReset(
            client,
            normalizedEmail,
            getSupabaseAuthRedirectUrl({
                native: Capacitor.isNativePlatform(),
                origin: window.location.origin,
            }),
        );
        if (!result.ok) {
            return { ok: false, message: result.error ?? 'Could not send password reset email.' };
        }

        return { ok: true, message: `Password reset sent to ${normalizedEmail}.` };
    }, []);
    const handleUpdatePassword = useCallback(async (password: string): Promise<AccountActionResult> => {
        const [{ getSupabaseClient }, { updateSupabasePassword }] = await Promise.all([
            import('@/lib/supabase'),
            import('@/lib/supabaseAccount'),
        ]);
        const client = getSupabaseClient();
        if (!client) {
            return { ok: false, message: 'Supabase is not configured for this build.' };
        }

        const result = await updateSupabasePassword(client, password);
        if (!result.ok) {
            return { ok: false, message: result.error ?? 'Could not update your password.' };
        }

        setPasswordRecoveryMode(false);
        return { ok: true, message: 'Password updated. You can keep using this account normally now.' };
    }, [setPasswordRecoveryMode]);

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

        void import('@/lib/paddle')
            .then(({ initializePaddleCheckoutFromQuery }) => initializePaddleCheckoutFromQuery())
            .catch((error: unknown) => {
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

        if (billingState !== 'success' && billingState !== 'portal') {
            clearBillingParam();
            return;
        }

        const isPortalReturn = billingState === 'portal';
        void import('@/lib/billing')
            .then(({ refreshBillingEntitlementState }) => refreshBillingEntitlementState())
            .then((resolvedState) => {
                if (resolvedState) {
                    applyAccountState(resolvedState);
                }

                if (isPortalReturn) {
                    openMessageDialog(
                        'Subscription updated',
                        'Your subscription settings were updated and your account access has been refreshed.',
                    );
                    return;
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
                openMessageDialog(
                    isPortalReturn ? 'Subscription updated' : 'Purchase received',
                    isPortalReturn
                        ? 'Your subscription settings were updated, but account access could not be refreshed. Refresh the app in a moment.'
                        : 'Your purchase was received. If Plus does not appear yet, refresh the app in a moment.',
                );
            })
            .finally(() => {
                clearBillingParam();
            });
    }, [applyAccountState, canUseSessionBuilder, openMessageDialog]);

    const sidebarProps: SidebarProps = {
        currentTheme: theme,
        setTheme,
        setShowSettings,
        onOpenProtocolIntel: () => setShowProtocolIntel(true),
        showSettings,
        isMobileViewport,
        isCollapsed: isSidebarCollapsed,
        toggleSidebar,
        appPhase,
        savedWorkouts: visibleWorkouts,
        onSaveCurrent: handleSaveWorkout,
        onSaveAsCurrent: handleSaveWorkoutAs,
        onLoadWorkout: handleLoadWorkout,
        onRenameWorkout: handleRenameWorkout,
        onDeleteWorkout: handleDeleteWorkout,
        onExportLibrary: handleExportLibrary,
        onImportLibrary: importSavedLibrary,
        importSummary: lastImportSummary,
        clearImportSummary,
        savedSessions: visibleSessions,
        onCreateSession: handleCreateSession,
        onLoadSession: handleLoadSession,
        onDuplicateSession: handleDuplicateSession,
        onRenameSession: handleRenameSession,
        onDeleteSession: handleDeleteSession,
        account,
        isAccountCardCollapsed,
        onToggleAccountCardCollapsed: () => setIsAccountCardCollapsed(!isAccountCardCollapsed),
        onSignInWithPassword: handleSignInWithPassword,
        onSignUpWithPassword: handleSignUpWithPassword,
        onResendSignUpConfirmation: handleResendSignUpConfirmation,
        onUpdateUsername: handleUpdateUsername,
        onSendPasswordReset: handleSendPasswordReset,
        onUpdatePassword: handleUpdatePassword,
        onSignOut: handleSignOut,
        canAccessSessionBuilder: canUseSessionBuilder,
        onUpgradeToPlus: handleUpgradeToPlus,
        onManageSubscription: handleManageSubscription,
    };

    return (
        <div
            className={cn("min-h-[100dvh] bg-background text-foreground font-sans selection:bg-primary/30 transition-colors duration-500", theme, designVariant === 'kinetic' && 'design-kinetic')}
            data-design-variant={designVariant}
            style={{ '--kinetic-sidebar-width': `${kineticSidebarWidth}px` } as CSSProperties}
        >
            {shouldBootstrapSupabase && (
                <Suspense fallback={null}>
                    <LazySupabaseBootstrap />
                </Suspense>
            )}
            {isMobileViewport && isSidebarOpen && (
                <button type="button" className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={toggleSidebar} aria-label="Close Navigation Overlay" />
            )}
            {designVariant === 'kinetic' ? (
                <KineticSidebar
                    {...sidebarProps}
                    setupMode={setupMode}
                    onNavigate={handleSetupModeChange}
                    width={kineticSidebarWidth}
                    onWidthChange={setKineticSidebarWidth}
                />
            ) : canUseCloudSync ? (
                <Suspense fallback={<Sidebar {...sidebarProps} />}>
                    <LazySyncedSidebar
                        {...sidebarProps}
                        savedWorkouts={savedWorkouts}
                        savedSessions={savedSessions}
                    />
                </Suspense>
            ) : (
                <Sidebar {...sidebarProps} />
            )}
            {showSettings && (
                <Suspense fallback={null}>
                    <LazySettingsPanel isOpen onClose={() => setShowSettings(false)} />
                </Suspense>
            )}
            {showProtocolIntel && (
                <Suspense fallback={null}>
                    <LazyProtocolIntelModal isOpen onClose={() => setShowProtocolIntel(false)} />
                </Suspense>
            )}
            <main
                data-testid="app-main-shell"
                className={cn(
                    appShellLayout.mainShell,
                    isSidebarCollapsed ? "md:ml-[4.5rem]" : (designVariant === 'kinetic' ? "md:ml-[var(--kinetic-sidebar-width)]" : "md:ml-72"),
                    isSessionSetup ? "md:px-10 md:pt-0" : "",
                )}
            >
                {designVariant !== 'kinetic' && <div
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle_at_center,var(--timer-phase-color)_0%,transparent_70%)] opacity-10 md:block"
                    style={desktopTimerAccentStyle}
                />}
                <div className={cn(
                    appShellLayout.contentShell,
                )}>
                    {isMobileViewport && (
                        <header className={appShellLayout.mobileHeader}>
                            <Button variant="ghost" size="icon" className="h-11 w-11 rounded-2xl" onClick={toggleSidebar} aria-label="Open Navigation"><Menu size={20} /></Button>
                            <div className="min-w-0 text-center">
                                <div className="text-[10px] font-black uppercase tracking-[0.32em] text-primary">MyoREP</div>
                                <div className="truncate text-sm font-semibold text-muted-foreground">{appPhase === 'setup' ? (isSessionSetup ? 'Session Builder' : 'Workout Setup') : timerStatus}</div>
                            </div>
                            <Button variant={showSettings ? 'default' : 'secondary'} size="icon" className="h-11 w-11 rounded-2xl" onClick={() => setShowSettings(!showSettings)} aria-label={showSettings ? 'Close Settings' : 'Open Settings'}><Settings2 size={18} /></Button>
                        </header>
                    )}
                    {appPhase === 'setup' ? (
                        designVariant === 'kinetic' ? (
                            isSessionSetup ? (
                                <div
                                    data-testid="kinetic-session-builder-viewport"
                                    className="flex h-[calc(var(--viewport-dynamic)-var(--safe-top)-var(--safe-bottom)-7.5rem)] min-h-[20rem] w-full min-w-0 flex-col overflow-hidden md:h-[calc(100dvh-3rem)] md:min-h-0"
                                >
                                    <Suspense fallback={null}>
                                        <LazyKineticSessionBuilder className="min-h-0 flex-1" />
                                    </Suspense>
                                </div>
                            ) : (
                                <KineticWorkoutSetup
                                    onStart={startWorkout}
                                    onSelectSession={() => handleSetupModeChange('session')}
                                    canUseSessionBuilder={canUseSessionBuilder}
                                />
                            )
                        ) : (
                        <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col items-stretch justify-start gap-6 px-1 py-2 sm:px-4 sm:py-4">
                            {/* Stationary Header & Selector */}
                            <div className={cn("mx-auto max-w-3xl text-center w-full", isMobileViewport ? "space-y-1.5" : "space-y-2")}>
                                <h1 className="bg-gradient-to-br from-foreground to-foreground/50 bg-clip-text text-[clamp(2.6rem,11vw,5rem)] font-black italic leading-[1.05] tracking-tighter text-transparent pb-1">
                                    {isSessionSetup ? 'Build a Session' : 'Build a Workout'}
                                </h1>
                                <p className={cn(
                                    "mx-auto max-w-2xl font-medium leading-relaxed text-muted-foreground",
                                    isMobileViewport ? "text-xs" : "text-sm",
                                )}>
                                    {isSessionSetup ? sessionSummary : 'Configure the hypertrophy block, then save it or launch straight into the timer.'}
                                </p>
                            </div>
                            <div className="flex justify-center w-full">
                                <SetupModeToggle
                                    mode={setupMode}
                                    onChange={handleSetupModeChange}
                                    className="w-full max-w-md justify-center"
                                    sessionLocked={!canUseSessionBuilder}
                                />
                            </div>

                            {/* Sliding Panes Container */}
                            <div className="relative w-full flex-1 min-h-0 overflow-hidden">
                                {/* Pane A: Workout Setup */}
                                <div
                                    data-testid="workout-setup-shell"
                                    className={cn(
                                        appShellLayout.workoutSetupShell,
                                        "w-full transition-all duration-300 ease-out transform",
                                        isSessionSetup
                                            ? "-translate-x-full opacity-0 pointer-events-none absolute inset-x-0 top-0"
                                            : "translate-x-0 opacity-100 relative"
                                    )}
                                >
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
                                        "rounded-[24px] border border-border/60 bg-card/70 p-4 sm:p-5",
                                        isMobileViewport ? "flex items-center justify-between gap-3" : "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
                                    )}>
                                            <div className={cn("space-y-1.5", isMobileViewport && "min-w-0")}>
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
                                                <Label htmlFor="setup-voice-guidance" className="text-xs font-black uppercase tracking-widest leading-none">Voice Guidance</Label>
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

                                {/* Pane B: Session Setup */}
                                <div
                                    className={cn(
                                        "flex min-h-0 flex-1 flex-col md:rounded-none w-full transition-all duration-300 ease-out transform",
                                        isSessionSetup
                                            ? "translate-x-0 opacity-100 relative"
                                            : "translate-x-full opacity-0 pointer-events-none absolute inset-x-0 top-0"
                                    )}
                                >
                                    {isSessionSetup && (
                                        <Suspense fallback={null}>
                                            <LazySessionBuilder />
                                        </Suspense>
                                    )}
                                </div>
                            </div>
                        </div>
                        )
                    ) : (
                        <TimerSurface
                            isMobileViewport={isMobileViewport}
                            timerScreenShell={appShellLayout.timerScreenShell}
                        />
                    )}
                    {!isSessionSetup && designVariant !== 'kinetic' && (
                        <footer className={appShellLayout.footerShell}>
                            <div className="text-[10px] font-black uppercase tracking-[0.5em] text-muted-foreground">MYOREP v{APP_VERSION}</div>
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
                layout={appShellLayout}
            />
        </div>
    );
}
