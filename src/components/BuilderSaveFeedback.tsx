import type { BuilderSaveFeedback as BuilderSaveFeedbackState } from '@/hooks/useBuilderSaveFeedback';
import { cn } from '@/lib/utils';
import { useWorkoutStore } from '@/store/useWorkoutStore';

const toneClassName: Record<BuilderSaveFeedbackState['tone'], string> = {
    pending: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
    confirmed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    local: 'border-slate-500/30 bg-slate-500/10 text-foreground',
    paused: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
    error: 'border-destructive/30 bg-destructive/10 text-destructive',
};

const BuilderSaveFeedback = ({
    feedback,
    onDismiss,
    className,
}: {
    feedback: BuilderSaveFeedbackState | null;
    onDismiss: () => void;
    className?: string;
}) => {
    const isKinetic = useWorkoutStore((state) => state.designVariant === 'kinetic');
    if (!feedback) {
        return null;
    }

    return (
        <div
            data-testid="builder-save-feedback"
            role="status"
            aria-live="polite"
            className={cn('flex items-center gap-3 rounded-lg border px-3 text-xs font-semibold', isKinetic ? 'py-1' : 'py-2 shadow-lg', toneClassName[feedback.tone], isKinetic && feedback.tone === 'error' && 'text-red-200', className)}
        >
            <span className="min-w-0 flex-1">{feedback.message}</span>
            <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss save status"
                className={isKinetic ? 'console-button console-button--quiet' : 'ml-auto shrink-0 rounded px-1.5 py-1 opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current'}
            >
                Dismiss
            </button>
        </div>
    );
};

export default BuilderSaveFeedback;
