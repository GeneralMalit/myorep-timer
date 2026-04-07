import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { SessionNode } from '@/types/savedSessions';
import { cn } from '@/lib/utils';

interface SessionNodeCardProps {
    node: SessionNode;
    isActive?: boolean;
    isDragging?: boolean;
    onSelect: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onDragStart: () => void;
    onDragEnd: () => void;
}

const SessionNodeCard = ({
    node,
    isActive,
    isDragging,
    onSelect,
    onEdit,
    onDelete,
    onDragStart,
    onDragEnd,
}: SessionNodeCardProps) => {
    const isWorkout = node.type === 'workout';
    const workoutConfig = isWorkout ? node.config : null;
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
                'h-[160px] w-[164px] cursor-grab select-none rounded-[14px] border-border/60 bg-card/90 shadow-sm transition-all duration-200 active:cursor-grabbing',
                isActive && 'border-primary/70 ring-2 ring-primary/25',
                isDragging && 'opacity-60 scale-[0.98]',
            )}
        >
            <CardContent className="flex h-full flex-col gap-1 p-2">
                <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1">
                            <span className="rounded-full border border-border/50 bg-muted px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.2em]">
                                {isWorkout ? 'Workout' : 'Rest'}
                            </span>
                            {isActive && (
                                <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.2em] text-primary">
                                    Active
                                </span>
                            )}
                        </div>
                        <div className="truncate text-[12px] font-black italic leading-tight tracking-tight" title={node.name}>
                            {node.name}
                        </div>
                        <div className="truncate text-[8px] leading-tight text-muted-foreground" title={summary}>
                            {summary}
                        </div>
                    </div>

                    <div className="flex items-center gap-1 pt-0.25">
                        <GripVertical size={12} className="text-muted-foreground" />
                    </div>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-1">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 w-full justify-center rounded-lg px-0"
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
                        className="h-7 w-full justify-center rounded-lg px-0"
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
