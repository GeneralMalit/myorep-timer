import { useEffect, useMemo, useState } from 'react';
import { X, Activity, Square, Zap, Upload } from 'lucide-react';
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
        updateWorkoutNode,
        updateRestNode,
    } = useWorkoutStore();
    const [selectedWorkoutId, setSelectedWorkoutId] = useState('');

    const node = useMemo(() => {
        if (!editingSessionDraft || !editingSessionNodeId) {
            return null;
        }

        return editingSessionDraft.nodes.find((entry) => entry.id === editingSessionNodeId) ?? null;
    }, [editingSessionDraft, editingSessionNodeId]);

    useEffect(() => {
        if (!node || node.type !== 'workout') {
            setSelectedWorkoutId('');
            return;
        }

        setSelectedWorkoutId(node.sourceWorkoutId ?? savedWorkouts[0]?.id ?? '');
    }, [node, savedWorkouts]);

    if (!node) {
        return null;
    }

    const isWorkout = node.type === 'workout';
    const workoutNode = isWorkout ? node : null;
    const restNode = node.type === 'rest' ? node : null;

    const handleClose = () => setEditingSessionNodeId(null);

    const handleImportWorkout = () => {
        if (!workoutNode || !selectedWorkoutId) {
            return;
        }

        replaceWorkoutNodeWithSavedWorkout(workoutNode.id, selectedWorkoutId);
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
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    Name
                                </Label>
                                <Input
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
                                        return (
                                            <div key={field.key} className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <Icon size={12} className="text-primary" />
                                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                                        {field.label}
                                                    </Label>
                                                </div>
                                                <Input
                                                    type="number"
                                                    value={workoutNode.config[field.key]}
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
                                                Import Saved Workout
                                            </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Replace this node’s workout settings with one of your saved workouts.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                            Saved Workout
                                        </Label>
                                        <select
                                            value={selectedWorkoutId}
                                            onChange={(event) => setSelectedWorkoutId(event.target.value)}
                                            className={cn(
                                                'h-11 w-full rounded-2xl border border-border/50 bg-background px-3 text-sm outline-none',
                                            )}
                                        >
                                            <option value="">Select workout...</option>
                                            {savedWorkouts.map((workout) => (
                                                <option key={workout.id} value={workout.id}>
                                                    {workout.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="w-full gap-2 rounded-2xl font-black italic tracking-tighter"
                                        onClick={handleImportWorkout}
                                        disabled={!selectedWorkoutId}
                                    >
                                        <Upload size={14} />
                                        Import Workout
                                    </Button>
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
