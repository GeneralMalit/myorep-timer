import React from 'react';
import { X, BrainCircuit, Clock3, Dumbbell, ExternalLink, ShieldAlert, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ProtocolIntelModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const sourceLinks = [
    {
        label: 'Borge Fagerli: Myo-reps in English',
        href: 'https://www.borgefagerli.com/myo-reps-in-english/',
    },
    {
        label: 'Barbell Medicine: Myo-Reps',
        href: 'https://www.barbellmedicine.com/blog/myo-reps/',
    },
    {
        label: 'PubMed: Rest-pause vs traditional sets',
        href: 'https://pubmed.ncbi.nlm.nih.gov/28617715/',
    },
    {
        label: 'PubMed: Advanced resistance training systems meta-analysis',
        href: 'https://pubmed.ncbi.nlm.nih.gov/41718208/',
    },
];

const ProtocolIntelModal: React.FC<ProtocolIntelModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[120] bg-background/85 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label="Protocol Intel"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div className="mx-auto flex h-full w-full max-w-6xl items-center p-4 sm:p-6">
                <Card className="relative max-h-[92vh] w-full overflow-hidden border-border/70 shadow-2xl">
                    <div className="absolute right-4 top-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="rounded-full"
                            aria-label="Close protocol intel"
                            title="Close protocol intel"
                        >
                            <X size={18} />
                        </Button>
                    </div>

                    <CardContent className="flex max-h-[92vh] flex-col overflow-y-auto px-5 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
                        <div className="space-y-3 border-b border-border/60 pb-6 pr-12">
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-primary">
                                <BrainCircuit size={16} />
                                Protocol Intel
                            </div>
                            <h2 className="text-3xl font-black italic tracking-tighter text-foreground sm:text-5xl">
                                What Myo-Reps Actually Are
                            </h2>
                            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                                Myo-reps are a rest-pause hypertrophy method: you do one hard activation set close to failure,
                                then keep the same load and repeat short mini-sets with very brief rests. The idea is to spend
                                more of the set in the high-recruitment zone without turning every exercise into a long marathon.
                            </p>
                        </div>

                        <div className="mt-6 grid gap-4 lg:grid-cols-2">
                            <Card className="border-border/60 bg-accent/20">
                                <CardContent className="p-5">
                                    <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-primary">
                                        <Target size={16} />
                                        Core idea
                                    </div>
                                    <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                                        <li>Start with a load you can take to about 1 to 2 reps in reserve.</li>
                                        <li>Do a high-rep activation set, usually in the 12 to 30 rep range.</li>
                                        <li>After a short rest, perform mini-sets of about 3 to 5 reps.</li>
                                        <li>Stop when you can no longer keep the mini-sets inside the target rep zone.</li>
                                    </ul>
                                </CardContent>
                            </Card>

                            <Card className="border-border/60 bg-accent/20">
                                <CardContent className="p-5">
                                    <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-primary">
                                        <Clock3 size={16} />
                                        Why it works
                                    </div>
                                    <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                                        <li>Short rests keep the muscle highly fatigued and keep effort density high.</li>
                                        <li>The activation set brings you close to the recruitment ceiling quickly.</li>
                                        <li>Mini-sets stretch the same fatigue state across several quality repetitions.</li>
                                        <li>Research on rest-pause systems generally shows similar hypertrophy to traditional sets when effort and volume are comparable.</li>
                                    </ul>
                                </CardContent>
                            </Card>

                            <Card className="border-border/60 bg-accent/20">
                                <CardContent className="p-5">
                                    <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-primary">
                                        <Dumbbell size={16} />
                                        Best use cases
                                    </div>
                                    <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                                        <li>Machines, cables, dumbbells, and other lifts that are easy to set up again quickly.</li>
                                        <li>Hypertrophy blocks where you want a lot of work in less time.</li>
                                        <li>Accessories and isolation work where form stays consistent under fatigue.</li>
                                        <li>Not ideal for technical barbell lifts that become unsafe when rest is very short.</li>
                                    </ul>
                                </CardContent>
                            </Card>

                            <Card className="border-border/60 bg-accent/20">
                                <CardContent className="p-5">
                                    <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-primary">
                                        <ShieldAlert size={16} />
                                        Practical guardrails
                                    </div>
                                    <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                                        <li>This timer uses one activation phase, then short clusters on later sets.</li>
                                        <li>When the mini-set rep count falls off hard, the protocol should end instead of chasing junk reps.</li>
                                        <li>If technique breaks, the set is over even if the rep target is not met.</li>
                                        <li>Use the setup inputs to tune work duration, rest, and rep targets to your exercise choice.</li>
                                    </ul>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="mt-6 grid gap-4 border-t border-border/60 pt-6 lg:grid-cols-[1.2fr_0.8fr]">
                            <Card className="border-border/60">
                                <CardContent className="p-5">
                                    <div className="mb-3 text-sm font-black uppercase tracking-widest text-primary">
                                        What this app is doing
                                    </div>
                                    <p className="text-sm leading-relaxed text-muted-foreground">
                                        The app treats the first working block as the activation set. On later sets, it switches into
                                        myo-rep mode: a short rest, then repeated mini-sets until the set ends. That matches the way the
                                        current timer, audio cues, and state machine already think about a workout.
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="border-border/60 bg-muted/30">
                                <CardContent className="p-5">
                                    <div className="mb-3 text-sm font-black uppercase tracking-widest text-primary">
                                        Sources
                                    </div>
                                    <div className="space-y-3">
                                        {sourceLinks.map((source) => (
                                            <a
                                                key={source.href}
                                                href={source.href}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent/50"
                                            >
                                                <span>{source.label}</span>
                                                <ExternalLink size={14} className="shrink-0 text-muted-foreground" />
                                            </a>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default ProtocolIntelModal;
