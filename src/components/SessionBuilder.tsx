import { useEffect, useMemo, useState } from 'react';
import { Plus, Play, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SessionCanvas from '@/components/SessionCanvas';
import SessionNodeEditor from '@/components/SessionNodeEditor';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { getResponsiveLayout } from '@/layout';
import { sessionBuilderDesktopLayout } from '@/layout/sessionBuilder.desktop';
import { sessionBuilderMobileLayout } from '@/layout/sessionBuilder.mobile';
import { estimateSessionDurationSeconds, formatEstimatedSessionDuration } from '@/utils/savedSessions';
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
    const isMobileViewport = useMobileViewport();

    if (!state) {
        return null;
    }

    const isPrompt = state.type === 'new-session' || state.type === 'save-session-as';
    const layout = getResponsiveLayout(isMobileViewport, sessionBuilderMobileLayout.dialog, sessionBuilderDesktopLayout.dialog);

    return (
        <div
            className={cn(
                layout.backdrop,
            )}
            role="dialog"
            aria-modal="true"
            aria-label={state.title}
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div className={layout.panel}>
                {isMobileViewport && layout.handle && <div className={layout.handle} />}
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

                <div className={layout.actions}>
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

function useMobileViewport() {
    const [isMobileViewport, setIsMobileViewport] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return;
        }

        const mediaQuery = window.matchMedia('(max-width: 767px)');
        const handleViewportChange = (event: MediaQueryListEvent | MediaQueryList) => {
            setIsMobileViewport(event.matches);
        };

        handleViewportChange(mediaQuery);
        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handleViewportChange);
            return () => mediaQuery.removeEventListener('change', handleViewportChange);
        }

        mediaQuery.addListener(handleViewportChange);
        return () => mediaQuery.removeListener(handleViewportChange);
    }, []);

    return isMobileViewport;
}

const SessionBuilder = () => {
    const isMobileViewport = useMobileViewport();
    const editingSessionDraft = useWorkoutStore((state) => state.editingSessionDraft);
    const savedSessions = useWorkoutStore((state) => state.savedSessions);
    const editingSessionNodeId = useWorkoutStore((state) => state.editingSessionNodeId);
    const setEditingSessionNodeId = useWorkoutStore((state) => state.setEditingSessionNodeId);
    const prepTime = useWorkoutStore((state) => state.settings.prepTime);
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

    const sessionDraftStatus = useMemo<'unsaved changes' | 'none'>(() => {
        if (!editingSessionDraft) {
            return 'none';
        }

        const savedSession = savedSessions.find((session) => session.id === editingSessionDraft.id);
        if (!savedSession) {
            return 'unsaved changes';
        }

        const draftComparable = JSON.stringify({
            name: editingSessionDraft.name,
            nodes: editingSessionDraft.nodes,
        });
        const savedComparable = JSON.stringify({
            name: savedSession.name,
            nodes: savedSession.nodes,
        });

        return draftComparable === savedComparable ? 'none' : 'unsaved changes';
    }, [editingSessionDraft, savedSessions]);

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
    const layout = getResponsiveLayout(isMobileViewport, sessionBuilderMobileLayout, sessionBuilderDesktopLayout);

    return (
        <>
            <section className={layout.shell}>
                <div
                    data-testid="session-builder-shell"
                    className={layout.shellInner}
                >
                    <div className={layout.controls}>
                        <div className={layout.actionsWrap}>
                            <div className={layout.actionsGrid}>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleNewSession}
                                    className="shrink-0 gap-2 rounded-full border-primary/60 bg-background px-4 font-black italic tracking-tighter text-primary hover:bg-primary/10"
                                >
                                    <Plus size={16} /> New Session
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={handleAddWorkout}
                                    className="shrink-0 gap-2 rounded-full px-4 font-black italic tracking-tighter"
                                >
                                    <Plus size={16} /> Workout
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => addRestNode()}
                                    className="shrink-0 gap-2 rounded-full px-4 font-black italic tracking-tighter"
                                >
                                    <Plus size={16} /> Rest
                                </Button>
                                <Button type="button" variant="secondary" onClick={handleSave} className="shrink-0 gap-2 rounded-full px-4 font-black italic tracking-tighter">
                                    <Save size={16} /> Save
                                </Button>
                                <Button type="button" variant="secondary" onClick={handleSaveAs} className="shrink-0 gap-2 rounded-full px-4 font-black italic tracking-tighter">
                                    <Save size={16} /> Save As
                                </Button>
                                <Button type="button" onClick={handleStart} className="shrink-0 gap-2 rounded-full px-4 font-black italic tracking-tighter">
                                    <Play size={16} /> Start
                                </Button>
                            </div>
                        </div>
                        <div className={layout.estimatedTime}>
                            <span>Est. Time:</span>
                            <span className="text-xl font-black tracking-tight text-foreground normal-case">
                                {formatEstimatedSessionDuration(estimatedDuration)}
                            </span>
                        </div>
                    </div>

                    <div className={layout.canvasWrap}>
                        <div className={layout.canvasInner}>
                            <SessionCanvas
                                nodes={editingSessionDraft?.nodes ?? []}
                                activeNodeId={editingSessionNodeId}
                                sessionId={editingSessionDraft?.id ?? null}
                                sessionName={editingSessionDraft?.name ?? null}
                                sessionDraftStatus={sessionDraftStatus}
                                onEditNode={setEditingSessionNodeId}
                                onRemoveNode={removeSessionNode}
                                onMoveNode={moveSessionNode}
                                onMoveNodeToIndex={(nodeId, targetIndex) => moveSessionNodeToIndex(nodeId, targetIndex)}
                            />
                        </div>
                    </div>

                    <SessionNodeEditor />
                </div>
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
