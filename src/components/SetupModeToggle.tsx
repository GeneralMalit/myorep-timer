import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SetupModeToggleProps {
    mode: 'workout' | 'session';
    onChange: (mode: 'workout' | 'session') => void;
    className?: string;
}

const SetupModeToggle = ({ mode, onChange, className }: SetupModeToggleProps) => {
    return (
        <div className={cn('inline-flex rounded-full bg-muted/40 p-1', className)}>
            <Button
                type="button"
                variant={mode === 'workout' ? 'default' : 'ghost'}
                onClick={() => onChange('workout')}
                className="rounded-full px-4 text-[11px] font-black uppercase tracking-[0.22em]"
            >
                Workout Setup
            </Button>
            <Button
                type="button"
                variant={mode === 'session' ? 'default' : 'ghost'}
                onClick={() => onChange('session')}
                className="rounded-full px-4 text-[11px] font-black uppercase tracking-[0.22em]"
            >
                Session Builder
            </Button>
        </div>
    );
};

export default SetupModeToggle;
