import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { SessionNode } from '@/types/savedSessions';
import SessionNodeCard from '@/components/SessionNodeCard';

interface SessionCanvasProps {
    nodes: SessionNode[];
    activeNodeId: string | null;
    onEditNode: (nodeId: string) => void;
    onMoveLeft: (nodeId: string) => void;
    onMoveRight: (nodeId: string) => void;
    onRemoveNode: (nodeId: string) => void;
    onInsertWorkoutHere: (afterNodeId: string | null) => void;
    onInsertRestHere: (afterNodeId: string | null) => void;
}

const addBar = (onWorkout: () => void, onRest: () => void) => (
    <div className="flex flex-wrap items-center justify-center gap-2 py-3">
        <Button variant="outline" size="sm" onClick={onWorkout} className="gap-1">
            <Plus size={12} /> Workout
        </Button>
        <Button variant="outline" size="sm" onClick={onRest} className="gap-1">
            <Plus size={12} /> Rest
        </Button>
    </div>
);

const SessionCanvas = ({
    nodes,
    activeNodeId,
    onEditNode,
    onMoveLeft,
    onMoveRight,
    onRemoveNode,
    onInsertWorkoutHere,
    onInsertRestHere,
}: SessionCanvasProps) => {
    return (
        <Card className="border-border/60 bg-muted/20">
            <CardContent className="space-y-4 p-5">
                <div className="text-xs font-black uppercase tracking-[0.28em] text-muted-foreground">Session Canvas</div>
                <div className="space-y-4">
                    <div className="mx-auto w-fit rounded-full border border-border/50 bg-background px-4 py-1 text-[10px] font-black uppercase tracking-widest">
                        Start
                    </div>

                    {addBar(
                        () => onInsertWorkoutHere(null),
                        () => onInsertRestHere(null),
                    )}

                    {nodes.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-border/50 bg-background/60 p-6 text-center text-sm text-muted-foreground">
                            Add workout and rest nodes to build the session.
                        </div>
                    )}

                    {nodes.map((node, index) => (
                        <div key={node.id} className="space-y-4">
                            <SessionNodeCard
                                node={node}
                                isActive={node.id === activeNodeId}
                                onEdit={() => onEditNode(node.id)}
                                onMoveLeft={() => onMoveLeft(node.id)}
                                onMoveRight={() => onMoveRight(node.id)}
                                onRemove={() => onRemoveNode(node.id)}
                            />
                            {addBar(
                                () => onInsertWorkoutHere(node.id),
                                () => onInsertRestHere(node.id),
                            )}
                            {index === nodes.length - 1 && (
                                <div className="mx-auto w-fit rounded-full border border-border/50 bg-background px-4 py-1 text-[10px] font-black uppercase tracking-widest">
                                    End
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};

export default SessionCanvas;
