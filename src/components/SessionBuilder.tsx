import { useMemo, useState } from 'react';
import { Play, Plus, Save, Settings2, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import SessionCanvas from '@/components/SessionCanvas';
import SessionNodeEditor from '@/components/SessionNodeEditor';
import { createRestSessionNode, createWorkoutSessionNode } from '@/utils/savedSessions';

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

    const buildRestNode = (name: string, secondsValue: string) => createRestSessionNode(name, secondsValue, new Date().toISOString());

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
            : buildRestNode(`Rest ${restCount + 1}`, '10');

        insertSessionNodeAfter(afterNodeId, node);
    };

    return (
        <div className="w-full space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-xs">
                        <Workflow size={16} />
                        Saved Sessions
                    </div>
                    <h2 className="text-4xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/50">
                        Build a Session
                    </h2>
                </div>

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

            <Card className="border-border/60 bg-card/70">
                <CardContent className="grid gap-4 p-5 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Session Name</Label>
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
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Add Workout From Saved Workout</Label>
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
                            <Button
                                variant="outline"
                                onClick={() => {
                                    if (!savedWorkoutSourceId) {
                                        return;
                                    }
                                    const result = addWorkoutNodeFromSavedWorkout(savedWorkoutSourceId);
                                    if (!result.ok) {
                                        window.alert(result.error ?? 'Could not add workout node.');
                                    }
                                }}
                            >
                                Add
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/70">
                <CardContent className="space-y-4 p-5">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Saved Sessions</div>
                            <div className="text-sm text-muted-foreground">Load, duplicate, or delete existing sessions.</div>
                        </div>
                        <div className="text-xs font-black uppercase tracking-widest text-primary">
                            {savedSessions.length} total
                        </div>
                    </div>

                    <div className="space-y-2">
                        {savedSessions.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-border/50 bg-background/60 p-5 text-sm text-muted-foreground">
                                No saved sessions yet.
                            </div>
                        ) : (
                            savedSessions.map((session) => (
                                <div key={session.id} className="rounded-2xl border border-border/50 bg-background/60 p-4 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="space-y-1">
                                            <div className="text-sm font-black italic tracking-tight">{session.name}</div>
                                            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                                {session.nodes.length} nodes
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <Button size="sm" variant="secondary" onClick={() => loadSessionForEditing(session.id)}>
                                                Load
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
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
                                                Duplicate
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                    const confirmed = window.confirm(`Delete "${session.name}"?`);
                                                    if (!confirmed) {
                                                        return;
                                                    }
                                                    deleteSession(session.id);
                                                }}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => insertAfterNode(null, 'workout')} className="gap-2">
                    <Plus size={14} /> Workout From Current Setup
                </Button>
                <Button variant="outline" onClick={() => insertAfterNode(null, 'rest')} className="gap-2">
                    <Plus size={14} /> Rest Node
                </Button>
                <Button variant="ghost" onClick={() => setSetupMode('workout')} className="gap-2">
                    <Settings2 size={14} /> Back to Workout Setup
                </Button>
            </div>

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

            <SessionNodeEditor
                node={activeNode}
                onUpdateWorkout={updateWorkoutNode}
                onUpdateRest={updateRestNode}
            />

            <Card className="border-border/60 bg-primary/5">
                <CardContent className="p-4 text-sm text-muted-foreground">
                    Sessions are linear in v1. Add workout nodes and rest nodes in order, then save and run the session.
                </CardContent>
            </Card>
        </div>
    );
};

export default SessionBuilder;
