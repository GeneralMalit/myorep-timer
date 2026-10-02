import type { BuilderSaveFeedback as BuilderSaveFeedbackState } from '@/hooks/useBuilderSaveFeedback';
import { cn } from '@/lib/utils';

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
    if (!feedback) {
        return null;
    }

    return (
        <div
            data-testid="builder-save-feedback"
            role="status"
            aria-live="polite"
            className={cn('flex items-center gap-3 rounded-lg border px-3 py-2 text-xs font-semibold shadow-lg', toneClassName[feedback.tone], className)}
        >
            <span>{feedback.message}</span>
            <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss save status"
                className="ml-auto shrink-0 rounded px-1.5 py-1 opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
            >
                Dismiss
            </button>
        </div>
    );
};

export default BuilderSaveFeedback;
