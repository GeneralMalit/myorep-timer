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
        <aside className="min-w-0 rounded-xl border border-current/15 p-5" aria-label="Session timeline" style={{ color: foregroundColor }}>
            <div className="text-xs font-semibold" style={{ color: mutedColor }}>Session timeline</div>
            <ol className="mt-4 max-h-80 space-y-1 overflow-y-auto" aria-label={`Session progress: ${timerStatus}`}>
                {session.nodes.map((node, index) => {
                    const isComplete = index < activeNodeIndex || timerStatus === 'Finished';
                    const isActive = !isComplete && index === activeNodeIndex;
                    return (
                        <li
                            key={node.id}
                            aria-current={isActive ? 'step' : undefined}
                            className="border-l-2 py-3 pl-4 text-sm"
                            style={{
                                borderColor: isComplete ? finishedColor : (isActive ? themeColor : 'color-mix(in srgb, currentColor 25%, transparent)'),
                                color: isActive ? foregroundColor : mutedColor,
                            }}
                        >
                            <div className="flex items-start justify-between gap-3 font-medium"><span className="min-w-0 break-words">{node.name}</span><span className="shrink-0 text-xs" style={{ color: mutedColor }}>{isComplete ? 'Done' : isActive ? 'Now' : String(index + 1).padStart(2, '0')}</span></div>
                            <div className="mt-1 text-xs" style={{ color: mutedColor }}>
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
