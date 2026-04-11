import { AlertTriangle, ArrowLeft, ArrowRight, GripVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import type { SessionNode } from '@/types/savedSessions';
import { hasLinkedWorkoutSource } from '@/utils/savedSessions';
import { cn } from '@/lib/utils';

interface SessionNodeCardProps {
    node: SessionNode;
    isActive?: boolean;
    isDragging?: boolean;
    canMoveLeft?: boolean;
    canMoveRight?: boolean;
    onSelect: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onMoveLeft: () => void;
    onMoveRight: () => void;
    onDragStart: () => void;
    onDragEnd: () => void;
}

const SessionNodeCard = ({
    node,
    isActive,
    isDragging,
    canMoveLeft,
    canMoveRight,
    onSelect,
    onEdit,
    onDelete,
    onMoveLeft,
    onMoveRight,
    onDragStart,
    onDragEnd,
}: SessionNodeCardProps) => {
    const savedWorkouts = useWorkoutStore((state) => state.savedWorkouts);
    const savedWorkoutIds = savedWorkouts.map((workout) => workout.id);
    const isWorkout = node.type === 'workout';
    const workoutConfig = isWorkout ? node.config : null;
    const isLegacyWorkoutNode = isWorkout && !hasLinkedWorkoutSource(node, savedWorkoutIds);
    const workoutSets = Math.max(0, parseInt(workoutConfig?.sets ?? '0', 10));
    const activationSummary = `${workoutConfig?.reps ?? '0'} @ ${workoutConfig?.seconds ?? '0'}s`;
    const myoSets = Math.max(0, workoutSets - 1);
    const summary = isWorkout
        ? (myoSets > 0
            ? `${activationSummary} + (${myoSets} * ${workoutConfig?.myoReps ?? '0'} @ ${workoutConfig?.myoWorkSecs ?? '0'}s)`
            : activationSummary)
        : `${node.seconds}s rest`;

    return (
        <Card
            draggable
            onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', node.id);
                onDragStart();
            }}
            onDragEnd={onDragEnd}
            onClick={onSelect}
            className={cn(
                'h-[126px] w-[226px] cursor-grab select-none rounded-[14px] border-border/60 bg-card/90 shadow-sm transition-all duration-200 active:cursor-grabbing',
                isActive && 'border-primary/70 ring-2 ring-primary/25',
                isLegacyWorkoutNode && 'border-amber-500/40 bg-amber-500/10',
                isDragging && 'opacity-60 scale-[0.98]',
            )}
        >
            <CardContent className="flex h-full flex-col gap-0.5 p-2">
                <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1">
                            <span className="rounded-full border border-border/50 bg-muted px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.18em]">
                                {isWorkout ? 'Workout' : 'Rest'}
                            </span>
                            {isLegacyWorkoutNode && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.18em] text-amber-200">
                                    <AlertTriangle size={8} />
                                    Legacy
                                </span>
                            )}
                            {isActive && (
                                <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.18em] text-primary">
                                    Active
                                </span>
                            )}
                        </div>
                        <div className="truncate text-[15px] font-black italic leading-none tracking-tight" title={node.name}>
                            {node.name}
                        </div>
                        <div className="truncate text-[10px] leading-tight text-muted-foreground" title={summary}>
                            {summary}
                        </div>
                        {isLegacyWorkoutNode && (
                            <div className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-amber-200/90">
                                Export to workout to relink
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1 pt-0.5">
                        <GripVertical size={12} className="text-muted-foreground" />
                    </div>
                </div>

                <div className="mt-auto grid grid-cols-4 gap-1">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-[30px] w-full justify-center rounded-lg px-0"
                        onClick={(event) => {
                            event.stopPropagation();
                            onMoveLeft();
                        }}
                        aria-label={`Move ${node.name} left`}
                        disabled={!canMoveLeft}
                    >
                        <ArrowLeft size={12} />
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-[30px] w-full justify-center rounded-lg px-0"
                        onClick={(event) => {
                            event.stopPropagation();
                            onMoveRight();
                        }}
                        aria-label={`Move ${node.name} right`}
                        disabled={!canMoveRight}
                    >
                        <ArrowRight size={12} />
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-[30px] w-full justify-center rounded-lg px-0"
                        onClick={(event) => {
                            event.stopPropagation();
                            onEdit();
                        }}
                        aria-label={`Edit ${node.name}`}
                    >
                        <Pencil size={12} />
                    </Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        className="h-[30px] w-full justify-center rounded-lg px-0"
                        onClick={(event) => {
                            event.stopPropagation();
                            onDelete();
                        }}
                        aria-label={`Delete ${node.name}`}
                    >
                        <Trash2 size={12} />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default SessionNodeCard;
