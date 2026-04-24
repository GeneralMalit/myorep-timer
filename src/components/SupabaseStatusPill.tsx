import { cn } from '@/lib/utils';
import { getSupabaseRuntimeState } from '@/lib/supabase';

const toneClasses: Record<'disabled' | 'missing-config' | 'ready', string> = {
    disabled: 'border-border/50 bg-muted/50 text-muted-foreground',
    'missing-config': 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    ready: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

const SupabaseStatusPill = () => {
    const runtimeState = getSupabaseRuntimeState();

    return (
        <div
            className={cn(
                'inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border px-4 py-2 text-[9px] font-black uppercase tracking-[0.32em] sm:text-[10px]',
                toneClasses[runtimeState.status],
            )}
            title={runtimeState.detail}
        >
            <span>{runtimeState.label}</span>
            <span className="tracking-[0.2em] text-current/70">{runtimeState.detail}</span>
        </div>
    );
};

export default SupabaseStatusPill;
