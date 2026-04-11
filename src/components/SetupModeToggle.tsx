import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SetupModeToggleProps {
    mode: 'workout' | 'session';
    onChange: (mode: 'workout' | 'session') => void;
    className?: string;
}

const SetupModeToggle = ({ mode, onChange, className }: SetupModeToggleProps) => {
    return (
        <div className={cn('inline-flex w-full max-w-xl flex-wrap rounded-[1.25rem] bg-muted/40 p-1 sm:w-auto sm:flex-nowrap', className)}>
            <Button
                type="button"
                variant={mode === 'workout' ? 'default' : 'ghost'}
                onClick={() => onChange('workout')}
                className="min-h-11 flex-1 rounded-2xl px-4 text-[11px] font-black uppercase tracking-[0.22em] sm:flex-none"
            >
                Workout Setup
            </Button>
            <Button
                type="button"
                variant={mode === 'session' ? 'default' : 'ghost'}
                onClick={() => onChange('session')}
                className="min-h-11 flex-1 rounded-2xl px-4 text-[11px] font-black uppercase tracking-[0.22em] sm:flex-none"
            >
                Session Builder
            </Button>
        </div>
    );
};

export default SetupModeToggle;
