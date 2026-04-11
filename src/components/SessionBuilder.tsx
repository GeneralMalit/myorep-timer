import { useMemo, useState } from 'react';
import { AlertTriangle, Plus, Play, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SessionCanvas from '@/components/SessionCanvas';
import SessionNodeEditor from '@/components/SessionNodeEditor';
import SetupModeToggle from '@/components/SetupModeToggle';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { estimateSessionDurationSeconds, formatEstimatedSessionDuration, getLegacyWorkoutSessionNodes } from '@/utils/savedSessions';
import { cn } from '@/lib/utils';

type SessionBuilderDialogState =
    | {
        type: 'new-session' | 'save-session-as' | 'message';
        title: string;
        description: string;
        value?: string;
        confirmLabel?: string;
    }
    | null;

interface BuilderDialogProps {
    state: SessionBuilderDialogState;
    onChangeValue: (value: string) => void;
    onClose: () => void;
    onConfirm: () => void;
}

const BuilderDialog = ({ state, onChangeValue, onClose, onConfirm }: BuilderDialogProps) => {
    if (!state) {
        return null;
    }

    const isPrompt = state.type === 'new-session' || state.type === 'save-session-as';

    return (
        <div
            className="fixed inset-0 z-[115] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={state.title}
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div className="w-full max-w-md rounded-[28px] border border-border/60 bg-background/95 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
                <div className="space-y-2">
                    <div className="text-[11px] font-black uppercase tracking-[0.32em] text-primary">
                        Session Action
                    </div>
                    <h2 className="text-2xl font-black italic tracking-tight text-foreground">
                        {state.title}
                    </h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        {state.description}
                    </p>
                </div>

                {isPrompt && (
                    <div className="mt-5 space-y-2">
                        <Label htmlFor="session-builder-dialog-name" className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                            Session Name
                        </Label>
                        <Input
                            id="session-builder-dialog-name"
                            value={state.value ?? ''}
                            onChange={(event) => onChangeValue(event.target.value)}
                            autoFocus
                        />
                    </div>
                )}

                <div className={cn('mt-6 grid gap-2', isPrompt ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2')}>
                    <Button type="button" variant="secondary" onClick={onClose} className="rounded-2xl font-black italic tracking-tighter">
                        {isPrompt ? 'Cancel' : 'Close'}
                    </Button>
                    <Button
                        type="button"
                        onClick={onConfirm}
                        className="rounded-2xl font-black italic tracking-tighter"
                    >
                        {isPrompt ? state.confirmLabel : 'Got It'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

const SessionBuilder = () => {
    const editingSessionDraft = useWorkoutStore((state) => state.editingSessionDraft);
    const editingSessionNodeId = useWorkoutStore((state) => state.editingSessionNodeId);
    const setEditingSessionNodeId = useWorkoutStore((state) => state.setEditingSessionNodeId);
    const prepTime = useWorkoutStore((state) => state.settings.prepTime);
    const savedWorkouts = useWorkoutStore((state) => state.savedWorkouts);
    const setupMode = useWorkoutStore((state) => state.setupMode);
    const setSetupMode = useWorkoutStore((state) => state.setSetupMode);
    const createSession = useWorkoutStore((state) => state.createSession);
    const saveSessionDraft = useWorkoutStore((state) => state.saveSessionDraft);
    const saveSessionDraftAs = useWorkoutStore((state) => state.saveSessionDraftAs);
    const startSession = useWorkoutStore((state) => state.startSession);
    const addWorkoutNodeFromCurrentSetup = useWorkoutStore((state) => state.addWorkoutNodeFromCurrentSetup);
    const addRestNode = useWorkoutStore((state) => state.addRestNode);
    const removeSessionNode = useWorkoutStore((state) => state.removeSessionNode);
    const moveSessionNode = useWorkoutStore((state) => state.moveSessionNode);
    const moveSessionNodeToIndex = useWorkoutStore((state) => state.moveSessionNodeToIndex);
    const [dialogState, setDialogState] = useState<SessionBuilderDialogState>(null);

    const nodeCount = editingSessionDraft?.nodes.length ?? 0;
    const summary = useMemo(() => {
        if (!editingSessionDraft) {
            return 'Create a session, then edit nodes directly in the canvas.';
        }

        return `${nodeCount} node${nodeCount === 1 ? '' : 's'} in the chain.`;
    }, [editingSessionDraft, nodeCount]);

    const estimatedDuration = useMemo(() => {
        if (!editingSessionDraft) {
            return 0;
        }

        return estimateSessionDurationSeconds(editingSessionDraft, prepTime);
    }, [editingSessionDraft, prepTime]);

    const legacyWorkoutNodes = useMemo(() => {
        if (!editingSessionDraft) {
            return [];
        }

        return getLegacyWorkoutSessionNodes(
            editingSessionDraft,
            savedWorkouts.map((workout) => workout.id),
        );
    }, [editingSessionDraft, savedWorkouts]);

    const handleNewSession = () => {
        setDialogState({
            type: 'new-session',
            title: 'Create a new session',
            description: 'Start a fresh session draft without leaving the builder.',
            value: editingSessionDraft?.name ?? 'New Session',
            confirmLabel: 'Create Session',
        });
    };

    const handleSave = () => {
        const result = saveSessionDraft();
        if (!result.ok) {
            setDialogState({
                type: 'message',
                title: 'Could not save this session',
                description: result.error ?? 'Could not save session.',
            });
        }
    };

    const handleSaveAs = () => {
        if (!editingSessionDraft) {
            setDialogState({
                type: 'message',
                title: 'Nothing to save yet',
                description: 'Create or load a session before saving a copy.',
            });
            return;
        }

        setDialogState({
            type: 'save-session-as',
            title: 'Save this session as a copy',
            description: 'Give the current draft a new name before saving it into your session library.',
            value: editingSessionDraft.name,
            confirmLabel: 'Save Copy',
        });
    };

    const handleStart = () => {
        if (!editingSessionDraft) {
            setDialogState({
                type: 'message',
                title: 'No session is ready to start',
                description: 'Create or load a session first.',
            });
            return;
        }

        const result = startSession(editingSessionDraft.id);
        if (!result.ok) {
            setDialogState({
                type: 'message',
                title: 'Could not start this session',
                description: result.error ?? 'Could not start session.',
            });
        }
    };

    const handleAddWorkout = () => {
        const result = addWorkoutNodeFromCurrentSetup();
        if (!result.ok) {
            setDialogState({
                type: 'message',
                title: 'Could not add this workout node',
                description: result.error ?? 'Could not add workout node.',
            });
        }
    };

    const handleDialogValueChange = (value: string) => {
        setDialogState((current) => current && ('value' in current)
            ? { ...current, value }
            : current);
    };

    const handleDialogConfirm = () => {
        if (!dialogState) {
            return;
        }

        if (dialogState.type === 'message') {
            setDialogState(null);
            return;
        }

        const nextName = dialogState.value ?? '';
        const result = dialogState.type === 'new-session'
            ? createSession(nextName)
            : saveSessionDraftAs(nextName);

        if (!result.ok) {
            setDialogState({
                type: 'message',
                title: dialogState.type === 'new-session'
                    ? 'Could not create this session'
                    : 'Could not save this copy',
                description: result.error ?? 'Please try again.',
            });
            return;
        }

        setDialogState(null);
    };

    return (
        <>
            <section className="flex h-full min-h-0 w-full flex-col gap-5 px-4 py-4 sm:px-6 sm:py-6 xl:px-8 xl:py-8">
                <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="space-y-2">
                        <div className="text-[11px] font-black uppercase tracking-[0.35em] text-primary">
                            Session Workspace
                        </div>
                        <h1 className="text-5xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/50 sm:text-6xl">
                            Build a Session
                        </h1>
                        <p className="max-w-2xl text-sm font-medium leading-relaxed text-muted-foreground">
                            {summary}
                        </p>
                    </div>

                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center xl:items-end xl:justify-end">
                        <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                            <SetupModeToggle mode={setupMode} onChange={setSetupMode} />
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={handleAddWorkout}
                                    className="gap-2 rounded-full px-4 font-black italic tracking-tighter"
                                >
                                    <Plus size={16} /> Workout
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => addRestNode()}
                                    className="gap-2 rounded-full px-4 font-black italic tracking-tighter"
                                >
                                    <Plus size={16} /> Rest
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="secondary" onClick={handleNewSession} className="gap-2 rounded-full px-4 font-black italic tracking-tighter">
                                    <Plus size={16} /> New
                                </Button>
                                <Button type="button" variant="secondary" onClick={handleSave} className="gap-2 rounded-full px-4 font-black italic tracking-tighter">
                                    <Save size={16} /> Save
                                </Button>
                                <Button type="button" variant="secondary" onClick={handleSaveAs} className="gap-2 rounded-full px-4 font-black italic tracking-tighter">
                                    <Save size={16} /> Save As
                                </Button>
                                <Button type="button" onClick={handleStart} className="gap-2 rounded-full px-4 font-black italic tracking-tighter">
                                    <Play size={16} /> Start
                                </Button>
                            </div>
                        </div>
                    </div>
                </header>

                {legacyWorkoutNodes.length > 0 && (
                    <div
                        role="alert"
                        className="flex items-start gap-3 rounded-[20px] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
                    >
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
                        <div className="space-y-1">
                            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-300">
                                Legacy Workout Node{legacyWorkoutNodes.length === 1 ? '' : 's'}
                            </div>
                            <p className="leading-relaxed text-amber-100/90">
                                {legacyWorkoutNodes.length} workout node{legacyWorkoutNodes.length === 1 ? '' : 's'} in this session {legacyWorkoutNodes.length === 1 ? 'is' : 'are'} not linked to a saved workout.
                                Open the node editor and save or import a workout to repair the link.
                            </p>
                        </div>
                    </div>
                )}

                <div className="flex items-baseline justify-end gap-2 px-1 text-[12px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    <span>EST. TIME:</span>
                    <span className="text-xl font-black tracking-tight text-foreground normal-case">
                        {formatEstimatedSessionDuration(estimatedDuration)}
                    </span>
                </div>

                <div className="flex min-h-0 flex-1">
                    <SessionCanvas
                        nodes={editingSessionDraft?.nodes ?? []}
                        activeNodeId={editingSessionNodeId}
                        onEditNode={setEditingSessionNodeId}
                        onRemoveNode={removeSessionNode}
                        onMoveNode={moveSessionNode}
                        onMoveNodeToIndex={(nodeId, targetIndex) => moveSessionNodeToIndex(nodeId, targetIndex)}
                    />
                </div>

                <SessionNodeEditor />
            </section>

            <BuilderDialog
                state={dialogState}
                onChangeValue={handleDialogValueChange}
                onClose={() => setDialogState(null)}
                onConfirm={handleDialogConfirm}
            />
        </>
    );
};

export default SessionBuilder;
