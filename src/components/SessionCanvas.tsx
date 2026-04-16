import { useEffect, useMemo, useRef, useState } from 'react';
import type { SessionNode } from '@/types/savedSessions';
import { cn } from '@/lib/utils';
import SessionNodeCard from '@/components/SessionNodeCard';

interface SessionCanvasProps {
    nodes: SessionNode[];
    activeNodeId: string | null;
    onEditNode: (nodeId: string) => void;
    onRemoveNode: (nodeId: string) => void;
    onMoveNode: (nodeId: string, direction: 'left' | 'right') => void;
    onMoveNodeToIndex: (nodeId: string, targetIndex: number) => void;
}

const SessionCanvas = ({
    nodes,
    activeNodeId,
    onEditNode,
    onRemoveNode,
    onMoveNode,
    onMoveNodeToIndex,
}: SessionCanvasProps) => {
    const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const [canvasOffset, setCanvasOffset] = useState({ x: 28, y: 28 });
    const panStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
    const isInteractiveTarget = (target: EventTarget | null) => {
        if (!(target instanceof HTMLElement)) {
            return false;
        }

        return Boolean(target.closest('button, input, select, textarea, label, a, [role="button"]'));
    };

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return;
        }

        const mediaQuery = window.matchMedia('(max-width: 767px)');
        const handleViewportChange = (event: MediaQueryListEvent | MediaQueryList) => {
            setIsMobileViewport(event.matches);
            setCanvasOffset(event.matches ? { x: 28, y: 28 } : { x: 0, y: 0 });
        };

        handleViewportChange(mediaQuery);
        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handleViewportChange);
            return () => mediaQuery.removeEventListener('change', handleViewportChange);
        }

        mediaQuery.addListener(handleViewportChange);
        return () => mediaQuery.removeListener(handleViewportChange);
    }, []);

    const boardWidth = useMemo(() => {
        const cardWidth = isMobileViewport ? 296 : 248;
        const gap = isMobileViewport ? 18 : 14;
        const baseWidth = nodes.length === 0 ? (isMobileViewport ? 760 : 860) : (nodes.length * cardWidth) + (Math.max(nodes.length - 1, 0) * gap) + 160;
        return Math.max(baseWidth, isMobileViewport ? 760 : 920);
    }, [isMobileViewport, nodes.length]);

    const boardHeight = isMobileViewport ? 440 : 420;

    const handleDrop = (targetIndex: number) => {
        if (!draggedNodeId) {
            return;
        }

        onMoveNodeToIndex(draggedNodeId, targetIndex);
        setDraggedNodeId(null);
        setDropIndex(null);
    };

    const beginPan = (clientX: number, clientY: number) => {
        panStateRef.current = {
            startX: clientX,
            startY: clientY,
            originX: canvasOffset.x,
            originY: canvasOffset.y,
        };
    };

    const updatePan = (clientX: number, clientY: number) => {
        const currentPan = panStateRef.current;
        if (!currentPan || !isMobileViewport) {
            return;
        }

        setCanvasOffset({
            x: currentPan.originX + (clientX - currentPan.startX),
            y: currentPan.originY + (clientY - currentPan.startY),
        });
    };

    const endPan = () => {
        panStateRef.current = null;
    };

    return isMobileViewport ? (
        <div
            data-testid="session-canvas-frame"
            className="relative flex min-h-[360px] w-full flex-col overflow-hidden rounded-[28px] border border-border/50 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)] bg-[size:28px_28px] bg-black/90 shadow-[0_24px_80px_rgba(0,0,0,0.25)]"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
                event.preventDefault();
                handleDrop(nodes.length);
            }}
        >
            <div className="border-b border-white/5 px-4 py-3">
                <div className="space-y-1">
                    <div className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                        Session Canvas
                    </div>
                    <div className="text-xs text-muted-foreground">
                        Drag the canvas to explore, then edit or reorder nodes from each card.
                    </div>
                </div>
            </div>

            <div
                data-testid="session-canvas-viewport"
                className="relative min-h-0 flex-1 overflow-hidden touch-none cursor-grab active:cursor-grabbing"
                onPointerDown={(event) => {
                    if (isInteractiveTarget(event.target)) {
                        return;
                    }

                    if (typeof event.currentTarget.setPointerCapture === 'function') {
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }
                    beginPan(event.clientX, event.clientY);
                }}
                onPointerMove={(event) => updatePan(event.clientX, event.clientY)}
                onPointerUp={(event) => {
                    if (typeof event.currentTarget.releasePointerCapture === 'function') {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                    endPan();
                }}
                onPointerLeave={endPan}
                onPointerCancel={(event) => {
                    if (
                        typeof event.currentTarget.hasPointerCapture === 'function'
                        && event.currentTarget.hasPointerCapture(event.pointerId)
                        && typeof event.currentTarget.releasePointerCapture === 'function'
                    ) {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                    endPan();
                }}
            >
                <div
                    data-testid="session-canvas-board"
                    className="absolute left-0 top-0"
                    style={{
                        width: `${boardWidth}px`,
                        height: `${boardHeight}px`,
                        transform: `translate3d(${canvasOffset.x}px, ${canvasOffset.y}px, 0)`,
                        transition: panStateRef.current ? 'none' : 'transform 160ms ease',
                    }}
                >
                    {nodes.length === 0 ? (
                        <div className="flex h-full w-full items-center justify-center px-6 py-6">
                            <div className="h-[220px] w-full rounded-[28px] border border-dashed border-white/10 bg-white/[0.02]" />
                        </div>
                    ) : (
                        <div className="absolute left-10 top-1/2 flex -translate-y-1/2 items-center gap-3 md:gap-4">
                            {nodes.map((node, index) => (
                                <div
                                    key={node.id}
                                    className="flex items-center gap-2"
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        setDropIndex(index);
                                    }}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        handleDrop(index);
                                    }}
                                >
                                    {dropIndex === index && draggedNodeId && draggedNodeId !== node.id && (
                                        <div className="h-28 w-1 rounded-full bg-primary/80 shadow-[0_0_18px_rgba(139,92,246,0.45)]" />
                                    )}
                                    <SessionNodeCard
                                        node={node}
                                        isActive={node.id === activeNodeId}
                                        isDragging={draggedNodeId === node.id}
                                        isMobile
                                        canMoveLeft={index > 0}
                                        canMoveRight={index < nodes.length - 1}
                                        onSelect={() => onEditNode(node.id)}
                                        onEdit={() => onEditNode(node.id)}
                                        onDelete={() => onRemoveNode(node.id)}
                                        onMoveLeft={() => onMoveNode(node.id, 'left')}
                                        onMoveRight={() => onMoveNode(node.id, 'right')}
                                        onDragStart={() => setDraggedNodeId(node.id)}
                                        onDragEnd={() => {
                                            setDraggedNodeId(null);
                                            setDropIndex(null);
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    ) : (
        <div
            data-testid="session-canvas-frame"
            className="relative flex min-h-[420px] w-full flex-1 flex-col overflow-hidden rounded-[32px] border border-border/50 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)] bg-[size:28px_28px] bg-black/90 shadow-[0_24px_80px_rgba(0,0,0,0.25)]"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
                event.preventDefault();
                handleDrop(nodes.length);
            }}
        >
            <div className="border-b border-white/5 px-6 py-4">
                <div className="space-y-1">
                    <div className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                        Session Canvas
                    </div>
                    <div className="text-sm text-muted-foreground">
                        Drag tiles or use the move buttons to reorder. Edit opens the node modal.
                    </div>
                </div>
            </div>

            <div className="relative flex min-h-0 flex-1 overflow-auto">
                <div className="flex min-h-full min-w-full items-stretch px-6 py-10 sm:px-10 lg:px-14">
                    <div className="flex min-h-full min-w-full items-center gap-3 md:gap-4">
                        <div className="flex min-h-full flex-1 items-center overflow-x-auto py-6">
                            <div className="flex min-h-full min-w-full items-center gap-2.5 md:gap-3">
                                {nodes.length === 0 ? (
                                    <div className="flex min-h-[320px] min-w-[320px] flex-1 items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/3 px-8 text-center">
                                        <div className="max-w-sm space-y-2">
                                            <div className="text-sm font-black italic tracking-tight text-foreground">
                                                Empty canvas
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                Add workout and rest nodes from the builder actions, then drag them around here.
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    nodes.map((node, index) => (
                                        <div
                                            key={node.id}
                                            className="flex items-center gap-2"
                                            onDragOver={(event) => {
                                                event.preventDefault();
                                                setDropIndex(index);
                                            }}
                                            onDrop={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                handleDrop(index);
                                            }}
                                        >
                                            {dropIndex === index && draggedNodeId && draggedNodeId !== node.id && (
                                                <div className="h-36 w-1 rounded-full bg-primary/80 shadow-[0_0_18px_rgba(139,92,246,0.45)]" />
                                            )}
                                            <SessionNodeCard
                                                node={node}
                                                isActive={node.id === activeNodeId}
                                                isDragging={draggedNodeId === node.id}
                                                canMoveLeft={index > 0}
                                                canMoveRight={index < nodes.length - 1}
                                                onSelect={() => onEditNode(node.id)}
                                                onEdit={() => onEditNode(node.id)}
                                                onDelete={() => onRemoveNode(node.id)}
                                                onMoveLeft={() => onMoveNode(node.id, 'left')}
                                                onMoveRight={() => onMoveNode(node.id, 'right')}
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
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SessionCanvas;
