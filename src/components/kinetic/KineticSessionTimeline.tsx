import { memo } from 'react';
import type { TimerStatus } from '@/store/useWorkoutStore';
import type { SavedSession } from '@/types/savedSessions';

interface KineticSessionTimelineProps {
    session: SavedSession | null;
    activeNodeIndex: number;
    timerStatus: TimerStatus;
    foregroundColor: string;
    mutedColor: string;
    finishedColor: string;
    themeColor: string;
}

const KineticSessionTimeline = memo(function KineticSessionTimeline({
    session,
    activeNodeIndex,
    timerStatus,
    foregroundColor,
    mutedColor,
    finishedColor,
    themeColor,
}: KineticSessionTimelineProps) {
    if (!session) return null;

    return (
        <aside className="border-l border-white/10 pl-5" aria-label="Session timeline">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Session timeline</div>
            <ol className="mt-5 space-y-1" aria-label={`Session progress: ${timerStatus}`}>
                {session.nodes.map((node, index) => {
                    const isComplete = index < activeNodeIndex;
                    const isActive = index === activeNodeIndex;
                    return (
                        <li
                            key={node.id}
                            className="border-l-2 py-3 pl-4 text-sm"
                            style={{
                                borderColor: isComplete ? finishedColor : (isActive ? themeColor : 'rgba(255,255,255,0.15)'),
                                color: isActive ? foregroundColor : mutedColor,
                            }}
                        >
                            <div className="font-medium">{node.name}</div>
                            <div className="mt-1 text-xs text-zinc-500">
                                {node.type === 'rest' ? `${node.seconds} sec rest` : `${node.config.sets} cycles · ${node.config.reps} reps`}
                            </div>
                        </li>
                    );
                })}
            </ol>
        </aside>
    );
});

export default KineticSessionTimeline;
