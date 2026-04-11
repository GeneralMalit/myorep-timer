import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { audioEngine } from '@/utils/audioEngine';
import TimerWorker from '@/utils/timerWorker?worker&inline';
import Sidebar from '@/components/Sidebar';
import SettingsPanel from '@/components/SettingsPanel';
import ProtocolIntelModal from '@/components/ProtocolIntelModal';
import ConcentricTimer from '@/components/ConcentricTimer';
import SessionBuilder from '@/components/SessionBuilder';
import SetupModeToggle from '@/components/SetupModeToggle';
import { Play, Square, RotateCcw, ChevronRight, Zap, Activity, Volume2, Menu, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { APP_VERSION } from '@/constants/version';
import { normalizeSetsInput } from '@/utils/savedWorkouts';

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
    const [showProtocolIntel, setShowProtocolIntel] = useState(false);
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const isSingleCycle = parseInt(sets, 10) === 1;
    const workerRef = useRef<Worker | null>(null);
    const baseTimeLeft = useRef(0);
    const baseSetElapsedTime = useRef(0);
    const lastSpokenSecondRef = useRef(-1);
    const prepAnnouncedRef = useRef(false);
    const loadedWorkout = selectedSavedWorkoutId ? savedWorkouts.find((workout) => workout.id === selectedSavedWorkoutId) ?? null : null;
    const activeSession = activeSessionId ? savedSessions.find((session) => session.id === activeSessionId) ?? null : null;
    const activeSessionNode = activeSession?.nodes[activeSessionNodeIndex] ?? null;
    const sessionRestDuration = activeSessionNode?.type === 'rest' ? parseInt(activeSessionNode.seconds || '0', 10) : null;
    const isSessionSetup = appPhase === 'setup' && setupMode === 'session';
    const isPreparing = timerStatus === 'Preparing';
    const isSidebarOpen = !isSidebarCollapsed;

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

    const toggleSidebar = useCallback(() => setIsSidebarCollapsed(!isSidebarCollapsed), [isSidebarCollapsed, setIsSidebarCollapsed]);
    const handleSaveWorkout = useCallback(() => {
        const workoutName = window.prompt('Name this workout template:', loadedWorkout?.name ?? '');
        if (!workoutName) return;
        const result = saveCurrentWorkout(workoutName);
        if (!result.ok) window.alert(result.error ?? 'Could not save workout.');
    }, [loadedWorkout?.name, saveCurrentWorkout]);
    const handleSaveWorkoutAs = useCallback(() => {
        const workoutName = window.prompt('Save as:', loadedWorkout?.name ?? '');
        if (!workoutName) return;
        const result = saveCurrentWorkoutAs(workoutName);
        if (!result.ok) window.alert(result.error ?? 'Could not save workout.');
    }, [loadedWorkout?.name, saveCurrentWorkoutAs]);
    const handleLoadWorkout = useCallback((id: string) => {
        const result = loadWorkout(id);
        if (!result.ok) window.alert(result.error ?? 'Could not load workout.');
    }, [loadWorkout]);
    const handleRenameWorkout = useCallback((id: string) => {
        const workout = savedWorkouts.find((entry) => entry.id === id);
        const nextName = window.prompt('Rename workout:', workout?.name ?? '');
        if (nextName === null) return;
        const result = renameWorkout(id, nextName);
        if (!result.ok) window.alert(result.error ?? 'Could not rename workout.');
    }, [renameWorkout, savedWorkouts]);
    const handleDeleteWorkout = useCallback((id: string) => {
        const workout = savedWorkouts.find((entry) => entry.id === id);
        if (!window.confirm(`Delete "${workout?.name ?? 'this workout'}"?`)) return;
        deleteWorkout(id);
    }, [deleteWorkout, savedWorkouts]);
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
    const handleCreateSession = useCallback(() => {
        const name = window.prompt('Session name:', 'New Session');
        if (!name) return;
        const result = createSession(name);
        if (!result.ok) window.alert(result.error ?? 'Could not create session.');
    }, [createSession]);
    const handleLoadSession = useCallback((id: string) => {
        const result = loadSessionForEditing(id);
        if (!result.ok) window.alert(result.error ?? 'Could not load session.');
    }, [loadSessionForEditing]);
    const handleDuplicateSession = useCallback((id: string) => {
        const session = savedSessions.find((entry) => entry.id === id);
        const name = window.prompt('Duplicate session as:', `${session?.name ?? 'Session'} Copy`);
        if (!name) return;
        const result = duplicateSession(id, name);
        if (!result.ok) window.alert(result.error ?? 'Could not duplicate session.');
    }, [duplicateSession, savedSessions]);
    const handleRenameSession = useCallback((id: string) => {
        const session = savedSessions.find((entry) => entry.id === id);
        const name = window.prompt('Rename session:', session?.name ?? '');
        if (name === null) return;
        const result = renameSession(id, name);
        if (!result.ok) window.alert(result.error ?? 'Could not rename session.');
    }, [renameSession, savedSessions]);
    const handleDeleteSession = useCallback((id: string) => {
        const session = savedSessions.find((entry) => entry.id === id);
        if (!window.confirm(`Delete "${session?.name ?? 'this session'}"?`)) return;
        deleteSession(id);
    }, [deleteSession, savedSessions]);

    return (
        <div className={cn("min-h-screen bg-background text-foreground font-sans selection:bg-primary/30 transition-colors duration-500", theme)}>
            {isMobileViewport && isSidebarOpen && (
                <button type="button" className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={toggleSidebar} aria-label="Close Navigation Overlay" />
            )}
            <Sidebar currentTheme={theme} setTheme={setTheme} setShowSettings={setShowSettings} onOpenProtocolIntel={() => setShowProtocolIntel(true)} showSettings={showSettings} isCollapsed={isSidebarCollapsed} toggleSidebar={toggleSidebar} appPhase={appPhase} savedWorkouts={savedWorkouts} onSaveCurrent={handleSaveWorkout} onSaveAsCurrent={handleSaveWorkoutAs} onLoadWorkout={handleLoadWorkout} onRenameWorkout={handleRenameWorkout} onDeleteWorkout={handleDeleteWorkout} onExportWorkouts={handleExportWorkouts} onImportWorkouts={importSavedWorkouts} importSummary={lastImportSummary} clearImportSummary={clearImportSummary} savedSessions={savedSessions} onCreateSession={handleCreateSession} onLoadSession={handleLoadSession} onDuplicateSession={handleDuplicateSession} onRenameSession={handleRenameSession} onDeleteSession={handleDeleteSession} />
            {showSettings && <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />}
            <ProtocolIntelModal isOpen={showProtocolIntel} onClose={() => setShowProtocolIntel(false)} />
            <main className={cn("relative min-h-screen overflow-hidden px-4 pb-[calc(var(--safe-bottom)+1rem)] pt-[calc(var(--safe-top)+0.75rem)] transition-[margin] duration-300 md:px-6 md:pb-0 md:pt-6", isSidebarCollapsed ? "md:ml-[4.5rem]" : "md:ml-72", isSessionSetup ? "md:px-10 md:pt-0" : "")}>
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-10 blur-[120px] transition-colors duration-1000" style={{ backgroundColor: timerStatus === 'Preparing' || !isWorking ? settings.restColor : settings.activeColor }} />
                <div className="relative z-10 flex min-h-[calc(100vh-var(--safe-top)-var(--safe-bottom)-1.75rem)] flex-col md:min-h-[calc(100vh-3rem)]">
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
                            <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:rounded-none">
                                <SessionBuilder />
                            </div>
                        ) : (
                            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-stretch justify-start">
                                <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 px-2 py-4 sm:px-4 sm:py-5 md:px-6 md:py-6">
                                    <div className="space-y-2 text-center">
                                        <h1 className="bg-gradient-to-br from-foreground to-foreground/50 bg-clip-text text-4xl font-black italic tracking-tighter text-transparent sm:text-6xl">SYSTEM SETUP</h1>
                                        <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground">Configure Hypertrophy Parameters</p>
                                    </div>
                                    <div className="flex justify-center">
                                        <SetupModeToggle mode={setupMode} onChange={setSetupMode} />
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                        {[
                                            { label: "Total Cycles", value: sets, key: "sets", icon: RotateCcw },
                                            { label: "Activation Reps", value: reps, key: "reps", icon: Activity },
                                            { label: "Activation Pace (s)", value: seconds, key: "seconds", icon: Zap },
                                            { label: "Rest Interval", value: rest, key: "rest", icon: Square, disableWhenSingleCycle: true },
                                            { label: "Myo Reps", value: myoReps, key: "myoReps", icon: Activity, disableWhenSingleCycle: true },
                                            { label: "Myo Pace (s)", value: myoWorkSecs, key: "myoWorkSecs", icon: Zap, disableWhenSingleCycle: true },
                                        ].map((input) => (
                                            <div key={input.key} className={cn("space-y-3 group", isSingleCycle && input.disableWhenSingleCycle && "opacity-45")}>
                                                <div className="flex items-center gap-2 px-1">
                                                    <input.icon size={14} className="text-primary" />
                                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground transition-colors group-focus-within:text-primary">{input.label}</Label>
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
                                                    className={cn("h-14 rounded-2xl border-border/50 bg-accent/30 text-xl font-black italic shadow-sm transition-all group-focus-within:border-primary/50", isSingleCycle && input.disableWhenSingleCycle && "cursor-not-allowed bg-muted/35 text-muted-foreground")}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex flex-col gap-4 py-2 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <Volume2 size={16} className="text-primary" />
                                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Voice Guidance</p>
                                                </div>
                                                <p className="text-xs font-medium leading-relaxed text-muted-foreground">Toggle spoken countdowns and rep calls without opening the settings panel.</p>
                                            </div>
                                            <div className="flex items-center justify-between gap-3 sm:justify-end">
                                                <Label htmlFor="setup-voice-guidance" className="text-xs font-black uppercase tracking-widest">Voice Guidance</Label>
                                                <Switch id="setup-voice-guidance" checked={settings.ttsEnabled} onCheckedChange={(checked) => setSettings({ ttsEnabled: checked })} aria-label="Voice Guidance" />
                                            </div>
                                    </div>
                                    <Button onClick={() => { audioEngine.init(); startWorkout(); }} className="h-16 w-full rounded-3xl text-lg font-black italic tracking-tighter shadow-lg transition-all hover:scale-[1.01] hover:shadow-primary/20 active:scale-[0.99] sm:h-20 sm:text-2xl">
                                        INITIALIZE PROTOCOL <ChevronRight className="transition-transform group-hover:translate-x-1" />
                                    </Button>
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="flex flex-1 flex-col items-center justify-center">
                            <div className="flex w-full max-w-5xl flex-1 flex-col items-center justify-center space-y-6 animate-in fade-in zoom-in-95 duration-500 px-2 py-4 sm:px-4 sm:py-5 md:px-6 md:py-6">
                                {settings.fullScreenMode && (
                                    <div className="fixed inset-0 -z-10 transition-colors duration-1000" style={{ backgroundColor: timerStatus === 'Finished' ? settings.finishedColor : (timerStatus === 'Preparing' || !isWorking) ? settings.restColor : (timeLeft <= settings.concentricSecond && timeLeft > 0 ? settings.concentricColor : settings.activeColor) }} />
                                )}
                                <div className="space-y-4 text-center">
                                    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                                        {isRunningSession && activeSession && <div className="rounded-full border border-primary/30 bg-primary/20 px-4 py-1.5 text-[10px] font-black italic tracking-[0.2em] text-primary sm:text-xs sm:tracking-widest">{activeSession.name}</div>}
                                        <div className="rounded-full border border-primary/30 bg-primary/20 px-4 py-1.5 text-[10px] font-black italic tracking-[0.2em] text-primary sm:text-xs sm:tracking-widest">SET {currentSet} / {sets}</div>
                                        <div className="rounded-full border border-border bg-muted px-4 py-1.5 text-[10px] font-black italic tracking-[0.2em] text-muted-foreground sm:text-xs sm:tracking-widest">{isMainRep ? 'ACTIVATION' : 'MYO REPS'}</div>
                                        {isRunningSession && activeSessionNode && <div className="rounded-full border border-border bg-muted px-4 py-1.5 text-[10px] font-black italic tracking-[0.2em] text-muted-foreground sm:text-xs sm:tracking-widest">NODE {activeSessionNodeIndex + 1} {activeSessionNode.type === 'rest' ? 'REST' : 'WORKOUT'}</div>}
                                    </div>
                                    <h2 className="text-4xl font-black italic uppercase tracking-tighter text-foreground drop-shadow-sm sm:text-5xl">{timerStatus}</h2>
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
                                <div className="flex w-full flex-col justify-center gap-3 sm:flex-row sm:gap-4">
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
                        <footer className="mt-8 w-full border-t border-border/50 px-4 py-5 text-center opacity-50 transition-opacity hover:opacity-100 sm:mt-10 sm:px-0 sm:py-6">
                            <div className="text-[10px] font-black uppercase tracking-[0.5em] text-muted-foreground">MYOREP v{APP_VERSION}</div>
                            <div className="mt-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Engineered by General Malit</div>
                        </footer>
                    )}
                </div>
            </main>
        </div>
    );
}
