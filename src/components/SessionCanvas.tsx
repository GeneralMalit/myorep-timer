import { Plus, Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SessionNode } from '@/types/savedSessions';
import { cn } from '@/lib/utils';
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

const insertButtons = (onWorkout: () => void, onRest: () => void) => (
    <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="secondary" size="sm" onClick={onWorkout} className="gap-1 rounded-full px-3 text-[10px] font-black uppercase tracking-[0.18em]">
            <Plus size={11} /> Workout
        </Button>
        <Button variant="ghost" size="sm" onClick={onRest} className="gap-1 rounded-full px-3 text-[10px] font-black uppercase tracking-[0.18em]">
            <Plus size={11} /> Rest
        </Button>
    </div>
);

const Anchor = ({ label, tone, icon }: { label: string; tone: 'start' | 'end'; icon: typeof Play | typeof Square }) => {
    const Icon = icon;
    return (
        <div className="flex flex-col items-center gap-2 shrink-0">
            <div
                className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-full shadow-[0_0_24px_rgba(0,0,0,0.35)]',
                    tone === 'start' ? 'bg-secondary text-black' : 'bg-destructive text-white',
                )}
            >
                <Icon size={18} />
            </div>
            <span
                className={cn(
                    'text-[10px] font-black uppercase tracking-[0.28em]',
                    tone === 'start' ? 'text-secondary' : 'text-destructive',
                )}
            >
                {label}
            </span>
        </div>
    );
};

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
        <div className="relative h-full min-h-[640px] overflow-auto rounded-[24px] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)] bg-[size:28px_28px] bg-black/90 p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                    <div className="text-xs font-black uppercase tracking-[0.28em] text-muted-foreground">
                        Session Canvas
                    </div>
                    <div className="text-sm text-muted-foreground">
                        Drag the session into a linear chain.
                    </div>
                </div>
                {insertButtons(
                    () => onInsertWorkoutHere(null),
                    () => onInsertRestHere(null),
                )}
            </div>

            <div className="flex min-h-[520px] flex-col items-center gap-6 md:flex-row md:items-start md:justify-start md:gap-8">
                <Anchor label="Start" tone="start" icon={Play} />

                <div className="flex flex-col items-center gap-4 md:flex-row md:items-stretch md:gap-6">
                    {nodes.length === 0 ? (
                        <div className="max-w-md rounded-[24px] bg-white/5 p-6 text-center text-sm text-muted-foreground">
                            Add workout and rest nodes from the toolbox to build the chain.
                        </div>
                    ) : null}

                    {nodes.map((node, index) => (
                        <div key={node.id} className="flex flex-col items-center gap-4 md:flex-row md:items-center md:gap-6">
                            <SessionNodeCard
                                node={node}
                                isActive={node.id === activeNodeId}
                                onEdit={() => onEditNode(node.id)}
                                onMoveLeft={() => onMoveLeft(node.id)}
                                onMoveRight={() => onMoveRight(node.id)}
                                onRemove={() => onRemoveNode(node.id)}
                            />
                            <div className="flex items-center gap-2">
                                <div className="hidden md:block h-px w-10 bg-white/10" />
                                <div className="md:hidden h-10 w-px bg-white/10" />
                                <div className="hidden md:flex">
                                    {insertButtons(
                                        () => onInsertWorkoutHere(node.id),
                                        () => onInsertRestHere(node.id),
                                    )}
                                </div>
                            </div>
                            {index === nodes.length - 1 && (
                                <div className="ml-0 flex flex-col items-center gap-2 md:ml-2">
                                    <Anchor label="End" tone="end" icon={Square} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {nodes.length > 0 && (
                    <div className="md:self-center">
                        {insertButtons(
                            () => onInsertWorkoutHere(null),
                            () => onInsertRestHere(null),
                        )}
                    </div>
                )}
            </div>

            <button
                type="button"
                className="absolute bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_16px_40px_rgba(139,92,246,0.28)] transition-transform hover:scale-105 active:scale-95"
                onClick={() => onInsertWorkoutHere(nodes.length > 0 ? nodes[nodes.length - 1].id : null)}
                aria-label="Add workout node"
                title="Add workout node"
            >
                <Plus size={22} />
            </button>
        </div>
    );
};

export default SessionCanvas;
