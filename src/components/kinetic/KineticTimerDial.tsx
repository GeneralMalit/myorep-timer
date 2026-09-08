interface KineticTimerDialProps {
    value: number;
    max: number;
    time: string;
    label: string;
    detail: string;
    tone: 'work' | 'rest' | 'finished' | 'ready';
}

const toneColor = {
    work: '#a8ff5a',
    rest: '#74c7ff',
    finished: '#a8ff5a',
    ready: '#ff5b36',
} as const;

const KineticTimerDial = ({ value, max, time, label, detail, tone }: KineticTimerDialProps) => {
    const radius = 152;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
    const offset = circumference - circumference * progress;
    const color = toneColor[tone];

    return (
        <div className="relative mx-auto aspect-square w-full max-w-[410px]" aria-label={`${label}: ${time}`}>
            <svg viewBox="0 0 360 360" className="h-full w-full -rotate-90" aria-hidden="true">
                <circle cx="180" cy="180" r={radius} fill="none" stroke="#262a2e" strokeWidth="12" />
                <circle
                    cx="180"
                    cy="180"
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 150ms linear, stroke 150ms ease' }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color }}>{label}</div>
                <div className="mt-2 font-['Sora'] text-[clamp(4rem,10vw,6.75rem)] font-bold leading-none tracking-[-0.09em] text-white tabular-nums">{time}</div>
                <div className="mt-3 text-sm font-medium text-zinc-400">{detail}</div>
            </div>
        </div>
    );
};

export default KineticTimerDial;
