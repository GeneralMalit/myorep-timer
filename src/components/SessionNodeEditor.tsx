import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Activity, Square, Zap, Upload, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import type { SavedWorkoutConfig } from '@/types/savedWorkouts';
import { normalizeSetsInput } from '@/utils/savedWorkouts';
import { cn } from '@/lib/utils';

const workoutFields: Array<{ key: keyof SavedWorkoutConfig; label: string; icon: typeof Zap }> = [
    { key: 'sets', label: 'Sets', icon: Activity },
    { key: 'reps', label: 'Reps', icon: Activity },
    { key: 'seconds', label: 'Seconds', icon: Zap },
    { key: 'rest', label: 'Rest', icon: Square },
    { key: 'myoReps', label: 'Myo Reps', icon: Activity },
    { key: 'myoWorkSecs', label: 'Myo Pace', icon: Zap },
];

const SessionNodeEditor = () => {
    const {
        editingSessionDraft,
        editingSessionNodeId,
        setEditingSessionNodeId,
        savedWorkouts,
        replaceWorkoutNodeWithSavedWorkout,
        saveWorkoutFromConfig,
        updateWorkoutNode,
        updateRestNode,
    } = useWorkoutStore();
    const [selectedWorkoutId, setSelectedWorkoutId] = useState('__new__');
    const lastNodeIdRef = useRef<string | null>(null);

    const node = useMemo(() => {
        if (!editingSessionDraft || !editingSessionNodeId) {
            return null;
        }

        return editingSessionDraft.nodes.find((entry) => entry.id === editingSessionNodeId) ?? null;
    }, [editingSessionDraft, editingSessionNodeId]);

    useEffect(() => {
        if (!node || node.type !== 'workout') {
            lastNodeIdRef.current = null;
            setSelectedWorkoutId('__new__');
            return;
        }

        if (lastNodeIdRef.current !== node.id) {
            lastNodeIdRef.current = node.id;
            setSelectedWorkoutId(node.sourceWorkoutId ?? savedWorkouts[0]?.id ?? '__new__');
            return;
        }

        setSelectedWorkoutId((current) => {
            if (current === '__new__') {
                return current;
            }

            const stillExists = savedWorkouts.some((workout) => workout.id === current);
            if (stillExists) {
                return current;
            }

            return node.sourceWorkoutId ?? savedWorkouts[0]?.id ?? '__new__';
        });
    }, [node, savedWorkouts]);

    if (!node) {
        return null;
    }

    const isWorkout = node.type === 'workout';
    const workoutNode = isWorkout ? node : null;
    const restNode = node.type === 'rest' ? node : null;
    const isSingleCycle = workoutNode ? parseInt(workoutNode.config.sets || '0', 10) === 1 : false;

    const handleClose = () => setEditingSessionNodeId(null);

    const handleImportWorkout = () => {
        if (!workoutNode || !selectedWorkoutId || selectedWorkoutId === '__new__') {
            return;
        }

        replaceWorkoutNodeWithSavedWorkout(workoutNode.id, selectedWorkoutId);
    };

    const handleSaveWorkout = () => {
        if (!workoutNode) {
            return;
        }

        const targetWorkoutId = selectedWorkoutId === '__new__' ? null : selectedWorkoutId;
        const result = saveWorkoutFromConfig(workoutNode.name, workoutNode.config, targetWorkoutId);

        if (!result.ok) {
            window.alert(result.error ?? 'Could not save workout.');
        }
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={`${node.type} node editor`}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={handleClose}
        >
            <Card
                className="relative w-[min(920px,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-auto border-border/60 bg-background/95 shadow-[0_30px_120px_rgba(0,0,0,0.55)]"
                onClick={(event) => event.stopPropagation()}
            >
                <CardContent className="space-y-6 p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="rounded-full border border-border/50 bg-muted px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.22em]">
                                    {node.type}
                                </span>
                                <span className="text-sm font-black italic tracking-tight">{node.name}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Edit this node directly. Workout nodes can import from saved workouts.
                            </p>
                        </div>

                        <Button variant="ghost" size="icon" onClick={handleClose} aria-label="Close node editor">
                            <X size={16} />
                        </Button>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="session-node-name" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    Name
                                </Label>
                                <Input
                                    id="session-node-name"
                                    value={node.name}
                                    onChange={(event) => {
                                        if (workoutNode) {
                                            updateWorkoutNode(workoutNode.id, workoutNode.config, event.target.value);
                                        } else if (restNode) {
                                            updateRestNode(restNode.id, restNode.seconds, event.target.value);
                                        }
                                    }}
                                />
                            </div>

                            {workoutNode ? (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {workoutFields.map((field) => {
                                        const Icon = field.icon;
                                        const isDisabled = isSingleCycle && field.key !== 'sets' && field.key !== 'reps' && field.key !== 'seconds';
                                        const shouldGrayOut = isSingleCycle && field.key !== 'sets' && field.key !== 'reps' && field.key !== 'seconds';
                                        return (
                                            <div key={field.key} className={cn('space-y-2', shouldGrayOut && 'opacity-45')}>
                                                <div className="flex items-center gap-2">
                                                    <Icon size={12} className="text-primary" />
                                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                                        {field.label}
                                                    </Label>
                                                </div>
                                                <Input
                                                    type="number"
                                                    value={workoutNode.config[field.key]}
                                                    disabled={isDisabled}
                                                    onChange={(event) => {
                                                        const nextValue = field.key === 'sets'
                                                            ? normalizeSetsInput(event.target.value)
                                                            : event.target.value;
                                                        updateWorkoutNode(workoutNode.id, {
                                                            ...workoutNode.config,
                                                            [field.key]: nextValue,
                                                        }, workoutNode.name);
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                        Rest Seconds
                                    </Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={restNode?.seconds ?? ''}
                                        onChange={(event) => updateRestNode(restNode!.id, event.target.value, restNode!.name)}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            {workoutNode ? (
                                <div className="space-y-3 rounded-[20px] border border-border/50 bg-muted/20 p-4">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Upload size={14} className="text-primary" />
                                            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                                                Import or Save Workout
                                            </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Replace this node's workout settings, or save the edited node back into your workout library.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="workout-target-select" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                            Workout Target
                                        </Label>
                                        <select
                                            id="workout-target-select"
                                            value={selectedWorkoutId}
                                            onChange={(event) => setSelectedWorkoutId(event.target.value)}
                                            className={cn(
                                                'h-11 w-full rounded-2xl border border-border/50 bg-background px-3 text-sm outline-none',
                                            )}
                                        >
                                            <option value="__new__">Save as new workout...</option>
                                            {savedWorkouts.map((workout) => (
                                                <option key={workout.id} value={workout.id}>
                                                    {workout.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="gap-2 rounded-2xl font-black italic tracking-tighter"
                                            onClick={handleImportWorkout}
                                            disabled={!selectedWorkoutId || selectedWorkoutId === '__new__'}
                                        >
                                            <Upload size={14} />
                                            Import Workout
                                        </Button>

                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="gap-2 rounded-2xl font-black italic tracking-tighter"
                                            onClick={handleSaveWorkout}
                                        >
                                            <Save size={14} />
                                            Save Workout
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-[20px] border border-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
                                    Rest nodes only edit their name and rest duration.
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default SessionNodeEditor;
