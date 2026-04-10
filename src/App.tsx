import { useEffect, useRef, useState } from 'react';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { audioEngine } from '@/utils/audioEngine';
import TimerWorker from '@/utils/timerWorker?worker&inline';

import Sidebar from '@/components/Sidebar';
import SettingsPanel from '@/components/SettingsPanel';
import ProtocolIntelModal from '@/components/ProtocolIntelModal';
import ConcentricTimer from '@/components/ConcentricTimer';
import SessionBuilder from '@/components/SessionBuilder';
import SetupModeToggle from '@/components/SetupModeToggle';

import {
    Play,
    Square,
    RotateCcw,
    ChevronRight,
    Zap,
    Activity,
    Maximize2,
    Volume2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
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

export default function App() {
    const {
        settings,
        sets, reps, seconds, rest, myoReps, myoWorkSecs, setWorkoutConfig,
        savedWorkouts, savedSessions, selectedSavedWorkoutId, lastImportSummary,
        activeSessionId, activeSessionNodeIndex, sessionStatus, isRunningSession, sessionNodeRuntimeType, completeSessionNode,
        appPhase, timerStatus, isTimerRunning, setIsTimerRunning,
        currentSet, currentRep, isMainRep, isWorking,
        timeLeft,
        setElapsedTime,
        lastTickSecond, setLastTickSecond,
        startWorkout, resetWorkout, advanceCycle, updateTimerBaselines,
        saveCurrentWorkout, saveCurrentWorkoutAs, loadWorkout, renameWorkout, deleteWorkout, exportSavedWorkouts, importSavedWorkouts, clearImportSummary,
        createSession, loadSessionForEditing, duplicateSession, renameSession, deleteSession,
        setupMode, setSetupMode,
        showSettings, setShowSettings, setSettings,
        isSidebarCollapsed, setIsSidebarCollapsed,
        theme, setTheme
    } = useWorkoutStore();
    const [showProtocolIntel, setShowProtocolIntel] = useState(false);
    const isSingleCycle = parseInt(sets, 10) === 1;

    const workerRef = useRef<Worker | null>(null);
    const baseTimeLeft = useRef(0);
    const baseSetElapsedTime = useRef(0);
    const loadedWorkout = selectedSavedWorkoutId
        ? savedWorkouts.find((workout) => workout.id === selectedSavedWorkoutId) ?? null
        : null;
    const activeSession = activeSessionId
        ? savedSessions.find((session) => session.id === activeSessionId) ?? null
        : null;
    const activeSessionNode = activeSession?.nodes[activeSessionNodeIndex] ?? null;
    const sessionRestDuration = activeSessionNode?.type === 'rest' ? parseInt(activeSessionNode.seconds || '0', 10) : null;
    const isSessionSetup = appPhase === 'setup' && setupMode === 'session';

    // Floating Window Refs
    const pipCanvasRef = useRef<HTMLCanvasElement>(null);
    const pipVideoRef = useRef<HTMLVideoElement>(null);

    // Init Worker
    useEffect(() => {
        const worker = new TimerWorker();
        workerRef.current = worker;

        worker.onmessage = (e) => {
            if (e.data.action === 'tick') {
                const elapsedSecs = e.data.elapsed / 1000;
                const nextTimeLeft = Math.max(0, baseTimeLeft.current - elapsedSecs);
                const nextSetElapsed = baseSetElapsedTime.current + elapsedSecs;
                updateTimerBaselines(nextTimeLeft, nextSetElapsed);
            }
        };

        return () => worker.terminate();
    }, [updateTimerBaselines]);

    /* c8 ignore start */
    // Timer Control Loop - Refactored for efficiency
    useEffect(() => {
        if (!workerRef.current) return;

        if (isTimerRunning) {
            if (timeLeft > 0.001) {
                const tickRate = settings.smoothAnimation ? 50 : 250;
                // Only send start if not already running or interval changed
                workerRef.current.postMessage({
                    action: 'start',
                    interval: tickRate
                });
            } else if (timerStatus !== 'Finished') {
                // Phase end
                workerRef.current.postMessage({ action: 'stop' });
                baseSetElapsedTime.current = setElapsedTime;
                if (isRunningSession && sessionNodeRuntimeType === 'rest') {
                    completeSessionNode();
                } else {
                    advanceCycle();
                }
            }
        } else {
            workerRef.current.postMessage({ action: 'stop' });
        }
    }, [isTimerRunning, timeLeft <= 0.001, timerStatus, advanceCycle, completeSessionNode, isRunningSession, sessionNodeRuntimeType, settings.smoothAnimation]);

    useEffect(() => {
        if (isRunningSession && sessionNodeRuntimeType === 'workout' && sessionStatus === 'running' && timerStatus === 'Finished') {
            completeSessionNode();
        }
    }, [completeSessionNode, isRunningSession, sessionNodeRuntimeType, sessionStatus, timerStatus]);

    // Re-sync base baselines on phase change
    useEffect(() => {
        baseTimeLeft.current = timeLeft;
        // We only reset baseSetElapsedTime if setElapsedTime is 0 (start of set)
        if (setElapsedTime === 0) {
            baseSetElapsedTime.current = 0;
        }
    }, [timerStatus, currentRep, isWorking, isMainRep]);

    // Audio Triggers
    useEffect(() => {
        if (isTimerRunning && settings.metronomeEnabled && isWorking && timerStatus !== 'Preparing') {
            const currentSecond = Math.ceil(timeLeft);
            if (currentSecond !== lastTickSecond && currentSecond >= 0) {
                const activeRepTarget = isMainRep ? parseInt(reps || '0') : parseInt(myoReps || '0');
                const shouldSpeakCurrentSecond = settings.ttsEnabled
                    && currentSecond >= 1
                    && (currentSecond > 1 || activeRepTarget !== 1);

                if (shouldSpeakCurrentSecond) {
                    audioEngine.speak(currentSecond);
                }
                if (settings.metronomeEnabled) {
                    audioEngine.playTick(settings.metronomeSound);
                }
                setLastTickSecond(currentSecond);
            }
        } else {
            if (lastTickSecond !== -1 && timerStatus !== 'Preparing') {
                setLastTickSecond(-1);
            }
        }
    }, [timeLeft, isTimerRunning, settings, isWorking, timerStatus, lastTickSecond, setLastTickSecond]);

    // Initial sound on start
    useEffect(() => {
        if (timerStatus === 'Preparing' && isTimerRunning && lastTickSecond === -1) {
            if (settings.ttsEnabled) {
                audioEngine.speak('Ready');
                setLastTickSecond(-2); // Mark as initially spoken
            }
        }
    }, [timerStatus, isTimerRunning, settings.ttsEnabled, lastTickSecond, setLastTickSecond]);

    // PiP Rendering
    useEffect(() => {
        const canvas = pipCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const color = timerStatus === 'Finished'
            ? settings.finishedColor
            : (timerStatus === 'Preparing' || !isWorking)
                ? settings.restColor
                : (timeLeft <= settings.concentricSecond && timeLeft > 0
                    ? settings.concentricColor
                    : settings.activeColor
                );

        ctx.fillStyle = color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(timerStatus, canvas.width / 2, 60);

        ctx.font = 'bold 80px Inter, sans-serif';
        ctx.fillText(Math.ceil(timeLeft).toString(), canvas.width / 2, canvas.height / 2);

        if (settings.pipShowInfo && appPhase === 'timer') {
            ctx.font = '18px Inter, sans-serif';
            if (timerStatus !== 'Finished' && timerStatus !== 'Preparing') {
                ctx.fillText(`Set ${currentSet}/${sets}`, canvas.width / 2, canvas.height - 70);
                ctx.fillText(`Rep ${currentRep}/${isMainRep ? reps : myoReps}`, canvas.width / 2, canvas.height - 40);
            } else if (timerStatus === 'Finished') {
                ctx.fillText('Workout Complete!', canvas.width / 2, canvas.height - 50);
            }
        }
    }, [timeLeft, isWorking, timerStatus, settings, currentSet, sets, currentRep, reps, myoReps, isMainRep, appPhase]);

    const requestPiP = async () => {
        try {
            if (pipVideoRef.current && !document.pictureInPictureElement) {
                if (!pipVideoRef.current.srcObject && pipCanvasRef.current) {
                    const stream = pipCanvasRef.current.captureStream();
                    pipVideoRef.current.srcObject = stream;
                }
                await pipVideoRef.current.play();
                await pipVideoRef.current.requestPictureInPicture();
            }
        } catch (err) {
            console.error("PiP error:", err);
        }
    };

    const handleSaveWorkout = () => {
        const workoutName = window.prompt('Name this workout template:', loadedWorkout?.name ?? '');
        if (!workoutName) return;

        const result = saveCurrentWorkout(workoutName);
        if (!result.ok) {
            window.alert(result.error ?? 'Could not save workout.');
        }
    };

    const handleSaveWorkoutAs = () => {
        const workoutName = window.prompt('Save as:', loadedWorkout?.name ?? '');
        if (!workoutName) return;

        const result = saveCurrentWorkoutAs(workoutName);
        if (!result.ok) {
            window.alert(result.error ?? 'Could not save workout.');
        }
    };
    /* c8 ignore stop */

    const handleLoadWorkout = (id: string) => {
        const result = loadWorkout(id);
        if (!result.ok) {
            window.alert(result.error ?? 'Could not load workout.');
        }
    };

    const handleRenameWorkout = (id: string) => {
        const workout = savedWorkouts.find((entry) => entry.id === id);
        const nextName = window.prompt('Rename workout:', workout?.name ?? '');
        if (nextName === null) return;
        const result = renameWorkout(id, nextName);
        if (!result.ok) {
            window.alert(result.error ?? 'Could not rename workout.');
        }
    };

    const handleDeleteWorkout = (id: string) => {
        const workout = savedWorkouts.find((entry) => entry.id === id);
        const confirmed = window.confirm(`Delete "${workout?.name ?? 'this workout'}"?`);
        if (!confirmed) return;
        deleteWorkout(id);
    };

    const handleExportWorkouts = () => {
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
    };

    const handleImportWorkouts = (payload: unknown) => {
        importSavedWorkouts(payload);
    };

    const handleCreateSession = () => {
        const name = window.prompt('Session name:', 'New Session');
        if (!name) return;
        const result = createSession(name);
        if (!result.ok) {
            window.alert(result.error ?? 'Could not create session.');
        }
    };

    const handleLoadSession = (id: string) => {
        const result = loadSessionForEditing(id);
        if (!result.ok) {
            window.alert(result.error ?? 'Could not load session.');
        }
    };

    const handleDuplicateSession = (id: string) => {
        const session = savedSessions.find((entry) => entry.id === id);
        const name = window.prompt('Duplicate session as:', `${session?.name ?? 'Session'} Copy`);
        if (!name) return;
        const result = duplicateSession(id, name);
        if (!result.ok) {
            window.alert(result.error ?? 'Could not duplicate session.');
        }
    };

    const handleRenameSession = (id: string) => {
        const session = savedSessions.find((entry) => entry.id === id);
        const name = window.prompt('Rename session:', session?.name ?? '');
        if (name === null) return;
        const result = renameSession(id, name);
        if (!result.ok) {
            window.alert(result.error ?? 'Could not rename session.');
        }
    };

    const handleDeleteSession = (id: string) => {
        const session = savedSessions.find((entry) => entry.id === id);
        const confirmed = window.confirm(`Delete "${session?.name ?? 'this session'}"?`);
        if (!confirmed) return;
        deleteSession(id);
    };

    return (
        <div className={cn("min-h-screen bg-background text-foreground flex transition-colors duration-500 font-sans selection:bg-primary/30", theme)}>
            <Sidebar
                currentTheme={theme}
                setTheme={setTheme}
                setShowSettings={setShowSettings}
                onOpenProtocolIntel={() => setShowProtocolIntel(true)}
                showSettings={showSettings}
                isCollapsed={isSidebarCollapsed}
                toggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                appPhase={appPhase}
                savedWorkouts={savedWorkouts}
                onSaveCurrent={handleSaveWorkout}
                onSaveAsCurrent={handleSaveWorkoutAs}
                onLoadWorkout={handleLoadWorkout}
                onRenameWorkout={handleRenameWorkout}
                onDeleteWorkout={handleDeleteWorkout}
                onExportWorkouts={handleExportWorkouts}
                onImportWorkouts={handleImportWorkouts}
                importSummary={lastImportSummary}
                clearImportSummary={clearImportSummary}
                savedSessions={savedSessions}
                onCreateSession={handleCreateSession}
                onLoadSession={handleLoadSession}
                onDuplicateSession={handleDuplicateSession}
                onRenameSession={handleRenameSession}
                onDeleteSession={handleDeleteSession}
            />

            <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />
            <ProtocolIntelModal isOpen={showProtocolIntel} onClose={() => setShowProtocolIntel(false)} />

            <main className={cn(
                "flex-1 transition-all duration-300 relative overflow-hidden",
                isSidebarCollapsed ? "ml-16" : "ml-64",
                isSessionSetup ? "p-0" : "flex flex-col items-center justify-center p-6"
            )}>
                {/* Ambient Glow */}
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[120px] opacity-10 pointer-events-none transition-colors duration-1000"
                    style={{ backgroundColor: timerStatus === 'Preparing' || !isWorking ? settings.restColor : settings.activeColor }}
                />

                {appPhase === 'setup' ? (
                    isSessionSetup ? (
                        <div className="relative z-10 flex h-full min-h-0 w-full flex-col">
                            <SessionBuilder />
                        </div>
                    ) : (
                        <div className="w-full max-w-4xl z-10 space-y-12 flex flex-col items-center">
                            <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <div className="text-center space-y-2">
                                <h1 className="text-6xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/50">
                                    SYSTEM SETUP
                                </h1>
                                <p className="text-muted-foreground font-bold uppercase tracking-[0.3em] text-xs">Configure Hypertrophy Parameters</p>
                            </div>

                            <div className="flex justify-center">
                                <SetupModeToggle mode={setupMode} onChange={setSetupMode} />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {[
                                    { label: "Total Cycles", value: sets, key: "sets", icon: RotateCcw },
                                    { label: "Activation Reps", value: reps, key: "reps", icon: Activity },
                                    { label: "Activation Pace (s)", value: seconds, key: "seconds", icon: Zap },
                                    { label: "Rest Interval", value: rest, key: "rest", icon: Square, disableWhenSingleCycle: true },
                                    { label: "Myo Reps", value: myoReps, key: "myoReps", icon: Activity, disableWhenSingleCycle: true },
                                    { label: "Myo Pace (s)", value: myoWorkSecs, key: "myoWorkSecs", icon: Zap, disableWhenSingleCycle: true },
                                ].map((input) => (
                                    <div
                                        key={input.key}
                                        className={cn("space-y-3 group", isSingleCycle && input.disableWhenSingleCycle && "opacity-45")}
                                    >
                                        <div className="flex items-center gap-2 px-1">
                                            <input.icon size={14} className="text-primary" />
                                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-focus-within:text-primary transition-colors">
                                                {input.label}
                                            </Label>
                                        </div>
                                        <Input
                                            type="number"
                                            value={input.value}
                                            onChange={(e) => {
                                                const nextValue = input.key === 'sets'
                                                    ? normalizeSetsInput(e.target.value)
                                                    : e.target.value;
                                                setWorkoutConfig({ [input.key]: nextValue });
                                            }}
                                            placeholder="0"
                                            min={input.key === 'sets' ? 1 : undefined}
                                            disabled={isSingleCycle && input.disableWhenSingleCycle}
                                            className={cn(
                                                "h-14 bg-accent/30 border-border/50 text-xl font-black italic rounded-2xl group-focus-within:border-primary/50 transition-all shadow-sm",
                                                isSingleCycle && input.disableWhenSingleCycle && "cursor-not-allowed bg-muted/35 text-muted-foreground"
                                            )}
                                        />
                                    </div>
                                ))}
                            </div>

                            <Card className="bg-accent/20 border-border/50 rounded-3xl overflow-hidden">
                                <CardContent className="p-5 flex items-center justify-between gap-4">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Volume2 size={16} className="text-primary" />
                                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                                                Voice Guidance
                                            </p>
                                        </div>
                                        <p className="text-xs leading-relaxed text-muted-foreground font-medium">
                                            Toggle spoken countdowns and rep calls without opening the right settings panel.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Label htmlFor="setup-voice-guidance" className="text-xs font-black uppercase tracking-widest">
                                            Voice Guidance
                                        </Label>
                                        <Switch
                                            id="setup-voice-guidance"
                                            checked={settings.ttsEnabled}
                                            onCheckedChange={(checked) => setSettings({ ttsEnabled: checked })}
                                            aria-label="Voice Guidance"
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            <Button
                                onClick={() => { audioEngine.init(); startWorkout(); }}
                                className="w-full h-20 text-2xl font-black italic tracking-tighter rounded-3xl shadow-lg hover:shadow-primary/20 transition-all hover:scale-[1.01] active:scale-[0.99] group"
                            >
                                INITIALIZE PROTOCOL <ChevronRight className="group-hover:translate-x-1 transition-transform" />
                            </Button>
                            </div>
                        </div>
                    )
                ) : (
                    <div className="w-full flex-1 min-h-0 z-10 flex flex-col items-center space-y-12 animate-in fade-in zoom-in-95 duration-500">
                        <div className="w-full flex flex-col items-center space-y-12 animate-in fade-in zoom-in-95 duration-500">
                            {settings.fullScreenMode && (
                                <div
                                    className="fixed inset-0 -z-10 transition-colors duration-1000"
                                    style={{
                                        backgroundColor: timerStatus === 'Finished'
                                            ? settings.finishedColor
                                            : (timerStatus === 'Preparing' || !isWorking)
                                                ? settings.restColor
                                                : (timeLeft <= settings.concentricSecond && timeLeft > 0 ? settings.concentricColor : settings.activeColor)
                                    }}
                                />
                            )}

                            <div className="text-center space-y-4">
                                <div className="flex flex-wrap items-center justify-center gap-3">
                                    {isRunningSession && activeSession && (
                                        <div className="px-4 py-1.5 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs font-black italic tracking-widest">
                                            {activeSession.name}
                                        </div>
                                    )}
                                    <div className="px-4 py-1.5 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs font-black italic tracking-widest">
                                        SET {currentSet} / {sets}
                                    </div>
                                    <div className="px-4 py-1.5 rounded-full bg-muted border border-border text-muted-foreground text-xs font-black italic tracking-widest">
                                        {isMainRep ? 'ACTIVATION' : 'MYO REPS'}
                                    </div>
                                    {isRunningSession && activeSessionNode && (
                                        <div className="px-4 py-1.5 rounded-full bg-muted border border-border text-muted-foreground text-xs font-black italic tracking-widest">
                                            NODE {activeSessionNodeIndex + 1} {activeSessionNode.type === 'rest' ? 'REST' : 'WORKOUT'}
                                        </div>
                                    )}
                                </div>
                                <h2 className="text-5xl font-black italic tracking-tighter text-foreground uppercase drop-shadow-sm">
                                    {timerStatus}
                                </h2>
                            </div>

                            <ConcentricTimer
                                outerValue={
                                    timerStatus === 'Finished'
                                        ? (isWorking ? parseInt(reps || '0') : parseInt(rest || '0'))
                                        : (isWorking ? ((isMainRep ? parseInt(reps || '0') : parseInt(myoReps || '0')) - currentRep + 1) : timeLeft)
                                }
                                outerMax={isRunningSession && sessionNodeRuntimeType === 'rest' && sessionRestDuration !== null
                                    ? sessionRestDuration
                                    : (isWorking ? (isMainRep ? parseInt(reps || '0') : parseInt(myoReps || '0')) : parseInt(rest || '1'))}
                                isResting={!isWorking}
                                innerValue={timeLeft}
                                innerMax={timerStatus === 'Preparing' ? settings.prepTime : (isMainRep ? parseInt(seconds || '0') : parseInt(myoWorkSecs || '0'))}
                                textMain={formatTime(Math.ceil(timeLeft))}
                                textSub={timerStatus === 'Preparing'
                                    ? "Get Ready"
                                    : (isRunningSession && sessionNodeRuntimeType === 'rest'
                                        ? (activeSessionNode?.name ?? 'Session Rest')
                                        : (!isWorking ? "Rest Period" : (timerStatus === 'Finished' ? "Protocol Clear" : `Rep ${currentRep}`)))}
                                isFinished={timerStatus === 'Finished'}
                                isPreparing={timerStatus === 'Preparing'}
                            />

                            <div className="flex gap-4 w-full justify-center">
                                <Button
                                    onClick={() => { audioEngine.init(); if (timerStatus === 'Finished') resetWorkout(); else setIsTimerRunning(!isTimerRunning); }}
                                    variant={isTimerRunning ? "secondary" : "default"}
                                    className="h-16 px-10 text-xl font-black italic tracking-tighter rounded-2xl shadow-md min-w-[200px]"
                                >
                                    {timerStatus === 'Finished' ? <><RotateCcw className="mr-2" /> NEW SESSION</> : (isTimerRunning ? <><Square className="mr-2" /> PAUSE</> : <><Play className="mr-2" /> RESUME</>)}
                                </Button>

                                <Button
                                    onClick={resetWorkout}
                                    variant="ghost"
                                    className="h-16 px-10 text-xl font-black italic tracking-tighter text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-2xl"
                                >
                                    TERMINATE
                                </Button>
                            </div>

                            {settings.floatingWindow && (
                                <Button onClick={requestPiP} variant="outline" className="gap-2 font-black italic tracking-tighter rounded-xl bg-accent/20 border-border/50">
                                    <Maximize2 size={16} /> {document.pictureInPictureElement ? 'PIP ACTIVE' : 'LAUNCH PIP'}
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {!isSessionSetup && (
                    <footer className="mt-20 py-8 border-t border-border/50 w-full text-center space-y-2 opacity-30 group hover:opacity-100 transition-opacity">
                        <div className="text-[10px] font-black uppercase tracking-[0.5em] text-muted-foreground">
                            MYOREP v{APP_VERSION}
                        </div>
                        <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
                            Engineered by General Malit
                        </div>
                    </footer>
                )}

                {/* PiP Canvas */}
                <div style={{ display: 'none' }}>
                    <canvas ref={pipCanvasRef} width="300" height="300" />
                    <video ref={pipVideoRef} autoPlay muted />
                </div>
            </main>
        </div>
    );
}
