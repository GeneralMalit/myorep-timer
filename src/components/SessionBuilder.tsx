import { useMemo } from 'react';
import { Plus, Play, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SessionCanvas from '@/components/SessionCanvas';
import SessionNodeEditor from '@/components/SessionNodeEditor';
import SetupModeToggle from '@/components/SetupModeToggle';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import { estimateSessionDurationSeconds, formatEstimatedSessionDuration } from '@/utils/savedSessions';

const SessionBuilder = () => {
    const editingSessionDraft = useWorkoutStore((state) => state.editingSessionDraft);
    const editingSessionNodeId = useWorkoutStore((state) => state.editingSessionNodeId);
    const setEditingSessionNodeId = useWorkoutStore((state) => state.setEditingSessionNodeId);
    const prepTime = useWorkoutStore((state) => state.settings.prepTime);
    const setupMode = useWorkoutStore((state) => state.setupMode);
    const setSetupMode = useWorkoutStore((state) => state.setSetupMode);
    const createSession = useWorkoutStore((state) => state.createSession);
    const saveSessionDraft = useWorkoutStore((state) => state.saveSessionDraft);
    const saveSessionDraftAs = useWorkoutStore((state) => state.saveSessionDraftAs);
    const startSession = useWorkoutStore((state) => state.startSession);
    const addWorkoutNodeFromCurrentSetup = useWorkoutStore((state) => state.addWorkoutNodeFromCurrentSetup);
    const addRestNode = useWorkoutStore((state) => state.addRestNode);
    const removeSessionNode = useWorkoutStore((state) => state.removeSessionNode);
    const moveSessionNodeToIndex = useWorkoutStore((state) => state.moveSessionNodeToIndex);

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

    const handleNewSession = () => {
        const name = window.prompt('Session name:', editingSessionDraft?.name ?? 'New Session');
        if (!name) return;

        const result = createSession(name);
        if (!result.ok) {
            window.alert(result.error ?? 'Could not create session.');
        }
    };

    const handleSave = () => {
        const result = saveSessionDraft();
        if (!result.ok) {
            window.alert(result.error ?? 'Could not save session.');
        }
    };

    const handleSaveAs = () => {
        const name = window.prompt('Save session as:', editingSessionDraft?.name ?? 'New Session');
        if (!name) return;

        const result = saveSessionDraftAs(name);
        if (!result.ok) {
            window.alert(result.error ?? 'Could not save session.');
        }
    };

    const handleStart = () => {
        if (!editingSessionDraft) {
            window.alert('Create or load a session first.');
            return;
        }

        const result = startSession(editingSessionDraft.id);
        if (!result.ok) {
            window.alert(result.error ?? 'Could not start session.');
        }
    };

    return (
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
                                onClick={() => addWorkoutNodeFromCurrentSetup()}
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

            <div className="flex justify-end px-1 text-[10px] font-black uppercase tracking-[0.28em] text-muted-foreground">
                EST. TIME: <span className="ml-2 text-sm italic tracking-tight text-foreground normal-case">{formatEstimatedSessionDuration(estimatedDuration)}</span>
            </div>

            <div className="flex min-h-0 flex-1">
                <SessionCanvas
                    nodes={editingSessionDraft?.nodes ?? []}
                    activeNodeId={editingSessionNodeId}
                    onEditNode={setEditingSessionNodeId}
                    onRemoveNode={removeSessionNode}
                    onMoveNodeToIndex={(nodeId, targetIndex) => moveSessionNodeToIndex(nodeId, targetIndex)}
                />
            </div>

            <SessionNodeEditor />
        </section>
    );
};

export default SessionBuilder;
