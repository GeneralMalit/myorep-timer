import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
    Activity,
    ArrowDown,
    ArrowUp,
    Check,
    ChevronDown,
    Copy,
    Dumbbell,
    GripVertical,
    Link2,
    ListPlus,
    Play,
    Plus,
    Save,
    Timer,
    Trash2,
    X,
    Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import type { SavedWorkoutConfig } from '@/types/savedWorkouts';
import type { SessionNode, WorkoutSessionNode } from '@/types/savedSessions';
import { estimateSessionDurationSeconds, formatEstimatedSessionDuration } from '@/utils/savedSessions';
import { audioEngine } from '@/utils/audioEngine';
import { cn } from '@/lib/utils';

const KINETIC = {
    background: '#101211',
    surface: '#171A18',
    raised: '#1E231F',
    border: '#2C322D',
    borderStrong: '#414A40',
    cream: '#F3F0E6',
    muted: '#9EA69B',
    // The builder follows the selected visual identity. App.tsx provides this
    // variable for the Kinetic shell; the light fallback keeps this component
    // legible when rendered in isolation (for example, in a story or test).
    theme: 'var(--kinetic-theme-color, #F3F0E6)',
    themeSoft: 'color-mix(in srgb, var(--kinetic-theme-color, #F3F0E6) 72%, white)',
    themeWash: 'color-mix(in srgb, var(--kinetic-theme-color, #F3F0E6) 11%, transparent)',
    themeBorder: 'color-mix(in srgb, var(--kinetic-theme-color, #F3F0E6) 70%, transparent)',
    error: '#F28B82',
    lime: '#A8FF5A',
    blue: '#74C7FF',
    ink: '#151411',
} as const;

const surfaceStyle = {
    backgroundColor: KINETIC.surface,
    borderColor: KINETIC.border,
} satisfies CSSProperties;

const inputClassName = 'h-10 rounded-[9px] border-[#384039] bg-[#111412] text-[#F3F0E6] placeholder:text-[#6F776E] focus-visible:border-[var(--kinetic-theme-color)] focus-visible:ring-[var(--kinetic-theme-color)]/35';
const quietButtonClassName = 'rounded-[9px] border border-[#384039] bg-[#20251F] text-[#F3F0E6] hover:border-[#596458] hover:bg-[#293029] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kinetic-theme-color)]/70';
const iconButtonClassName = 'h-9 w-9 rounded-[8px] border border-[#384039] bg-[#20251F] p-0 text-[#A7B0A4] hover:border-[var(--kinetic-theme-color)] hover:bg-[#2A3029] hover:text-[#F3F0E6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kinetic-theme-color)]/70';

type ActionResult = { ok: boolean; error?: string; id?: string };

type BuilderDialog =
    | { kind: 'prompt'; title: string; description: string; value: string; confirmLabel: string }
    | { kind: 'feedback'; title: string; description: string; tone: 'error' | 'success' }
    | null;

interface KineticSessionBuilderProps {
    className?: string;
}

const parseCount = (value: string | undefined): number => {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const workoutSummary = (node: WorkoutSessionNode): string => {
    const sets = parseCount(node.config.sets);
    const reps = parseCount(node.config.reps);
    const seconds = parseCount(node.config.seconds);
    if (sets <= 1) {
        return `${reps || '—'} reps · ${seconds || '—'} sec`;
    }

    const myoReps = parseCount(node.config.myoReps);
    return `${sets} sets · ${reps || '—'} + ${myoReps || '—'} · ${seconds || '—'} sec`;
};

const nodeSummary = (node: SessionNode): string => (
    node.type === 'workout' ? workoutSummary(node) : `${node.seconds || '—'} sec recovery`
);

const nodeAccent = (node: SessionNode): string => node.type === 'workout' ? KINETIC.theme : KINETIC.blue;

const isNodeValid = (node: SessionNode): boolean => {
    if (!node.name.trim()) {
        return false;
    }

    if (node.type === 'rest') {
        return parseCount(node.seconds) > 0;
    }

    const sets = parseCount(node.config.sets);
    const reps = parseCount(node.config.reps);
    const seconds = parseCount(node.config.seconds);
    if (sets <= 0 || reps <= 0 || seconds <= 0) {
        return false;
    }

    return sets === 1 || (
        parseCount(node.config.rest) > 0
        && parseCount(node.config.myoReps) > 0
        && parseCount(node.config.myoWorkSecs) > 0
    );
};

const KineticNodeCard = ({
    node,
    index,
    total,
    selected,
    onSelect,
    onMove,
    onDelete,
    onDragStart,
    onDrop,
}: {
    node: SessionNode;
    index: number;
    total: number;
    selected: boolean;
    onSelect: () => void;
    onMove: (direction: 'left' | 'right') => void;
    onDelete: () => void;
    onDragStart: () => void;
    onDrop: () => void;
}) => {
    const accent = nodeAccent(node);
    const valid = isNodeValid(node);

    return (
        <div className="relative flex gap-3">
            <div className="absolute -left-[2.1rem] top-5 flex h-6 w-6 items-center justify-center rounded-[7px] border text-[10px] font-bold" style={{ borderColor: node.type === 'workout' ? KINETIC.themeBorder : `${accent}88`, color: accent, backgroundColor: KINETIC.background }} aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
            </div>
            <article
                draggable
                tabIndex={0}
                aria-label={`${node.type === 'workout' ? 'Workout' : 'Rest'} ${node.name}`}
                aria-selected={selected}
                onClick={onSelect}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect();
                    }
                }}
                onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', node.id);
                    onDragStart();
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                    event.preventDefault();
                    onDrop();
                }}
                className={cn(
                    'group min-w-0 flex-1 cursor-pointer border p-3 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kinetic-theme-color)]/70',
                    selected ? 'bg-[#232820]' : 'border-[#2C322D] bg-[#171A18] hover:border-[#515B50] hover:bg-[#1D221E]',
                )}
                style={{
                    borderRadius: 10,
                    ...(selected ? { borderColor: KINETIC.theme, backgroundColor: KINETIC.themeWash } : {}),
                }}
            >
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px]" style={{ color: accent, backgroundColor: node.type === 'workout' ? KINETIC.themeWash : `${accent}19` }}>
                        {node.type === 'workout' ? <Dumbbell size={18} /> : <Timer size={18} />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: accent }}>
                                {node.type === 'workout' ? 'WORK' : 'REST'}
                            </span>
                            {valid && <Check size={13} aria-label="Valid node" style={{ color: KINETIC.lime }} />}
                            {!valid && <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: KINETIC.error }}>Needs input</span>}
                        </div>
                        <div className="mt-1 truncate text-[15px] font-semibold tracking-[-0.02em]" style={{ color: KINETIC.cream }} title={node.name}>
                            {node.name || 'Untitled block'}
                        </div>
                        <div className="mt-1 truncate text-[12px]" style={{ color: KINETIC.muted }} title={nodeSummary(node)}>
                            {nodeSummary(node)}
                        </div>
                        {node.type === 'workout' && node.notes?.trim() && (
                            <div className="mt-2 truncate text-[11px]" style={{ color: KINETIC.themeSoft }} title={node.notes}>
                                {node.notes}
                            </div>
                        )}
                    </div>
                    <GripVertical size={17} className="mt-1 shrink-0 text-[#606A5F] opacity-70" aria-label="Drag to reorder" />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-[#2C322D] pt-2">
                    <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#727B71]">Block {index + 1} / {total}</span>
                    <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                        <Button type="button" variant="ghost" size="icon" className={cn(iconButtonClassName, 'h-7 w-7')} onClick={() => onMove('left')} disabled={index === 0} aria-label={`Move ${node.name} earlier`} title="Move earlier">
                            <ArrowUp size={14} />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className={cn(iconButtonClassName, 'h-7 w-7')} onClick={() => onMove('right')} disabled={index === total - 1} aria-label={`Move ${node.name} later`} title="Move later">
                            <ArrowDown size={14} />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className={cn(iconButtonClassName, 'h-7 w-7 hover:border-[#F28B82] hover:text-[#F28B82]')} onClick={onDelete} aria-label={`Remove ${node.name}`} title="Remove block">
                            <Trash2 size={14} />
                        </Button>
                    </div>
                </div>
            </article>
        </div>
    );
};

const Field = ({
    label,
    value,
    onChange,
    disabled,
    hint,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    hint?: string;
}) => (
    <label className={cn('block space-y-1.5', disabled && 'opacity-45')}>
        <span className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8E988C]">
            <span>{label}</span>
            {hint && <span className="normal-case tracking-normal text-[#656E64]">{hint}</span>}
        </span>
        <Input
            type="number"
            min={1}
            inputMode="numeric"
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            className={inputClassName}
        />
    </label>
);

const NodeInspector = ({
    node,
    savedWorkouts,
    onClose,
    onUpdateWorkout,
    onUpdateRest,
    onImportWorkout,
    onDelete,
}: {
    node: SessionNode | null;
    savedWorkouts: ReturnType<typeof useWorkoutStore.getState>['savedWorkouts'];
    onClose: () => void;
    onUpdateWorkout: (node: WorkoutSessionNode, config: SavedWorkoutConfig, name: string, notes: string) => void;
    onUpdateRest: (node: Extract<SessionNode, { type: 'rest' }>, seconds: string, name: string) => void;
    onImportWorkout: (nodeId: string, workoutId: string) => void;
    onDelete: (nodeId: string) => void;
}) => {
    const [name, setName] = useState(node?.name ?? '');
    const [notes, setNotes] = useState(node?.type === 'workout' ? node.notes ?? '' : '');
    const [restSeconds, setRestSeconds] = useState(node?.type === 'rest' ? node.seconds : '');
    const [config, setConfig] = useState<SavedWorkoutConfig>(node?.type === 'workout' ? node.config : {
        sets: '', reps: '', seconds: '', rest: '', myoReps: '', myoWorkSecs: '',
    });

    useEffect(() => {
        setName(node?.name ?? '');
        setNotes(node?.type === 'workout' ? node.notes ?? '' : '');
        setRestSeconds(node?.type === 'rest' ? node.seconds : '');
        setConfig(node?.type === 'workout' ? node.config : {
            sets: '', reps: '', seconds: '', rest: '', myoReps: '', myoWorkSecs: '',
        });
    }, [node]);

    if (!node) {
        return (
            <aside className="flex min-h-[240px] flex-col justify-center border-l border-[#2C322D] px-5 py-6 lg:min-h-0" style={{ backgroundColor: KINETIC.surface }}>
                <div className="mx-auto max-w-[220px] text-center">
                    <ListPlus size={20} className="mx-auto" style={{ color: KINETIC.lime }} />
                    <div className="mt-3 text-sm font-semibold" style={{ color: KINETIC.cream }}>Select a block</div>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: KINETIC.muted }}>Choose one to edit.</p>
                </div>
            </aside>
        );
    }

    const isWorkout = node.type === 'workout';
    const sets = parseCount(isWorkout ? config.sets : '');
    const updateConfig = (key: keyof SavedWorkoutConfig, value: string) => {
        const nextConfig = { ...config, [key]: value };
        setConfig(nextConfig);
        if (node.type === 'workout') {
            onUpdateWorkout(node, nextConfig, name, notes);
        }
    };

    return (
        <aside className="min-h-[520px] border-l border-[#2C322D] lg:min-h-0" style={{ backgroundColor: KINETIC.surface }}>
            <div className="flex items-start justify-between gap-4 border-b border-[#2C322D] px-5 py-4">
                <div>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: nodeAccent(node) }}>
                        {isWorkout ? <Dumbbell size={13} /> : <Timer size={13} />}
                        {isWorkout ? 'Workout block' : 'Rest block'}
                    </div>
                    <div className="mt-1 text-sm font-semibold" style={{ color: KINETIC.cream }}>Block settings</div>
                </div>
                <Button type="button" variant="ghost" size="icon" className={iconButtonClassName} onClick={onClose} aria-label="Close block settings">
                    <X size={16} />
                </Button>
            </div>

            <div className="space-y-5 overflow-y-auto p-5">
                <label className="block space-y-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8E988C]">Block name</span>
                    <Input
                        value={name}
                        onChange={(event) => {
                            const nextName = event.target.value;
                            setName(nextName);
                            if (node.type === 'workout') onUpdateWorkout(node, config, nextName, notes);
                            else onUpdateRest(node, restSeconds, nextName);
                        }}
                        className={inputClassName}
                    />
                </label>

                {isWorkout ? (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Sets" value={config.sets} onChange={(value) => updateConfig('sets', value)} hint="total" />
                            <Field label="Activation reps" value={config.reps} onChange={(value) => updateConfig('reps', value)} />
                            <Field label="Rep seconds" value={config.seconds} onChange={(value) => updateConfig('seconds', value)} />
                            <Field label="Rest seconds" value={config.rest} onChange={(value) => updateConfig('rest', value)} disabled={sets === 1} />
                            <Field label="Myo reps" value={config.myoReps} onChange={(value) => updateConfig('myoReps', value)} disabled={sets === 1} />
                            <Field label="Myo seconds" value={config.myoWorkSecs} onChange={(value) => updateConfig('myoWorkSecs', value)} disabled={sets === 1} />
                        </div>

                        <label className="block space-y-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8E988C]">Notes</span>
                            <Input
                                value={notes}
                                placeholder="e.g. 60kg last set"
                                onChange={(event) => {
                                    const nextNotes = event.target.value;
                                    setNotes(nextNotes);
                                    onUpdateWorkout(node, config, name, nextNotes);
                                }}
                                className={inputClassName}
                            />
                        </label>

                        <div className="space-y-2 border-t border-[#2C322D] pt-4">
                            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8E988C]"><Link2 size={13} /> Linked workout</div>
                            <select
                                aria-label="Linked workout"
                                value={node.sourceWorkoutId ?? '__none__'}
                                onChange={(event) => {
                                    if (event.target.value !== '__none__') onImportWorkout(node.id, event.target.value);
                                }}
                                className="h-10 w-full rounded-[9px] border border-[#384039] bg-[#111412] px-3 text-sm text-[#F3F0E6] outline-none focus:border-[var(--kinetic-theme-color)]"
                            >
                                <option value="__none__">Inline block (not linked)</option>
                                {savedWorkouts.map((workout) => <option key={workout.id} value={workout.id}>{workout.name}</option>)}
                            </select>
                        </div>
                    </>
                ) : (
                    <Field label="Recovery seconds" value={restSeconds} onChange={(value) => {
                        setRestSeconds(value);
                        onUpdateRest(node, value, name);
                    }} />
                )}

                <Button type="button" variant="ghost" className="h-10 w-full justify-start gap-2 rounded-[9px] border border-[#573A36] text-[#F28B82] hover:bg-[#30201E] hover:text-[#FFB0A8]" onClick={() => onDelete(node.id)}>
                    <Trash2 size={15} /> Remove this block
                </Button>
            </div>
        </aside>
    );
};

const BuilderDialog = ({ dialog, value, onChangeValue, onClose, onConfirm }: {
    dialog: BuilderDialog;
    value: string;
    onChangeValue: (value: string) => void;
    onClose: () => void;
    onConfirm: () => void;
}) => {
    if (!dialog) return null;
    const isPrompt = dialog.kind === 'prompt';
    const dialogLabelColor = dialog.kind === 'prompt'
        ? KINETIC.theme
        : dialog.tone === 'error'
            ? KINETIC.error
            : KINETIC.lime;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#080A09]/80 p-4" role="dialog" aria-modal="true" aria-label={dialog.title} onPointerDown={(event) => {
            if (event.target === event.currentTarget) onClose();
        }}>
            <div className="w-full max-w-md border border-[#485346] bg-[#171A18] p-5 shadow-[0_12px_50px_rgba(0,0,0,0.5)]" style={{ borderRadius: 10 }} onPointerDown={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: dialogLabelColor }}>
                            {isPrompt ? 'Session action' : dialog.tone === 'error' ? 'Action blocked' : 'Saved'}
                        </div>
                        <div className="mt-2 text-base font-semibold" style={{ color: KINETIC.cream }}>{dialog.title}</div>
                        <p className="mt-2 text-sm leading-relaxed" style={{ color: KINETIC.muted }}>{dialog.description}</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className={iconButtonClassName} onClick={onClose} aria-label="Close dialog"><X size={16} /></Button>
                </div>
                {isPrompt && (
                    <label className="mt-5 block space-y-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8E988C]">Session name</span>
                        <Input autoFocus value={value} onChange={(event) => onChangeValue(event.target.value)} className={inputClassName} />
                    </label>
                )}
                <div className="mt-6 flex justify-end gap-2">
                    {isPrompt && <Button type="button" variant="ghost" className={quietButtonClassName} onClick={onClose}>Cancel</Button>}
                    <Button
                        type="button"
                        className={cn('rounded-[9px] border-0', isPrompt ? 'text-[#151411] hover:brightness-110' : 'bg-[#A8FF5A] text-[#151411] hover:bg-[#B9FF7A]')}
                        style={isPrompt ? { backgroundColor: KINETIC.theme, color: KINETIC.ink } : undefined}
                        onClick={onConfirm}
                    >
                        {isPrompt ? dialog.confirmLabel : 'Close'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

const KineticSessionBuilder = ({ className }: KineticSessionBuilderProps) => {
    const editingSessionDraft = useWorkoutStore((state) => state.editingSessionDraft);
    const savedSessions = useWorkoutStore((state) => state.savedSessions);
    const savedWorkouts = useWorkoutStore((state) => state.savedWorkouts);
    const editingSessionNodeId = useWorkoutStore((state) => state.editingSessionNodeId);
    const prepTime = useWorkoutStore((state) => state.settings.prepTime);
    const createSession = useWorkoutStore((state) => state.createSession);
    const saveSessionDraft = useWorkoutStore((state) => state.saveSessionDraft);
    const saveSessionDraftAs = useWorkoutStore((state) => state.saveSessionDraftAs);
    const loadSessionForEditing = useWorkoutStore((state) => state.loadSessionForEditing);
    const startSession = useWorkoutStore((state) => state.startSession);
    const addWorkoutNodeFromCurrentSetup = useWorkoutStore((state) => state.addWorkoutNodeFromCurrentSetup);
    const addWorkoutNodeFromSavedWorkout = useWorkoutStore((state) => state.addWorkoutNodeFromSavedWorkout);
    const addRestNode = useWorkoutStore((state) => state.addRestNode);
    const updateWorkoutNode = useWorkoutStore((state) => state.updateWorkoutNode);
    const updateRestNode = useWorkoutStore((state) => state.updateRestNode);
    const removeSessionNode = useWorkoutStore((state) => state.removeSessionNode);
    const moveSessionNode = useWorkoutStore((state) => state.moveSessionNode);
    const moveSessionNodeToIndex = useWorkoutStore((state) => state.moveSessionNodeToIndex);
    const replaceWorkoutNodeWithSavedWorkout = useWorkoutStore((state) => state.replaceWorkoutNodeWithSavedWorkout);
    const setEditingSessionNodeId = useWorkoutStore((state) => state.setEditingSessionNodeId);

    const [draftName, setDraftName] = useState(editingSessionDraft?.name ?? '');
    const [dialog, setDialog] = useState<BuilderDialog>(null);
    const [dialogValue, setDialogValue] = useState('');
    const [statusMessage, setStatusMessage] = useState('');
    const [sessionPicker, setSessionPicker] = useState('');
    const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

    const nodes = editingSessionDraft?.nodes ?? [];
    const selectedNode = useMemo(() => nodes.find((node) => node.id === editingSessionNodeId) ?? null, [editingSessionNodeId, nodes]);
    const duration = useMemo(() => editingSessionDraft ? formatEstimatedSessionDuration(estimateSessionDurationSeconds(editingSessionDraft, prepTime)) : '--:--', [editingSessionDraft, prepTime]);
    const workoutCount = useMemo(() => nodes.filter((node) => node.type === 'workout').length, [nodes]);
    const restCount = nodes.length - workoutCount;
    const hasUnsavedChanges = useMemo(() => {
        if (!editingSessionDraft) return false;
        const saved = savedSessions.find((session) => session.id === editingSessionDraft.id);
        if (!saved) return nodes.length > 0;
        return JSON.stringify({ name: saved.name, nodes: saved.nodes }) !== JSON.stringify({ name: editingSessionDraft.name, nodes: editingSessionDraft.nodes });
    }, [editingSessionDraft, nodes, savedSessions]);

    useEffect(() => {
        setDraftName(editingSessionDraft?.name ?? '');
        if (editingSessionDraft?.id) setSessionPicker(editingSessionDraft.id);
    }, [editingSessionDraft?.id, editingSessionDraft?.name]);

    useEffect(() => {
        if (!editingSessionDraft) {
            if (editingSessionNodeId !== null) setEditingSessionNodeId(null);
            return;
        }

        if (editingSessionNodeId && nodes.some((node) => node.id === editingSessionNodeId)) return;
        setEditingSessionNodeId(nodes[0]?.id ?? null);
    }, [editingSessionDraft, editingSessionNodeId, nodes, setEditingSessionNodeId]);

    const showResult = (result: ActionResult, successMessage?: string) => {
        if (!result.ok) {
            setDialog({ kind: 'feedback', title: 'Could not update session', description: result.error ?? 'Please check the session and try again.', tone: 'error' });
            return;
        }
        if (successMessage) setStatusMessage(successMessage);
    };

    const handleCreate = () => {
        setDialogValue('New Session');
        setDialog({ kind: 'prompt', title: 'Create a session', description: 'Start a clean timeline and add blocks as you go.', value: 'New Session', confirmLabel: 'Create session' });
    };

    const handleSave = () => showResult(saveSessionDraft(draftName || undefined), 'Saved locally');

    const handleSaveAs = () => {
        if (!editingSessionDraft) {
            setDialog({ kind: 'feedback', title: 'No draft to copy', description: 'Create or load a session before saving a copy.', tone: 'error' });
            return;
        }
        setDialogValue(`${editingSessionDraft.name} copy`);
        setDialog({ kind: 'prompt', title: 'Save a copy', description: 'Create a separate session in your library from this timeline.', value: `${editingSessionDraft.name} copy`, confirmLabel: 'Save copy' });
    };

    const handleStart = () => {
        if (!editingSessionDraft) {
            setDialog({ kind: 'feedback', title: 'No session selected', description: 'Create or load a session before starting it.', tone: 'error' });
            return;
        }
        audioEngine.init();
        showResult(startSession(editingSessionDraft.id), 'Starting session');
    };

    const handleAddResult = (result: ActionResult) => {
        if (result.ok && result.id) {
            setEditingSessionNodeId(result.id);
            setStatusMessage('Block added');
        } else {
            showResult(result);
        }
    };

    const handleDialogConfirm = () => {
        if (!dialog) return;
        if (dialog.kind === 'feedback') {
            setDialog(null);
            return;
        }
        const result = dialog.title === 'Create a session' ? createSession(dialogValue) : saveSessionDraftAs(dialogValue);
        if (!result.ok) {
            setDialog({ kind: 'feedback', title: 'Could not save session', description: result.error ?? 'Please choose another name.', tone: 'error' });
            return;
        }
        setDialog(null);
        setDraftName(dialogValue);
        setStatusMessage(dialog.title === 'Create a session' ? 'Session created' : 'Copy saved');
    };

    const handleDeleteNode = (nodeId: string) => {
        const index = nodes.findIndex((node) => node.id === nodeId);
        const nextNode = nodes[index + 1] ?? nodes[index - 1] ?? null;
        removeSessionNode(nodeId);
        setEditingSessionNodeId(nextNode?.id ?? null);
        setStatusMessage('Block removed');
    };

    const handleLoadSession = (sessionId: string) => {
        setSessionPicker(sessionId);
        if (!sessionId) return;
        const result = loadSessionForEditing(sessionId);
        showResult(result, 'Session loaded');
    };

    return (
        <section className={cn('flex min-h-0 w-full flex-1 flex-col overflow-hidden', className)} style={{ backgroundColor: KINETIC.background, color: KINETIC.cream, fontFamily: 'Sora, Manrope, ui-sans-serif, system-ui, sans-serif' }} data-testid="kinetic-session-builder">
            <header className="shrink-0 border-b px-4 py-4 sm:px-6" style={surfaceStyle}>
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#151411]" style={{ backgroundColor: KINETIC.theme }} aria-hidden="true"><Zap size={16} fill="currentColor" /></div>
                            <div className="text-[11px] font-bold uppercase tracking-[0.25em]" style={{ color: KINETIC.theme }}>SESSION BUILDER</div>
                            {hasUnsavedChanges && <span className="border border-[#A8FF5A]/40 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#A8FF5A]" style={{ borderRadius: 5 }}>Unsaved</span>}
                        </div>
                        <div className="mt-3 flex max-w-[420px] items-center gap-2">
                            <Input aria-label="Session name" value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="Name this session" className="h-9 border-0 border-b border-[#4A5448] bg-transparent px-0 text-lg font-semibold tracking-[-0.03em] shadow-none focus-visible:border-[var(--kinetic-theme-color)] focus-visible:ring-0" />
                        </div>
                    </div>
                    <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                        <label className="sr-only" htmlFor="kinetic-session-picker">Open saved session</label>
                        <div className="relative min-w-[190px]">
                            <select id="kinetic-session-picker" value={sessionPicker} onChange={(event) => handleLoadSession(event.target.value)} className="h-10 w-full appearance-none rounded-[9px] border border-[#384039] bg-[#111412] px-3 pr-9 text-xs text-[#D9DED4] outline-none focus:border-[var(--kinetic-theme-color)]">
                                <option value="">Open saved session</option>
                                {savedSessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}
                            </select>
                            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-3 text-[#788176]" aria-hidden="true" />
                        </div>
                        <Button type="button" variant="ghost" className={cn(quietButtonClassName, 'h-10 gap-2')} onClick={handleCreate}><Plus size={15} /> New</Button>
                    </div>
                </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6" style={{ borderColor: KINETIC.border, backgroundColor: '#131614' }}>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" className="h-10 gap-2 rounded-[9px] border-0 px-4 text-sm font-semibold text-[#151411] hover:brightness-110" style={{ backgroundColor: KINETIC.theme }} onClick={() => handleAddResult(addWorkoutNodeFromCurrentSetup())}><Plus size={15} /> Add workout</Button>
                        <Button type="button" variant="ghost" className={cn(quietButtonClassName, 'h-10 gap-2')} onClick={() => handleAddResult(addRestNode('60'))}><Plus size={15} /> Add rest</Button>
                        {savedWorkouts.length > 0 && (
                            <select aria-label="Add saved workout" defaultValue="" onChange={(event) => {
                                if (event.target.value) {
                                    handleAddResult(addWorkoutNodeFromSavedWorkout(event.target.value));
                                    event.target.value = '';
                                }
                            }} className="h-10 max-w-[190px] rounded-[9px] border border-[#384039] bg-[#20251F] px-3 text-xs text-[#D9DED4] outline-none focus:border-[var(--kinetic-theme-color)]">
                                <option value="">Add from library</option>
                                {savedWorkouts.map((workout) => <option key={workout.id} value={workout.id}>{workout.name}</option>)}
                            </select>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="ghost" className={cn(quietButtonClassName, 'h-10 gap-2')} onClick={handleSave}><Save size={15} /> Save</Button>
                        <Button type="button" variant="ghost" className={cn(quietButtonClassName, 'h-10 w-10 p-0')} onClick={handleSaveAs} aria-label="Save session as copy" title="Save session as copy"><Copy size={15} /></Button>
                        <Button type="button" className="h-10 gap-2 rounded-[9px] border-0 px-4 text-sm font-semibold text-[#151411] hover:brightness-110" style={{ backgroundColor: KINETIC.theme }} onClick={handleStart}><Play size={15} fill="currentColor" /> Start</Button>
                    </div>
                </div>

                <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <main className="min-h-0 overflow-y-auto px-4 py-5 sm:px-6 lg:py-6">
                        <div className="mb-4 flex items-baseline gap-3">
                            <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: KINETIC.cream }}><Activity size={15} style={{ color: KINETIC.theme }} /> Timeline</h2>
                            {nodes.length > 0 && <span className="text-xs" style={{ color: KINETIC.muted }}>{`${nodes.length} blocks · ${workoutCount} work · ${restCount} recovery`}</span>}
                        </div>

                        {nodes.length === 0 ? (
                            <div className="flex min-h-[260px] items-center justify-center py-10 text-center">
                                <div className="max-w-[260px]">
                                    <ListPlus size={22} className="mx-auto" style={{ color: KINETIC.themeSoft }} />
                                    <div className="mt-3 text-sm font-semibold" style={{ color: KINETIC.cream }}>No blocks yet</div>
                                    <p className="mt-1 text-xs leading-relaxed" style={{ color: KINETIC.muted }}>Use the toolbar above to add a workout or recovery block.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="pl-8">
                                <div data-testid="kinetic-session-timeline" className="relative w-full space-y-3 border-l border-[#384039] pl-5">
                                    {nodes.map((node, index) => (
                                        <KineticNodeCard
                                            key={node.id}
                                            node={node}
                                            index={index}
                                            total={nodes.length}
                                            selected={node.id === editingSessionNodeId}
                                            onSelect={() => setEditingSessionNodeId(node.id)}
                                            onMove={(direction) => moveSessionNode(node.id, direction === 'left' ? 'left' : 'right')}
                                            onDelete={() => handleDeleteNode(node.id)}
                                            onDragStart={() => setDraggedNodeId(node.id)}
                                            onDrop={() => {
                                                if (draggedNodeId && draggedNodeId !== node.id) moveSessionNodeToIndex(draggedNodeId, index);
                                                setDraggedNodeId(null);
                                            }}
                                        />
                                    ))}
                                    <div className="flex items-center gap-3 pt-1">
                                        <div className="h-px flex-1 bg-[#2C322D]" />
                                        <Button type="button" variant="ghost" className="h-8 rounded-[8px] border border-dashed border-[#485346] px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9EA69B] hover:border-[var(--kinetic-theme-color)] hover:text-[var(--kinetic-theme-color)]" onClick={() => handleAddResult(addWorkoutNodeFromCurrentSetup())}><Plus size={13} /> Add block</Button>
                                        <div className="h-px flex-1 bg-[#2C322D]" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </main>

                    <NodeInspector
                        node={selectedNode}
                        savedWorkouts={savedWorkouts}
                        onClose={() => setEditingSessionNodeId(null)}
                        onUpdateWorkout={(node, config, name, notes) => updateWorkoutNode(node.id, config, name, notes)}
                        onUpdateRest={(node, seconds, name) => updateRestNode(node.id, seconds, name)}
                        onImportWorkout={(nodeId, workoutId) => showResult(replaceWorkoutNodeWithSavedWorkout(nodeId, workoutId), 'Workout linked')}
                        onDelete={handleDeleteNode}
                    />
                </div>
            </div>

            <footer className="flex shrink-0 items-center border-t px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.14em] sm:px-6" style={{ borderColor: KINETIC.border, backgroundColor: '#131614', color: KINETIC.muted }}>
                <div className="flex items-center gap-3"><span>Prep {prepTime}s</span><span className="text-[#4D574C]">/</span><span>{duration} estimated</span></div>
            </footer>

            <BuilderDialog dialog={dialog} value={dialogValue} onChangeValue={setDialogValue} onClose={() => setDialog(null)} onConfirm={handleDialogConfirm} />
            {statusMessage && <div role="status" aria-live="polite" className="fixed bottom-14 left-1/2 z-[110] -translate-x-1/2 border border-[#A8FF5A]/50 bg-[#1C2818] px-3 py-2 text-xs font-semibold text-[#C7FFA0] shadow-[0_8px_24px_rgba(0,0,0,0.3)]" style={{ borderRadius: 8 }} onClick={() => setStatusMessage('')}>{statusMessage}</div>}
        </section>
    );
};

export { KineticSessionBuilder };
export default KineticSessionBuilder;
