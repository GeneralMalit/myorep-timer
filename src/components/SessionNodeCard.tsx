import { ChevronLeft, ChevronRight, Trash2, Activity, Square, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SessionNode } from '@/types/savedSessions';
import type { SavedWorkoutConfig } from '@/types/savedWorkouts';
import { cn } from '@/lib/utils';
import { normalizeSetsInput } from '@/utils/savedWorkouts';

interface SessionNodeCardProps {
    node: SessionNode;
    isActive?: boolean;
    onSelect: () => void;
    onMoveLeft: () => void;
    onMoveRight: () => void;
    onRemove: () => void;
    onUpdateWorkout: (config: SavedWorkoutConfig, name?: string) => void;
    onUpdateRest: (seconds: string, name?: string) => void;
}

const workoutFields: Array<{ key: keyof SavedWorkoutConfig; label: string; icon: typeof Zap }> = [
    { key: 'sets', label: 'Sets', icon: Activity },
    { key: 'reps', label: 'Reps', icon: Activity },
    { key: 'seconds', label: 'Seconds', icon: Zap },
    { key: 'rest', label: 'Rest', icon: Square },
    { key: 'myoReps', label: 'Myo Reps', icon: Activity },
    { key: 'myoWorkSecs', label: 'Myo Pace', icon: Zap },
];

const SessionNodeCard = ({
    node,
    isActive,
    onSelect,
    onMoveLeft,
    onMoveRight,
    onRemove,
    onUpdateWorkout,
    onUpdateRest,
}: SessionNodeCardProps) => {
    const workoutNode = node.type === 'workout' ? node : null;
    const restNode = node.type === 'rest' ? node : null;
    const isWorkout = workoutNode !== null;

    return (
        <Card
            className={cn(
                'w-[320px] max-w-[85vw] border-border/60 bg-card/90 shadow-sm transition-all duration-200',
                isActive && 'border-primary/70 ring-2 ring-primary/30 shadow-[0_16px_40px_rgba(139,92,246,0.18)]',
            )}
        >
            <CardContent className="space-y-4 p-4" onClick={onSelect}>
                <div className="flex items-start justify-between gap-3">
                    <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={(event) => {
                            event.stopPropagation();
                            onSelect();
                        }}
                    >
                        <div className="flex items-center gap-2">
                            <span className="rounded-full border border-border/50 bg-muted px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.22em]">
                                {isWorkout ? 'Workout' : 'Rest'}
                            </span>
                            {isActive && (
                                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.22em] text-primary">
                                    Editing
                                </span>
                            )}
                        </div>
                        <div className="mt-2 text-sm font-black italic tracking-tight">{node.name}</div>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                            {isWorkout
                                ? `${node.config.sets} sets, ${node.config.reps} reps, ${node.config.seconds}s pace, ${node.config.rest || '0'}s rest, ${node.config.myoReps || '0'} myo reps, ${node.config.myoWorkSecs || '0'}s myo pace`
                                : `${node.seconds}s rest`}
                        </p>
                    </button>
                </div>

                {isActive && (
                    <div className="space-y-4 border-t border-border/50 pt-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Name</Label>
                            <Input
                                value={node.name}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => {
                                    if (workoutNode) {
                                        onUpdateWorkout(workoutNode.config, event.target.value);
                                    } else if (restNode) {
                                        onUpdateRest(restNode.seconds, event.target.value);
                                    }
                                }}
                            />
                        </div>

                        {isWorkout ? (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                                                onClick={(event) => event.stopPropagation()}
                                                onChange={(event) => {
                                                    const nextValue = field.key === 'sets'
                                                        ? normalizeSetsInput(event.target.value)
                                                        : event.target.value;
                                                    onUpdateWorkout({
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
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Rest Seconds</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={restNode?.seconds ?? ''}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) => onUpdateRest(event.target.value, node.name)}
                                />
                            </div>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={(event) => {
                            event.stopPropagation();
                            onMoveLeft();
                        }}
                        aria-label={`Move ${node.name} left`}
                    >
                        <ChevronLeft size={14} />
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={(event) => {
                            event.stopPropagation();
                            onMoveRight();
                        }}
                        aria-label={`Move ${node.name} right`}
                    >
                        <ChevronRight size={14} />
                    </Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={(event) => {
                            event.stopPropagation();
                            onRemove();
                        }}
                        aria-label={`Remove ${node.name}`}
                    >
                        <Trash2 size={14} />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default SessionNodeCard;

