import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { SessionNode } from '@/types/savedSessions';
import { cn } from '@/lib/utils';

interface SessionNodeCardProps {
    node: SessionNode;
    isActive?: boolean;
    onEdit: () => void;
    onMoveLeft: () => void;
    onMoveRight: () => void;
    onRemove: () => void;
}

const SessionNodeCard = ({ node, isActive, onEdit, onMoveLeft, onMoveRight, onRemove }: SessionNodeCardProps) => {
    const isWorkout = node.type === 'workout';

    return (
        <Card className={cn('border-border/60 bg-card/90 shadow-sm', isActive && 'border-primary/70 ring-1 ring-primary/20')}>
            <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="rounded-full border border-border/50 bg-muted px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.22em]">
                                {isWorkout ? 'Workout' : 'Rest'}
                            </span>
                            <span className="text-xs font-bold text-muted-foreground">{node.name}</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                            {isWorkout
                                ? `${node.config.sets} sets, ${node.config.reps} reps, ${node.config.seconds}s pace, ${node.config.rest || '0'}s rest, ${node.config.myoReps || '0'} myo reps, ${node.config.myoWorkSecs || '0'}s myo pace`
                                : `${node.seconds}s rest`}
                        </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${node.name}`} title="Edit">
                        <Pencil size={14} />
                    </Button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <Button variant="secondary" size="sm" onClick={onMoveLeft} aria-label={`Move ${node.name} left`}>
                        <ChevronLeft size={14} />
                    </Button>
                    <Button variant="secondary" size="sm" onClick={onMoveRight} aria-label={`Move ${node.name} right`}>
                        <ChevronRight size={14} />
                    </Button>
                    <Button variant="destructive" size="sm" onClick={onRemove} aria-label={`Remove ${node.name}`}>
                        <Trash2 size={14} />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default SessionNodeCard;

