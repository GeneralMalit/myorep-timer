import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
    Activity,
    ArrowDown,
    ArrowUp,
    Check,
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import BuilderSaveFeedback from '@/components/BuilderSaveFeedback';
import { useBuilderSaveFeedback } from '@/hooks/useBuilderSaveFeedback';
import { Input } from '@/components/ui/input';
import { useWorkoutStore } from '@/store/useWorkoutStore';
import type { SavedWorkout, SavedWorkoutConfig } from '@/types/savedWorkouts';
import type { SessionNode, WorkoutSessionNode } from '@/types/savedSessions';
import { estimateSessionDurationSeconds, formatEstimatedSessionDuration } from '@/utils/savedSessions';
import { audioEngine } from '@/utils/audioEngine';
import { cn } from '@/lib/utils';
import { useDialogFocus } from '@/hooks/useDialogFocus';

const KINETIC = {
    background: 'var(--kinetic-bg)',
    surface: 'var(--kinetic-panel)',
    border: 'var(--kinetic-border)',
    cream: 'var(--kinetic-text)',
    muted: 'var(--kinetic-muted)',
    themeSoft: 'color-mix(in srgb, var(--kinetic-theme-color, #F3F0E6), white 55%)',
    themeWash: 'color-mix(in srgb, var(--kinetic-theme-color, #F3F0E6) 11%, transparent)',
    themeBorder: 'color-mix(in srgb, var(--kinetic-theme-color, #F3F0E6) 70%, transparent)',
    error: '#F28B82',
    lime: '#A8FF5A',
    blue: '#74C7FF',
} as const;

const surfaceStyle = {
    backgroundColor: KINETIC.surface,
    borderColor: KINETIC.border,
} satisfies CSSProperties;

const inputClassName = 'console-input';
const quietButtonClassName = 'console-button';
const iconButtonClassName = 'console-icon';
const COMPACT_VIEWPORT_QUERY = '(max-width: 1279px)';

type ActionResult = { ok: boolean; error?: string; id?: string };

type PendingNodeRemoval = {
    sessionId: string;
    node: SessionNode;
    previousNodeId: string | null;
    nextNodeId: string | null;
};

type SuccessNotification = {
    id: number;
    message: string;
    undo?: PendingNodeRemoval;
};

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

const nodeAccent = (node: SessionNode): string => node.type === 'workout' ? KINETIC.themeSoft : KINETIC.blue;

const getCompletedSessionCount = (node: WorkoutSessionNode): number => {
    const count = (node as WorkoutSessionNode & { completedSessionsSinceProgression?: unknown }).completedSessionsSinceProgression;
    return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
};

const getProgressionReminderThreshold = (value: unknown): number => (
    typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.max(1, Math.floor(value))
        : 3
);

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
    progressionReminderThreshold,
    nodeRef,
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
    progressionReminderThreshold: number;
    nodeRef: (element: HTMLElement | null) => void;
}) => {
    const accent = nodeAccent(node);
    const valid = isNodeValid(node);
    const showProgressionReminder = node.type === 'workout'
        && getCompletedSessionCount(node) >= progressionReminderThreshold;
    const progressionReminderDescription = node.type === 'workout'
        ? `${getCompletedSessionCount(node)} completed sessions since this workout was last changed. Review its settings or notes.`
        : '';

    return (
        <div className="relative flex gap-3">
            <div className="absolute -left-[2.1rem] top-5 flex h-6 w-6 items-center justify-center rounded-[7px] border text-[10px] font-bold" style={{ borderColor: node.type === 'workout' ? KINETIC.themeBorder : `${accent}88`, color: accent, backgroundColor: KINETIC.background }} aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
            </div>
            <article
                ref={nodeRef}
                draggable
                tabIndex={0}
                aria-label={`${node.type === 'workout' ? 'Workout' : 'Rest'} ${node.name}`}
                aria-current={selected ? 'true' : undefined}
                onClick={onSelect}
                onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
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
                    'group min-w-0 flex-1 cursor-pointer rounded-xl border p-3 transition-colors focus-visible:outline-2 focus-visible:outline-[var(--kinetic-focus)]',
                    selected ? 'bg-[var(--kinetic-panel-raised)]' : 'border-[var(--kinetic-border)] bg-[var(--kinetic-panel)] hover:bg-[var(--kinetic-panel-raised)]',
                )}
                style={{
                    borderRadius: 10,
                    ...(selected ? { borderColor: KINETIC.themeSoft } : {}),
                }}
            >
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px]" style={{ color: accent, backgroundColor: node.type === 'workout' ? KINETIC.themeWash : `${accent}19` }}>
                        {node.type === 'workout' ? <Dumbbell size={18} /> : <Timer size={18} />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="console-label" style={{ color: accent }}>
                                {node.type === 'workout' ? 'Workout' : 'Recovery'}
                            </span>
                            {valid && <Check size={13} aria-label="Valid node" style={{ color: KINETIC.lime }} />}
                            {!valid && <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: KINETIC.error }}>Needs input</span>}
                        </div>
                        <div className="mt-1 whitespace-normal break-words text-[15px] font-semibold tracking-[-0.02em]" style={{ color: KINETIC.cream }}>
                            {node.name || 'Untitled block'}
                        </div>
                        <div className="mt-1 whitespace-normal break-words text-[12px]" style={{ color: KINETIC.muted }}>
                            {nodeSummary(node)}
                        </div>
                        {node.type === 'workout' && node.notes?.trim() && (
                            <div className="mt-2 whitespace-normal break-words text-xs" style={{ color: KINETIC.muted }}>
                                {node.notes}
                            </div>
                        )}
                    </div>
                    <div className="mt-0.5 flex shrink-0 items-start gap-2">
                        {showProgressionReminder && (
                            <div
                                role="note"
                                tabIndex={0}
                                aria-label={progressionReminderDescription}
                                title={progressionReminderDescription}
                                className="console-tag border-emerald-400/40 text-emerald-200 focus-visible:outline-2 focus-visible:outline-[var(--kinetic-focus)]"
                                style={{ borderRadius: 5 }}
                            >
                                Consider progressing
                            </div>
                        )}
                        <GripVertical size={17} className="mt-1 shrink-0 text-[var(--kinetic-muted)]" aria-label="Drag to reorder" />
                    </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--kinetic-border)] pt-2">
                    <span className="text-xs text-[var(--kinetic-muted)]">Block {index + 1} / {total}</span>
                    <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                        <Button type="button" variant="ghost" size="icon" className={iconButtonClassName} onClick={() => onMove('left')} disabled={index === 0} aria-label={`Move ${node.name} earlier`} title="Move earlier">
                            <ArrowUp size={14} />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className={iconButtonClassName} onClick={() => onMove('right')} disabled={index === total - 1} aria-label={`Move ${node.name} later`} title="Move later">
                            <ArrowDown size={14} />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className={cn(iconButtonClassName, 'console-button--danger')} onClick={onDelete} aria-label={`Remove ${node.name}`} title="Remove block">
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
        <span className="console-label flex items-center justify-between gap-2">
            <span>{label}</span>
            {hint && <span className="font-normal text-[var(--kinetic-muted)]">{hint}</span>}
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
    isMobileSheet = false,
}: {
    node: SessionNode | null;
    savedWorkouts: SavedWorkout[];
    onClose: () => void;
    onUpdateWorkout: (node: WorkoutSessionNode, config: SavedWorkoutConfig, name: string, notes: string) => void;
    onUpdateRest: (node: Extract<SessionNode, { type: 'rest' }>, seconds: string, name: string) => void;
    onImportWorkout: (nodeId: string, workoutId: string) => void;
    onDelete: (nodeId: string) => void;
    isMobileSheet?: boolean;
}) => {
    const [name, setName] = useState(node?.name ?? '');
    const [notes, setNotes] = useState(node?.type === 'workout' ? node.notes ?? '' : '');
    const [restSeconds, setRestSeconds] = useState(node?.type === 'rest' ? node.seconds : '');
    const [config, setConfig] = useState<SavedWorkoutConfig>(node?.type === 'workout' ? node.config : {
        sets: '', reps: '', seconds: '', rest: '', myoReps: '', myoWorkSecs: '',
    });
    const sheetRef = useDialogFocus(isMobileSheet, onClose);

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
            <aside className="flex min-h-[240px] flex-col justify-center border-l border-[var(--kinetic-border)] px-5 py-6 xl:min-h-0" style={{ backgroundColor: KINETIC.surface }}>
                <div className="mx-auto max-w-[220px] text-center">
                    <ListPlus size={20} className="mx-auto" style={{ color: KINETIC.muted }} />
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
        <aside
            ref={sheetRef}
            role={isMobileSheet ? 'dialog' : undefined}
            aria-modal={isMobileSheet ? true : undefined}
            aria-labelledby="kinetic-block-settings-title"
            tabIndex={isMobileSheet ? -1 : undefined}
            className={cn(
                isMobileSheet
                    ? 'fixed z-[100] flex max-h-[min(78dvh,720px)] min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--kinetic-border)] shadow-2xl'
                    : 'flex min-h-0 flex-col border-l border-[var(--kinetic-border)]',
            )}
            style={{
                backgroundColor: KINETIC.surface,
                ...(isMobileSheet ? {
                    left: 'max(0.5rem, env(safe-area-inset-left, 0px))',
                    right: 'max(0.5rem, env(safe-area-inset-right, 0px))',
                    bottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',
                } : {}),
            }}
        >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--kinetic-border)] px-5 py-4">
                <div>
                    <div className="console-label flex items-center gap-2" style={{ color: nodeAccent(node) }}>
                        {isWorkout ? <Dumbbell size={13} /> : <Timer size={13} />}
                        {isWorkout ? 'Workout block' : 'Rest block'}
                    </div>
                    <div id="kinetic-block-settings-title" className="mt-1 text-sm font-semibold" style={{ color: KINETIC.cream }}>Block settings</div>
                </div>
                {isMobileSheet && (
                    <Button type="button" variant="ghost" size="icon" className={iconButtonClassName} onClick={onClose} aria-label="Close block settings"><X size={16} /></Button>
                )}
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
                <label className="block space-y-1.5">
                    <span className={"console-label"}>Block name</span>
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
                            <span className={"console-label"}>Notes</span>
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

                        <div className={"space-y-2 border-t border-[var(--kinetic-border)] pt-4"}>
                            <div className={"console-label flex items-center gap-2"}><Link2 size={13} /> Linked workout</div>
                            <select
                                aria-label="Linked workout"
                                value={node.sourceWorkoutId ?? '__none__'}
                                onChange={(event) => {
                                    onImportWorkout(node.id, event.target.value);
                                }}
                                className={'console-select'}
                            >
                                <option value="__none__" disabled>Choose a saved workout</option>
                                {savedWorkouts.map((workout) => <option key={workout.id} value={workout.id}>{workout.name}</option>)}
                            </select>
                            <p className={"text-xs leading-relaxed text-[var(--kinetic-muted)]"}>
                                Edits to a linked workout update every block that uses it when the session is saved. Its settings, notes, and progression are shared; inline blocks keep progression local to this session.
                            </p>
                        </div>
                    </>
                ) : (
                    <Field label="Recovery seconds" value={restSeconds} onChange={(value) => {
                        setRestSeconds(value);
                        onUpdateRest(node, value, name);
                    }} />
                )}

                <Button
                    type="button"
                    variant="ghost"
                    className={'console-button console-button--danger w-full justify-start'}
                    onClick={() => onDelete(node.id)}
                >
                    <Trash2 size={15} /> Remove this block
                </Button>
            </div>
        </aside>
    );

};
const BuilderDialog = ({ dialog, value, onChangeValue, onClose, onConfirm, isCompactViewport }: {
    dialog: BuilderDialog;
    value: string;
    onChangeValue: (value: string) => void;
    onClose: () => void;
    onConfirm: () => void;
    isCompactViewport: boolean;
}) => {
    const dialogRef = useDialogFocus(Boolean(dialog), onClose);

    if (!dialog) return null;
    const isPrompt = dialog.kind === 'prompt';
    const dialogLabelColor = dialog.kind === 'prompt'
        ? KINETIC.themeSoft
        : dialog.tone === 'error'
            ? KINETIC.error
            : KINETIC.lime;

    return createPortal(
        <div
            ref={dialogRef}
            tabIndex={-1}
            className={cn(
                'fixed inset-0 z-[120] flex justify-center bg-black/75',
                isCompactViewport
                    ? 'items-end px-[max(0.5rem,env(safe-area-inset-left,0px))] pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]'
                    : 'items-center p-4',
            )}
            role="dialog"
            aria-modal="true"
            aria-label={dialog.title}
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                className="console-dialog w-full max-w-md"
                onPointerDown={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="console-label" style={{ color: dialogLabelColor }}>
                            {isPrompt ? 'Session action' : dialog.tone === 'error' ? 'Action blocked' : 'Saved'}
                        </div>
                        <div className="mt-2 text-base font-semibold" style={{ color: KINETIC.cream }}>{dialog.title}</div>
                        <p className="mt-2 text-sm leading-relaxed" style={{ color: KINETIC.muted }}>{dialog.description}</p>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={iconButtonClassName}
                        onClick={onClose}
                        aria-label="Close dialog"
                    >
                        <X size={16} />
                    </Button>
                </div>
                {isPrompt && (
                    <label className="mt-5 block space-y-1.5">
                        <span className={"console-label"}>Session name</span>
                        <Input value={value} onChange={(event) => onChangeValue(event.target.value)} className={inputClassName} />
                    </label>
                )}
                <div className="mt-6 flex justify-end gap-2">
                    {isPrompt && (
                        <Button type="button" variant="ghost" className={quietButtonClassName} onClick={onClose}>
                            Cancel
                        </Button>
                    )}
                    <Button
                        type="button"
                        className="console-button console-button--primary"
                        onClick={onConfirm}
                    >
                        {isPrompt ? dialog.confirmLabel : 'Close'}
                    </Button>
                </div>
            </div>
        </div>,
        document.querySelector('[data-design-variant]') ?? document.body,
    );
};

const TimelineAddControls = ({ onAddWorkout, onAddRest }: {
    onAddWorkout: () => void;
    onAddRest: () => void;
}) => (
    <div data-testid="kinetic-timeline-add-controls" className="flex flex-wrap items-center justify-center gap-2 border-t border-[var(--kinetic-border)] pt-4">
        <Button
            type="button"
            className="console-button console-button--primary px-4"
            onClick={onAddWorkout}
        >
            <Plus size={15} /> Add workout
        </Button>
        <Button type="button" variant="ghost" className={quietButtonClassName} onClick={onAddRest}>
            <Plus size={15} /> Add rest
        </Button>
    </div>
);

const KineticSessionBuilder = ({ className }: KineticSessionBuilderProps) => {
    const editingSessionDraft = useWorkoutStore((state) => state.editingSessionDraft);
    const savedSessions = useWorkoutStore((state) => state.savedSessions);
    const savedWorkouts = useWorkoutStore((state) => state.savedWorkouts);
    const editingSessionNodeId = useWorkoutStore((state) => state.editingSessionNodeId);
    const settings = useWorkoutStore((state) => state.settings);
    const prepTime = settings.prepTime;
    const progressionReminderThreshold = getProgressionReminderThreshold(
        (settings as typeof settings & { progressionReminderThreshold?: unknown }).progressionReminderThreshold,
    );
    const saveSessionDraft = useWorkoutStore((state) => state.saveSessionDraft);
    const saveSessionDraftAs = useWorkoutStore((state) => state.saveSessionDraftAs);
    const startSession = useWorkoutStore((state) => state.startSession);
    const addDefaultWorkoutNode = useWorkoutStore((state) => (
        (state as typeof state & { addDefaultWorkoutNode: () => ActionResult }).addDefaultWorkoutNode
    ));
    const addRestNode = useWorkoutStore((state) => state.addRestNode);
    const updateWorkoutNode = useWorkoutStore((state) => state.updateWorkoutNode);
    const updateRestNode = useWorkoutStore((state) => state.updateRestNode);
    const removeSessionNode = useWorkoutStore((state) => state.removeSessionNode);
    const moveSessionNode = useWorkoutStore((state) => state.moveSessionNode);
    const moveSessionNodeToIndex = useWorkoutStore((state) => state.moveSessionNodeToIndex);
    const replaceWorkoutNodeWithSavedWorkout = useWorkoutStore((state) => state.replaceWorkoutNodeWithSavedWorkout);
    const insertSessionNodeAfter = useWorkoutStore((state) => state.insertSessionNodeAfter);
    const setEditingSessionNodeId = useWorkoutStore((state) => state.setEditingSessionNodeId);
    const { feedback: saveFeedback, dismiss: dismissSaveFeedback, trackSessionSave } = useBuilderSaveFeedback(editingSessionDraft?.id ?? null);
    const [isCompactViewport, setIsCompactViewport] = useState(() => (
        typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia(COMPACT_VIEWPORT_QUERY).matches
    ));
    const [isMobileInspectorOpen, setIsMobileInspectorOpen] = useState(false);

    const [draftName, setDraftName] = useState(editingSessionDraft?.name ?? '');
    const [dialog, setDialog] = useState<BuilderDialog>(null);
    const [dialogValue, setDialogValue] = useState('');
    const [statusMessage, setStatusMessage] = useState<SuccessNotification | null>(null);
    const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
    const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const statusSequenceRef = useRef(0);
    const nodeCardRefs = useRef(new Map<string, HTMLElement>());
    const pendingScrollNodeIdRef = useRef<string | null>(null);
    const autoOpenedInspectorSessionIdRef = useRef<string | null>(null);

    const closeMobileInspector = useCallback(() => {
        setIsMobileInspectorOpen(false);
        if (editingSessionNodeId) nodeCardRefs.current.get(editingSessionNodeId)?.focus();
    }, [editingSessionNodeId]);

    const nodes = useMemo(() => editingSessionDraft?.nodes ?? [], [editingSessionDraft?.nodes]);
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
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const mediaQuery = window.matchMedia(COMPACT_VIEWPORT_QUERY);
        const handleViewportChange = (event: MediaQueryListEvent) => setIsCompactViewport(event.matches);
        setIsCompactViewport(mediaQuery.matches);

        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handleViewportChange);
            return () => mediaQuery.removeEventListener('change', handleViewportChange);
        }

        mediaQuery.addListener(handleViewportChange);
        return () => mediaQuery.removeListener(handleViewportChange);
    }, []);
    useEffect(() => {
        setDraftName(editingSessionDraft?.name ?? '');
    }, [editingSessionDraft?.id, editingSessionDraft?.name]);
    useEffect(() => {
        if (!statusMessage?.undo || statusMessage.undo.sessionId === editingSessionDraft?.id) return;
        setStatusMessage(null);
    }, [editingSessionDraft?.id, statusMessage]);

    useEffect(() => {
        if (!editingSessionDraft) {
            if (editingSessionNodeId !== null) setEditingSessionNodeId(null);
            return;
        }

        if (editingSessionNodeId && nodes.some((node) => node.id === editingSessionNodeId)) return;
        setEditingSessionNodeId(nodes[0]?.id ?? null);
    }, [editingSessionDraft, editingSessionNodeId, nodes, setEditingSessionNodeId]);

    useEffect(() => {
        if (!isCompactViewport || !editingSessionDraft || nodes.length === 0) return;
        if (autoOpenedInspectorSessionIdRef.current === editingSessionDraft.id) return;

        autoOpenedInspectorSessionIdRef.current = editingSessionDraft.id;
        const selectedNodeId = editingSessionNodeId && nodes.some((node) => node.id === editingSessionNodeId)
            ? editingSessionNodeId
            : nodes[0].id;
        if (selectedNodeId !== editingSessionNodeId) setEditingSessionNodeId(selectedNodeId);
        setIsMobileInspectorOpen(true);
    }, [editingSessionDraft, editingSessionNodeId, isCompactViewport, nodes, setEditingSessionNodeId]);

    useEffect(() => {
        const pendingNodeId = pendingScrollNodeIdRef.current;
        if (!pendingNodeId) return;

        const nodeElement = nodeCardRefs.current.get(pendingNodeId);
        if (!nodeElement) return;

        pendingScrollNodeIdRef.current = null;
        nodeElement.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }, [nodes]);

    useEffect(() => () => {
        if (statusTimeoutRef.current !== null) {
            clearTimeout(statusTimeoutRef.current);
            statusTimeoutRef.current = null;
        }
    }, []);

    const showSuccess = (message: string, undo?: PendingNodeRemoval) => {
        if (statusTimeoutRef.current !== null) {
            clearTimeout(statusTimeoutRef.current);
            statusTimeoutRef.current = null;
        }

        const id = statusSequenceRef.current + 1;
        statusSequenceRef.current = id;
        setStatusMessage({ id, message, undo });
        if (undo) return;

        const timeoutId = setTimeout(() => {
            setStatusMessage((current) => current?.id === id ? null : current);
            if (statusTimeoutRef.current === timeoutId) {
                statusTimeoutRef.current = null;
            }
        }, 3000);
        statusTimeoutRef.current = timeoutId;
    };

    const dismissSuccess = () => {
        if (statusTimeoutRef.current !== null) {
            clearTimeout(statusTimeoutRef.current);
            statusTimeoutRef.current = null;
        }
        setStatusMessage(null);
    };

    const showResult = (result: ActionResult, successMessage?: string) => {
        if (!result.ok) {
            setDialog({ kind: 'feedback', title: 'Could not update session', description: result.error ?? 'Please check the session and try again.', tone: 'error' });
            return;
        }
        if (successMessage) showSuccess(successMessage);
    };


    const handleSave = () => {
        dismissSaveFeedback();
        const result = saveSessionDraft(draftName || undefined);
        if (!result.ok) {
            showResult(result);
            return;
        }
        if (result.id) trackSessionSave(result.id);
    };

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
            pendingScrollNodeIdRef.current = result.id;
            setEditingSessionNodeId(result.id);
            if (isCompactViewport) setIsMobileInspectorOpen(true);
            showSuccess('Block added');
        } else {
            showResult(result);
        }
    };

    const handleAddWorkout = () => handleAddResult(addDefaultWorkoutNode());
    const handleAddRest = () => handleAddResult(addRestNode('60'));

    const handleDialogConfirm = () => {
        if (!dialog) return;
        if (dialog.kind === 'feedback') {
            setDialog(null);
            return;
        }
        dismissSaveFeedback();
        const result = saveSessionDraftAs(dialogValue);
        if (!result.ok) {
            setDialog({ kind: 'feedback', title: 'Could not save session', description: result.error ?? 'Please choose another name.', tone: 'error' });
            return;
        }
        setDialog(null);
        setDraftName(dialogValue);
        if (result.id) {
            trackSessionSave(result.id);
        }
    };
    const handleDeleteNode = (nodeId: string) => {
        const index = nodes.findIndex((node) => node.id === nodeId);
        const node = nodes[index];
        if (!node || !editingSessionDraft) return;
        const undo = {
            sessionId: editingSessionDraft.id,
            node,
            previousNodeId: nodes[index - 1]?.id ?? null,
            nextNodeId: nodes[index + 1]?.id ?? null,
        };
        const nextNode = nodes[index + 1] ?? nodes[index - 1] ?? null;
        removeSessionNode(nodeId);
        setEditingSessionNodeId(nextNode?.id ?? null);
        if (isCompactViewport) setIsMobileInspectorOpen(Boolean(nextNode));
        showSuccess('Block removed', undo);
    };

    const handleUndoRemoval = () => {
        const removal = statusMessage?.undo;
        if (!removal) return;
        if (!editingSessionDraft || editingSessionDraft.id !== removal.sessionId) {
            dismissSuccess();
            return;
        }

        const currentNodes = editingSessionDraft.nodes;
        if (currentNodes.some((node) => node.id === removal.node.id)) {
            dismissSuccess();
            return;
        }
        const previousIndex = removal.previousNodeId
            ? currentNodes.findIndex((node) => node.id === removal.previousNodeId)
            : -1;
        const nextIndex = removal.nextNodeId
            ? currentNodes.findIndex((node) => node.id === removal.nextNodeId)
            : -1;
        const afterNodeId = previousIndex >= 0
            ? removal.previousNodeId
            : nextIndex > 0
                ? currentNodes[nextIndex - 1].id
                : null;

        insertSessionNodeAfter(afterNodeId, removal.node);
        setEditingSessionNodeId(removal.node.id);
        if (isCompactViewport) setIsMobileInspectorOpen(true);
        showSuccess('Block restored');
    };


    return (
        <section className={cn('flex min-h-0 w-full flex-1 flex-col overflow-hidden', className)} style={{ backgroundColor: KINETIC.background, color: KINETIC.cream }} data-testid="kinetic-session-builder">
            <header className="shrink-0 border-b px-4 py-4 sm:px-6" style={surfaceStyle}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="console-heading text-xl">Session builder</h1>
                        <p className="mt-1 text-xs text-[var(--kinetic-muted)]">Arrange workout and recovery blocks. Open or create sessions in the library.</p>
                    </div>
                    {hasUnsavedChanges && <span className="console-tag">Unsaved changes</span>}
                </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6" style={{ borderColor: KINETIC.border, backgroundColor: KINETIC.background }}>
                    <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
                        <Input
                            aria-label="Session name"
                            value={draftName}
                            onChange={(event) => setDraftName(event.target.value)}
                            placeholder="Name this session"
                            className="console-input min-w-0 max-w-[420px] flex-1"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="ghost" className={quietButtonClassName} onClick={handleSave} disabled={nodes.length === 0}><Save size={15} /> Save</Button>
                        <Button type="button" variant="ghost" className={iconButtonClassName} onClick={handleSaveAs} disabled={nodes.length === 0} aria-label="Save session as copy" title="Save session as copy"><Copy size={15} /></Button>
                        <Button type="button" className="console-button console-button--primary px-4" onClick={handleStart} disabled={nodes.length === 0}><Play size={15} fill="currentColor" /> Start</Button>
                    </div>
                </div>

                {saveFeedback && (
                    <BuilderSaveFeedback feedback={saveFeedback} onDismiss={dismissSaveFeedback} className="mx-4 my-3 shrink-0 sm:mx-6" />
                )}
                {statusMessage && (!saveFeedback || statusMessage.undo) && (
                    <div role="status" aria-live="polite" className="mx-4 my-3 flex shrink-0 items-center justify-between gap-3 rounded-lg border border-[var(--kinetic-border)] bg-[var(--kinetic-panel-raised)] px-3 text-sm sm:mx-6">
                        <span>{statusMessage.message}</span>
                        <div className="flex items-center gap-2">
                            {statusMessage.undo && (
                                <Button type="button" variant="ghost" className={quietButtonClassName} onClick={handleUndoRemoval} aria-label="Undo block removal">
                                    Undo
                                </Button>
                            )}
                            <button type="button" className="console-icon console-button--quiet" onClick={dismissSuccess} aria-label="Dismiss notification"><X size={16} /></button>
                        </div>
                    </div>
                )}
                <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <section aria-labelledby="kinetic-timeline-title" className="min-h-0 overflow-y-auto px-4 py-5 sm:px-6 xl:py-6">
                        <div className="mb-4 flex items-baseline gap-3">
                            <h2 id="kinetic-timeline-title" className="console-heading flex items-center gap-2 text-sm"><Activity size={15} /> Timeline</h2>
                            {nodes.length > 0 && <span className="text-xs" style={{ color: KINETIC.muted }}>{`${nodes.length} blocks · ${workoutCount} work · ${restCount} recovery`}</span>}
                        </div>

                        {nodes.length === 0 ? (
                            <div className="space-y-5 py-10 text-center">
                                <div className="flex min-h-[180px] items-center justify-center">
                                    <div className="max-w-[260px]">
                                        <ListPlus size={22} className="mx-auto" style={{ color: KINETIC.themeSoft }} />
                                        <div className="mt-3 text-sm font-semibold" style={{ color: KINETIC.cream }}>No blocks yet</div>
                                        <p className="mt-1 text-xs leading-relaxed" style={{ color: KINETIC.muted }}>Add a workout or recovery block to start your timeline.</p>
                                    </div>
                                </div>
                                <TimelineAddControls onAddWorkout={handleAddWorkout} onAddRest={handleAddRest} />
                            </div>
                        ) : (
                            <div className="pl-8">
                                <div data-testid="kinetic-session-timeline" className="relative w-full space-y-3 border-l border-[var(--kinetic-border)] pl-5">
                                    {nodes.map((node, index) => (
                                        <KineticNodeCard
                                            key={node.id}
                                            node={node}
                                            index={index}
                                            total={nodes.length}
                                            selected={node.id === editingSessionNodeId}
                                            onSelect={() => {
                                                setEditingSessionNodeId(node.id);
                                                if (isCompactViewport) setIsMobileInspectorOpen(true);
                                            }}
                                            onMove={(direction) => moveSessionNode(node.id, direction === 'left' ? 'left' : 'right')}
                                            onDelete={() => handleDeleteNode(node.id)}
                                            progressionReminderThreshold={progressionReminderThreshold}
                                            nodeRef={(element) => {
                                                if (element) nodeCardRefs.current.set(node.id, element);
                                                else nodeCardRefs.current.delete(node.id);
                                            }}
                                            onDragStart={() => setDraggedNodeId(node.id)}
                                            onDrop={() => {
                                                if (draggedNodeId && draggedNodeId !== node.id) moveSessionNodeToIndex(draggedNodeId, index);
                                                setDraggedNodeId(null);
                                            }}
                                        />
                                    ))}
                                    <TimelineAddControls onAddWorkout={handleAddWorkout} onAddRest={handleAddRest} />
                                </div>
                            </div>
                        )}
                    </section>

                    {isCompactViewport ? (
                        isMobileInspectorOpen && selectedNode ? createPortal(
                            <>
                                <div
                                    aria-hidden="true"
                                    className="fixed inset-0 z-[90] bg-black/65"
                                    onClick={closeMobileInspector}
                                />
                                <NodeInspector
                                    node={selectedNode}
                                    savedWorkouts={savedWorkouts}
                                    onClose={closeMobileInspector}
                                    onUpdateWorkout={(node, config, name, notes) => updateWorkoutNode(node.id, config, name, notes)}
                                    onUpdateRest={(node, seconds, name) => updateRestNode(node.id, seconds, name)}
                                    onImportWorkout={(nodeId, workoutId) => showResult(replaceWorkoutNodeWithSavedWorkout(nodeId, workoutId), 'Workout linked')}
                                    onDelete={handleDeleteNode}
                                    isMobileSheet
                                />
                            </>,
                            document.querySelector('[data-design-variant]') ?? document.body,
                        ) : null
                    ) : (
                        <NodeInspector
                            node={selectedNode}
                            savedWorkouts={savedWorkouts}
                            onClose={() => setEditingSessionNodeId(null)}
                            onUpdateWorkout={(node, config, name, notes) => updateWorkoutNode(node.id, config, name, notes)}
                            onUpdateRest={(node, seconds, name) => updateRestNode(node.id, seconds, name)}
                            onImportWorkout={(nodeId, workoutId) => showResult(replaceWorkoutNodeWithSavedWorkout(nodeId, workoutId), 'Workout linked')}
                            onDelete={handleDeleteNode}
                        />
                    )}
                </div>
            </div>

            <footer className="flex shrink-0 items-center border-t px-4 py-3 text-xs sm:px-6" style={{ borderColor: KINETIC.border, backgroundColor: KINETIC.background, color: KINETIC.muted }}>
                <div className="flex items-center gap-3"><span>Prep {prepTime}s</span><span aria-hidden="true">·</span><span>{duration} estimated</span></div>
            </footer>

            <BuilderDialog dialog={dialog} value={dialogValue} onChangeValue={setDialogValue} onClose={() => setDialog(null)} onConfirm={handleDialogConfirm} isCompactViewport={isCompactViewport} />
        </section>
    );
};

export { KineticSessionBuilder };
export default KineticSessionBuilder;
