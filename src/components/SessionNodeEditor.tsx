import { useMemo } from 'react';
import { Activity, Square, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SessionNode } from '@/types/savedSessions';
import type { SavedWorkoutConfig } from '@/types/savedWorkouts';
import { cn } from '@/lib/utils';
import { normalizeSetsInput } from '@/utils/savedWorkouts';

interface SessionNodeEditorProps {
    node: SessionNode | null;
    onUpdateWorkout: (nodeId: string, config: SavedWorkoutConfig, name?: string) => void;
    onUpdateRest: (nodeId: string, seconds: string, name?: string) => void;
}

const workoutFields: Array<{ key: keyof SavedWorkoutConfig; label: string; icon: typeof Zap }> = [
    { key: 'sets', label: 'Sets', icon: Activity },
    { key: 'reps', label: 'Reps', icon: Activity },
    { key: 'seconds', label: 'Seconds', icon: Zap },
    { key: 'rest', label: 'Rest', icon: Square },
    { key: 'myoReps', label: 'Myo Reps', icon: Activity },
    { key: 'myoWorkSecs', label: 'Myo Pace', icon: Zap },
];

const SessionNodeEditor = ({ node, onUpdateWorkout, onUpdateRest }: SessionNodeEditorProps) => {
    const workoutNode = node?.type === 'workout' ? node : null;
    const restNode = node?.type === 'rest' ? node : null;

    const workoutPreview = useMemo(() => {
        if (!workoutNode) {
            return null;
        }

        return workoutNode.config;
    }, [workoutNode]);

    if (!node) {
        return (
            <Card className="border-dashed border-border/60 bg-muted/20">
                <CardContent className="p-5 text-sm text-muted-foreground">
                    Select a node to edit its settings.
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-border/60 bg-card/90">
            <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-2">
                    <span className="rounded-full border border-border/50 bg-muted px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.22em]">
                        {node.type}
                    </span>
                    <h3 className="text-sm font-black italic tracking-tight">{node.name}</h3>
                </div>

                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Name</Label>
                        <Input
                            value={node.name}
                            onChange={(event) => {
                                if (workoutNode) {
                                    onUpdateWorkout(workoutNode.id, workoutNode.config, event.target.value);
                                } else if (restNode) {
                                    onUpdateRest(restNode.id, restNode.seconds, event.target.value);
                                }
                            }}
                        />
                    </div>

                    {workoutNode && workoutPreview && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {workoutFields.map((field) => (
                                <div key={field.key} className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                        {field.label}
                                    </Label>
                                    <Input
                                        type="number"
                                        value={workoutPreview[field.key]}
                                        onChange={(event) => {
                                            const nextValue = field.key === 'sets'
                                                ? normalizeSetsInput(event.target.value)
                                                : event.target.value;
                                            onUpdateWorkout(workoutNode.id, {
                                                ...workoutPreview,
                                                [field.key]: nextValue,
                                            }, workoutNode.name);
                                        }}
                                        className={cn('font-semibold')}
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {restNode && (
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Rest Seconds</Label>
                            <Input
                                type="number"
                                value={restNode.seconds}
                                onChange={(event) => onUpdateRest(restNode.id, event.target.value, restNode.name)}
                                className="font-semibold"
                                min={1}
                            />
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

export default SessionNodeEditor;
