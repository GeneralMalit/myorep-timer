import { useState } from 'react';
import { Play, Square } from 'lucide-react';
import type { SessionNode } from '@/types/savedSessions';
import { cn } from '@/lib/utils';
import SessionNodeCard from '@/components/SessionNodeCard';

interface SessionCanvasProps {
    nodes: SessionNode[];
    activeNodeId: string | null;
    onEditNode: (nodeId: string) => void;
    onRemoveNode: (nodeId: string) => void;
    onMoveNodeToIndex: (nodeId: string, targetIndex: number) => void;
}

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
    onRemoveNode,
    onMoveNodeToIndex,
}: SessionCanvasProps) => {
    const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);

    const handleDrop = (targetIndex: number) => {
        if (!draggedNodeId) {
            return;
        }

        onMoveNodeToIndex(draggedNodeId, targetIndex);
        setDraggedNodeId(null);
        setDropIndex(null);
    };

    return (
        <div
            className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[32px] border border-border/50 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)] bg-[size:28px_28px] bg-black/90 shadow-[0_24px_80px_rgba(0,0,0,0.25)]"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
                event.preventDefault();
                handleDrop(nodes.length);
            }}
        >
            <div className="flex items-center justify-between gap-4 border-b border-white/5 px-6 py-4">
                <div className="space-y-1">
                    <div className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                        Session Canvas
                    </div>
                    <div className="text-sm text-muted-foreground">
                        Drag tiles to reorder. Edit opens the node modal.
                    </div>
                </div>
                <div className="text-[10px] font-black uppercase tracking-[0.26em] text-muted-foreground">
                    Start {nodes.length ? '-> Nodes ->' : '->'} End
                </div>
            </div>

            <div className="relative flex min-h-0 flex-1 overflow-auto">
                <div className="flex min-h-full min-w-full items-stretch px-6 py-10 sm:px-10 lg:px-14">
                    <div className="flex min-h-full min-w-full items-center gap-6 md:gap-8">
                        <Anchor label="Start" tone="start" icon={Play} />

                        <div className="flex min-h-full flex-1 items-center overflow-x-auto py-6">
                            <div className="flex min-h-full min-w-full items-center gap-4 md:gap-6">
                                {nodes.length === 0 ? (
                                    <div className="flex min-h-[320px] min-w-[320px] flex-1 items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/3 px-8 text-center">
                                        <div className="max-w-sm space-y-2">
                                            <div className="text-sm font-black italic tracking-tight text-foreground">
                                                Empty canvas
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                Add workout and rest nodes from the header, then drag them around here.
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    nodes.map((node, index) => (
                                        <div
                                            key={node.id}
                                            className="flex items-center gap-4"
                                            onDragOver={(event) => {
                                                event.preventDefault();
                                                setDropIndex(index);
                                            }}
                                            onDrop={(event) => {
                                                event.preventDefault();
                                                handleDrop(index);
                                            }}
                                        >
                                            {dropIndex === index && draggedNodeId && draggedNodeId !== node.id && (
                                                <div className="h-60 w-1 rounded-full bg-primary/80 shadow-[0_0_18px_rgba(139,92,246,0.45)]" />
                                            )}
                                            <SessionNodeCard
                                                node={node}
                                                isActive={node.id === activeNodeId}
                                                isDragging={draggedNodeId === node.id}
                                                onSelect={() => onEditNode(node.id)}
                                                onEdit={() => onEditNode(node.id)}
                                                onDelete={() => onRemoveNode(node.id)}
                                                onDragStart={() => setDraggedNodeId(node.id)}
                                                onDragEnd={() => {
                                                    setDraggedNodeId(null);
                                                    setDropIndex(null);
                                                }}
                                            />
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <Anchor label="End" tone="end" icon={Square} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SessionCanvas;
