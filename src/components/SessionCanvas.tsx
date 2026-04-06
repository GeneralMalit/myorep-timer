import { Plus, Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SessionNode } from '@/types/savedSessions';
import type { SavedWorkoutConfig } from '@/types/savedWorkouts';
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
    onUpdateWorkoutNode: (nodeId: string, config: SavedWorkoutConfig, name?: string) => void;
    onUpdateRestNode: (nodeId: string, seconds: string, name?: string) => void;
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
    onUpdateWorkoutNode,
    onUpdateRestNode,
}: SessionCanvasProps) => {
    return (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[32px] border border-border/50 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)] bg-[size:28px_28px] bg-black/90 shadow-[0_24px_80px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between gap-4 border-b border-white/5 px-6 py-4">
                <div className="space-y-1">
                    <div className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                        Session Canvas
                    </div>
                    <div className="text-sm text-muted-foreground">
                        Nodes stay editable right on the canvas.
                    </div>
                </div>
                <div className="hidden sm:flex">
                    {insertButtons(
                        () => onInsertWorkoutHere(null),
                        () => onInsertRestHere(null),
                    )}
                </div>
            </div>

            <div className="relative flex min-h-0 flex-1 overflow-auto">
                <div className="flex min-h-full min-w-full items-center px-6 py-10 sm:px-10 lg:px-14">
                    <div className="flex min-h-[520px] min-w-full items-center justify-center gap-6 md:justify-start md:gap-8">
                        <Anchor label="Start" tone="start" icon={Play} />

                        <div className="flex min-h-0 flex-1 items-center gap-4 overflow-x-auto py-6 md:gap-6">
                            {nodes.length === 0 ? (
                                <div className="flex min-h-[240px] min-w-[360px] flex-1 items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/3 px-8 text-center">
                                    <div className="max-w-sm space-y-2">
                                        <div className="text-sm font-black italic tracking-tight text-foreground">
                                            Empty canvas
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            Add nodes to build the session chain. Edit each node directly on the canvas.
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            {nodes.map((node, index) => (
                                <div key={node.id} className="flex items-center gap-4">
                                    {index > 0 && (
                                        <div className="hidden h-px w-12 bg-white/10 md:block" />
                                    )}
                                    <SessionNodeCard
                                        node={node}
                                        isActive={node.id === activeNodeId}
                                        onSelect={() => onEditNode(node.id)}
                                        onMoveLeft={() => onMoveLeft(node.id)}
                                        onMoveRight={() => onMoveRight(node.id)}
                                        onRemove={() => onRemoveNode(node.id)}
                                        onUpdateWorkout={(config, name) => onUpdateWorkoutNode(node.id, config, name)}
                                        onUpdateRest={(seconds, name) => onUpdateRestNode(node.id, seconds, name)}
                                    />
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="hidden md:block h-px w-8 bg-white/10" />
                                        <div className="md:hidden h-8 w-px bg-white/10" />
                                        <div className="flex">
                                            {insertButtons(
                                                () => onInsertWorkoutHere(node.id),
                                                () => onInsertRestHere(node.id),
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <Anchor label="End" tone="end" icon={Square} />
                    </div>
                </div>
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
