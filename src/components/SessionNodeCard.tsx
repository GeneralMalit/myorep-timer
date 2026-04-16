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
    isMobile?: boolean;
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
    isMobile,
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
    const isUnsavedWorkoutNode = isWorkout && !node.sourceWorkoutId;
    const isMissingLinkedWorkout = isWorkout && Boolean(node.sourceWorkoutId) && !hasLinkedWorkoutSource(node, savedWorkoutIds);
    const workoutSets = Math.max(0, parseInt(workoutConfig?.sets ?? '0', 10));
    const activationSummary = `${workoutConfig?.reps ?? '0'} @ ${workoutConfig?.seconds ?? '0'}s`;
    const myoSets = Math.max(0, workoutSets - 1);
    const noteText = isWorkout ? (node.notes ?? '').trim() : '';
    const summary = isWorkout
        ? (myoSets > 0
            ? `${activationSummary} + (${myoSets} * ${workoutConfig?.myoReps ?? '0'} @ ${workoutConfig?.myoWorkSecs ?? '0'}s)`
            : activationSummary)
        : `${node.seconds}s rest`;

    const actionGridClass = isMobile ? 'grid-cols-2' : 'grid-cols-4';
    const actionButtonClass = isMobile
        ? 'h-9 w-full justify-center rounded-xl px-2 text-[9px] font-black uppercase tracking-[0.16em]'
        : 'h-[30px] w-full justify-center rounded-lg px-0';

    return (
        <Card
            draggable={!isMobile}
            onDragStart={(event) => {
                if (isMobile) {
                    event.preventDefault();
                    return;
                }
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', node.id);
                onDragStart();
            }}
            onDragEnd={onDragEnd}
            onClick={onSelect}
            className={cn(
                'select-none border-border/60 bg-card/90 shadow-sm transition-all duration-200 active:cursor-grabbing',
                isMobile
                    ? 'w-[min(14.5rem,66vw)] min-h-[132px] cursor-pointer rounded-[20px]'
                    : 'h-[142px] w-[226px] cursor-grab rounded-[14px]',
                isActive && 'border-primary/70 ring-2 ring-primary/25',
                isUnsavedWorkoutNode && 'border-amber-500/40 bg-amber-500/10',
                isMissingLinkedWorkout && 'border-amber-500/40 bg-amber-500/10',
                isDragging && 'opacity-60 scale-[0.98]',
            )}
        >
            <CardContent className={cn('flex h-full flex-col', isMobile ? 'gap-2 p-1.5' : 'gap-0.5 p-2')}>
                <div className={cn('flex items-start justify-between gap-1', isMobile && 'gap-2')}>
                    <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1">
                            <span className="rounded-full border border-border/50 bg-muted px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.18em]">
                                {isWorkout ? 'Workout' : 'Rest'}
                            </span>
                            {isUnsavedWorkoutNode && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.18em] text-amber-200">
                                    Unsaved
                                </span>
                            )}
                            {isMissingLinkedWorkout && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.18em] text-amber-200">
                                    <AlertTriangle size={8} />
                                    Missing Link
                                </span>
                            )}
                            {isActive && (
                                <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.18em] text-primary">
                                    Active
                                </span>
                            )}
                        </div>
                        <div className={cn(
                            'font-black italic leading-none tracking-tight',
                            isMobile ? 'text-[15px]' : 'truncate text-[15px]',
                        )} title={node.name}>
                            {node.name}
                        </div>
                        <div className={cn(
                            'leading-tight text-muted-foreground',
                            isMobile ? 'text-[10px]' : 'truncate text-[10px]',
                        )} title={summary}>
                            {summary}
                        </div>
                        {noteText && (
                            <div className={cn(
                                'leading-tight text-primary/90',
                                isMobile ? 'text-[10px]' : 'truncate text-[10px]',
                        )} title={noteText}>
                            <span className="font-black uppercase tracking-[0.16em] text-muted-foreground">Note:</span>{' '}
                            {noteText}
                        </div>
                        )}
                    </div>

                    {!isMobile && (
                        <div className="flex items-center gap-1 pt-0.5">
                            <GripVertical size={12} className="text-muted-foreground" />
                        </div>
                    )}
                </div>

                <div className={cn('mt-auto grid gap-1', actionGridClass)}>
                    <Button
                        variant="secondary"
                        size="sm"
                        className={actionButtonClass}
                        onClick={(event) => {
                            event.stopPropagation();
                            onMoveLeft();
                        }}
                        aria-label={`Move ${node.name} left`}
                        disabled={!canMoveLeft}
                    >
                        <ArrowLeft size={12} className="shrink-0" />
                        {isMobile && <span>Left</span>}
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        className={actionButtonClass}
                        onClick={(event) => {
                            event.stopPropagation();
                            onMoveRight();
                        }}
                        aria-label={`Move ${node.name} right`}
                        disabled={!canMoveRight}
                    >
                        <ArrowRight size={12} className="shrink-0" />
                        {isMobile && <span>Right</span>}
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        className={actionButtonClass}
                        onClick={(event) => {
                            event.stopPropagation();
                            onEdit();
                        }}
                        aria-label={`Edit ${node.name}`}
                    >
                        <Pencil size={12} className="shrink-0" />
                        {isMobile && <span>Edit</span>}
                    </Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        className={actionButtonClass}
                        onClick={(event) => {
                            event.stopPropagation();
                            onDelete();
                        }}
                        aria-label={`Delete ${node.name}`}
                    >
                        <Trash2 size={12} className="shrink-0" />
                        {isMobile && <span>Del</span>}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default SessionNodeCard;
