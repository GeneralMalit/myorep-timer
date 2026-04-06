import { useMemo, useState } from 'react';
import { Play, Plus, Save, Workflow, Dumbbell, TimerReset, Layers3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { createRestSessionNode, createWorkoutSessionNode } from '@/utils/savedSessions';
import SessionCanvas from '@/components/SessionCanvas';
import SessionNodeEditor from '@/components/SessionNodeEditor';
import SetupModeToggle from '@/components/SetupModeToggle';

const DEFAULT_REST_SECONDS = '10';

const SessionBuilder = () => {
    const [savedWorkoutSourceId, setSavedWorkoutSourceId] = useState('');
    const {
        sets,
        reps,
        seconds,
        rest,
        myoReps,
        myoWorkSecs,
        savedWorkouts,
        savedSessions,
        editingSessionDraft,
        editingSessionNodeId,
        setEditingSessionNodeId,
        createSession,
        saveSessionDraft,
        saveSessionDraftAs,
        loadSessionForEditing,
        duplicateSession,
        deleteSession,
        addWorkoutNodeFromSavedWorkout,
        updateWorkoutNode,
        updateRestNode,
        removeSessionNode,
        moveSessionNode,
        insertSessionNodeAfter,
        startSession,
        setSetupMode,
    } = useWorkoutStore();

    const activeNode = useMemo(
        () => editingSessionDraft?.nodes.find((node) => node.id === editingSessionNodeId) ?? null,
        [editingSessionDraft, editingSessionNodeId],
    );

    const sessionName = editingSessionDraft?.name ?? '';

    const buildWorkoutNode = (name: string) => createWorkoutSessionNode(
        name,
        {
            sets,
            reps,
            seconds,
            rest,
            myoReps,
            myoWorkSecs,
        },
        new Date().toISOString(),
        null,
    );

    const buildRestNode = (name: string, secondsValue: string) => (
        createRestSessionNode(name, secondsValue, new Date().toISOString())
    );

    const handleSave = () => {
        const result = saveSessionDraft();
        if (!result.ok) {
            window.alert(result.error ?? 'Could not save session.');
        }
    };

    const handleSaveAs = () => {
        const nextName = window.prompt('Save session as:', sessionName || 'Saved Session');
        if (!nextName) {
            return;
        }

        const result = saveSessionDraftAs(nextName);
        if (!result.ok) {
            window.alert(result.error ?? 'Could not save session.');
        }
    };

    const handleNewSession = () => {
        const nextName = window.prompt('New session name:', 'Saved Session');
        if (!nextName) {
            return;
        }

        const result = createSession(nextName);
        if (!result.ok) {
            window.alert(result.error ?? 'Could not create session.');
        }
    };

    const handleStart = () => {
        const id = editingSessionDraft?.id ?? '';
        if (!id) {
            window.alert('Create or load a session first.');
            return;
        }

        const result = startSession(id);
        if (!result.ok) {
            window.alert(result.error ?? 'Could not start session.');
        }
    };

    const insertAfterNode = (afterNodeId: string | null, nodeType: 'workout' | 'rest') => {
        const workoutCount = editingSessionDraft?.nodes.filter((node) => node.type === 'workout').length ?? 0;
        const restCount = editingSessionDraft?.nodes.filter((node) => node.type === 'rest').length ?? 0;
        const node = nodeType === 'workout'
            ? buildWorkoutNode(`Workout ${workoutCount + 1}`)
            : buildRestNode(`Rest ${restCount + 1}`, DEFAULT_REST_SECONDS);

        insertSessionNodeAfter(afterNodeId, node);
    };

    const handleAddWorkoutFromSavedWorkout = () => {
        if (!savedWorkoutSourceId) {
            return;
        }

        const result = addWorkoutNodeFromSavedWorkout(savedWorkoutSourceId);
        if (!result.ok) {
            window.alert(result.error ?? 'Could not add workout node.');
        }
    };

    return (
        <div className="w-full space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.3em] text-primary">
                        <Workflow size={15} />
                        Saved Sessions
                    </div>
                    <h2 className="text-4xl font-black italic tracking-tighter text-foreground sm:text-5xl">
                        Build a Session
                    </h2>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                        Shape a session as a node chain, then save it for later.
                    </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                    <SetupModeToggle mode="session" onChange={setSetupMode} />
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={handleNewSession} className="gap-2">
                            <Plus size={14} /> New
                        </Button>
                        <Button variant="secondary" onClick={handleSave} className="gap-2">
                            <Save size={14} /> Save
                        </Button>
                        <Button variant="secondary" onClick={handleSaveAs} className="gap-2">
                            <Save size={14} /> Save As
                        </Button>
                        <Button onClick={handleStart} className="gap-2">
                            <Play size={14} /> Start
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)_320px]">
                <aside className="space-y-4">
                    <Card className="border-border/50 bg-card/70">
                        <CardContent className="space-y-3 p-4">
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-muted-foreground">
                                <Layers3 size={14} />
                                Toolbox
                            </div>
                            <div className="space-y-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start gap-3 rounded-xl border-border/50 bg-background/60 px-4 py-3 text-left"
                                    onClick={() => insertAfterNode(null, 'workout')}
                                >
                                    <Dumbbell size={16} className="text-primary" />
                                    <span className="flex flex-col items-start">
                                        <span className="text-xs font-black uppercase tracking-[0.22em]">Workout Node</span>
                                        <span className="text-[10px] font-normal uppercase tracking-tight text-muted-foreground">
                                            Add a training block
                                        </span>
                                    </span>
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start gap-3 rounded-xl border-border/50 bg-background/60 px-4 py-3 text-left"
                                    onClick={() => insertAfterNode(null, 'rest')}
                                >
                                    <TimerReset size={16} className="text-muted-foreground" />
                                    <span className="flex flex-col items-start">
                                        <span className="text-xs font-black uppercase tracking-[0.22em]">Rest Node</span>
                                        <span className="text-[10px] font-normal uppercase tracking-tight text-muted-foreground">
                                            Add a recovery block
                                        </span>
                                    </span>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/50 bg-card/70">
                        <CardContent className="space-y-3 p-4">
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-xs font-black uppercase tracking-[0.28em] text-muted-foreground">
                                    Saved Sessions
                                </div>
                                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
                                    {savedSessions.length}
                                </div>
                            </div>

                            <div className="space-y-2">
                                {savedSessions.length === 0 && (
                                    <div className="rounded-2xl bg-background/60 p-3 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                                        No saved sessions yet
                                    </div>
                                )}

                                {savedSessions.map((session) => (
                                    <div key={session.id} className="rounded-2xl bg-background/60 p-3">
                                        <div className="mb-2 flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="truncate text-xs font-black uppercase tracking-[0.22em]">
                                                    {session.name}
                                                </div>
                                                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                                    {session.nodes.length} nodes
                                                </div>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 px-2 text-[10px] font-black uppercase tracking-[0.18em]"
                                                onClick={() => loadSessionForEditing(session.id)}
                                            >
                                                Load
                                            </Button>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                className="h-7 px-2 text-[10px] font-black uppercase tracking-[0.18em]"
                                                onClick={() => {
                                                    const nextName = window.prompt('Duplicate session as:', `${session.name} Copy`);
                                                    if (!nextName) {
                                                        return;
                                                    }
                                                    const result = duplicateSession(session.id, nextName);
                                                    if (!result.ok) {
                                                        window.alert(result.error ?? 'Could not duplicate session.');
                                                    }
                                                }}
                                            >
                                                Copy
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 px-2 text-[10px] font-black uppercase tracking-[0.18em] text-destructive"
                                                onClick={() => {
                                                    const confirmed = window.confirm(`Delete "${session.name}"?`);
                                                    if (!confirmed) {
                                                        return;
                                                    }
                                                    deleteSession(session.id);
                                                }}
                                            >
                                                Del
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </aside>

                <main className="min-h-[68vh] overflow-hidden rounded-[28px] bg-background/40 p-3 sm:p-4">
                    <SessionCanvas
                        nodes={editingSessionDraft?.nodes ?? []}
                        activeNodeId={editingSessionNodeId}
                        onEditNode={(nodeId) => setEditingSessionNodeId(nodeId)}
                        onMoveLeft={(nodeId) => moveSessionNode(nodeId, 'left')}
                        onMoveRight={(nodeId) => moveSessionNode(nodeId, 'right')}
                        onRemoveNode={(nodeId) => removeSessionNode(nodeId)}
                        onInsertWorkoutHere={(afterNodeId) => insertAfterNode(afterNodeId, 'workout')}
                        onInsertRestHere={(afterNodeId) => insertAfterNode(afterNodeId, 'rest')}
                    />
                </main>

                <aside className="space-y-4">
                    <Card className="border-border/50 bg-card/70">
                        <CardContent className="space-y-3 p-4">
                            <div className="text-xs font-black uppercase tracking-[0.28em] text-muted-foreground">
                                Session Draft
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                                    Name
                                </Label>
                                <Input
                                    value={sessionName}
                                    onChange={(event) => {
                                        if (editingSessionDraft) {
                                            useWorkoutStore.setState({
                                                editingSessionDraft: {
                                                    ...editingSessionDraft,
                                                    name: event.target.value,
                                                },
                                            });
                                        }
                                    }}
                                    placeholder="Saved Session"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                                    Add From Saved Workout
                                </Label>
                                <div className="flex gap-2">
                                    <select
                                        className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none"
                                        value={savedWorkoutSourceId}
                                        onChange={(event) => setSavedWorkoutSourceId(event.target.value)}
                                    >
                                        <option value="">Select workout...</option>
                                        {savedWorkouts.map((workout) => (
                                            <option key={workout.id} value={workout.id}>
                                                {workout.name}
                                            </option>
                                        ))}
                                    </select>
                                    <Button variant="outline" onClick={handleAddWorkoutFromSavedWorkout}>
                                        Add
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <SessionNodeEditor
                        node={activeNode}
                        onUpdateWorkout={updateWorkoutNode}
                        onUpdateRest={updateRestNode}
                    />
                </aside>
            </div>
        </div>
    );
};

export default SessionBuilder;
