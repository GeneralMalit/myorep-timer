import { GripVertical, Pencil, Trash2, Activity, Square, Zap } from 'lucide-react';
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
    const summary = isWorkout
        ? `${node.config.sets} x ${node.config.reps} @ ${node.config.seconds}s`
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
                'w-[180px] cursor-grab select-none rounded-[18px] border-border/60 bg-card/90 shadow-sm transition-all duration-200 active:cursor-grabbing',
                isActive && 'border-primary/70 ring-2 ring-primary/25',
                isDragging && 'opacity-60 scale-[0.98]',
            )}
        >
            <CardContent className="space-y-3 p-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="rounded-full border border-border/50 bg-muted px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.24em]">
                                {isWorkout ? 'Workout' : 'Rest'}
                            </span>
                            {isActive && (
                                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.24em] text-primary">
                                    Active
                                </span>
                            )}
                        </div>
                        <div className="truncate text-sm font-black italic tracking-tight">{node.name}</div>
                        <div className="text-[10px] leading-tight text-muted-foreground">{summary}</div>
                    </div>

                    <div className="flex items-center gap-1">
                        <GripVertical size={14} className="text-muted-foreground" />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 gap-1 rounded-xl text-[10px] font-black uppercase tracking-[0.18em]"
                        onClick={(event) => {
                            event.stopPropagation();
                            onEdit();
                        }}
                        aria-label={`Edit ${node.name}`}
                    >
                        <Pencil size={12} />
                        Edit
                    </Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 gap-1 rounded-xl text-[10px] font-black uppercase tracking-[0.18em]"
                        onClick={(event) => {
                            event.stopPropagation();
                            onDelete();
                        }}
                        aria-label={`Delete ${node.name}`}
                    >
                        <Trash2 size={12} />
                        Delete
                    </Button>
                </div>

                {isWorkout && (
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                        <Activity size={11} className="text-primary" />
                        <span>{node.config.rest || '0'}s rest</span>
                        <Zap size={11} className="text-primary ml-1" />
                        <span>{node.config.myoWorkSecs || '0'}s myo</span>
                    </div>
                )}

                {!isWorkout && (
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                        <Square size={11} className="text-primary" />
                        <span>Recovery node</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default SessionNodeCard;
