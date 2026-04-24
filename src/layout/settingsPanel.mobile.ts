import { composeClassParts } from '@/layout';

const overlayParts = {
    position: 'fixed inset-0 z-[100]',
    layout: 'flex items-stretch justify-end',
    surface: 'bg-background/80',
    effects: 'backdrop-blur-sm transition-opacity duration-300',
};

const panelParts = {
    layout: 'flex h-full flex-col overflow-hidden',
    size: 'w-[min(22rem,calc(100vw-1rem))] max-w-full',
    surface: 'rounded-l-[2rem] border border-border/70 border-r-0',
    effects: 'shadow-2xl transition-transform duration-300 ease-out',
};

const headerParts = {
    layout: 'flex flex-row items-start justify-between',
    spacing: 'gap-4 px-5 pb-4 pt-[calc(var(--safe-top)+1rem)]',
    surface: 'border-b border-border/60 bg-muted/25',
};

const titleParts = {
    layout: 'flex items-center gap-2',
    typography: 'text-lg font-black italic tracking-tight sm:text-xl',
};

const contentParts = {
    layout: 'no-scrollbar flex-1 overflow-y-auto',
    spacing: 'space-y-6 px-5 pt-5 pb-[calc(var(--safe-bottom)+1.5rem)]',
};

const sectionParts = {
    spacing: 'space-y-4 p-4',
    surface: 'rounded-[24px] border border-border/60 bg-card/70',
};

const sectionTitleParts = {
    layout: 'flex items-center gap-2',
    typography: 'text-xs font-black uppercase tracking-widest text-primary',
};

const visualGridParts = {
    layout: 'grid',
    spacing: 'gap-3 sm:grid-cols-2',
};

const visualCardParts = {
    spacing: 'space-y-2 p-3',
    surface: 'rounded-2xl border border-border/50 bg-accent/35',
};

const logisticsGridParts = {
    layout: 'grid',
    spacing: 'gap-4 sm:grid-cols-2',
};

const fieldParts = {
    spacing: 'space-y-2',
};

const fieldLabelParts = {
    spacing: 'px-1',
    typography: 'text-[10px] font-black uppercase tracking-wider text-muted-foreground',
};

const fieldInputParts = {
    surface: 'border-border/50 bg-accent/40',
    typography: 'font-bold',
};

const fieldHelpParts = {
    spacing: 'px-1',
    typography: 'text-[10px] uppercase tracking-tight text-muted-foreground',
};

const toggleRowParts = {
    layout: 'flex items-center justify-between',
    spacing: 'p-4',
    surface: 'rounded-2xl border border-border/50 bg-accent/35',
};

const toggleTitleParts = {
    typography: 'text-sm font-bold tracking-tight',
};

const toggleCopyParts = {
    typography: 'text-[10px] font-medium uppercase tracking-tighter text-muted-foreground',
};

const soundActionsParts = {
    layout: 'grid',
    spacing: 'gap-4 pt-2 sm:grid-cols-2',
    motion: 'animate-in slide-in-from-top-2 duration-300',
};

const selectFieldParts = {
    layout: 'h-11 w-full',
    spacing: 'px-3',
    surface: 'rounded-2xl border border-border/50 bg-accent/35',
    typography: 'text-sm font-bold',
};

const testButtonParts = {
    layout: 'min-h-11 gap-2',
    surface: 'rounded-2xl',
    typography: 'font-black italic tracking-tighter',
};

export const settingsPanelMobileLayout = {
    overlay: composeClassParts(overlayParts),
    overlayOpen: 'opacity-100',
    overlayClosed: 'pointer-events-none opacity-0',
    panel: composeClassParts(panelParts),
    panelOpen: 'translate-x-0',
    panelClosed: 'translate-x-[calc(100%+1rem)]',
    header: composeClassParts(headerParts),
    title: composeClassParts(titleParts),
    closeButton: 'h-11 w-11 shrink-0 rounded-2xl',
    content: composeClassParts(contentParts),
    section: composeClassParts(sectionParts),
    sectionTitle: composeClassParts(sectionTitleParts),
    visualGrid: composeClassParts(visualGridParts),
    visualCard: composeClassParts(visualCardParts),
    colorSwatch: 'h-8 w-8 shrink-0 rounded-lg border border-white/10 shadow-inner',
    colorInput: 'h-8 w-full cursor-pointer border-none bg-transparent p-0',
    logisticsGrid: composeClassParts(logisticsGridParts),
    field: composeClassParts(fieldParts),
    fieldLabel: composeClassParts(fieldLabelParts),
    fieldInput: composeClassParts(fieldInputParts),
    fieldHelp: composeClassParts(fieldHelpParts),
    toggleRow: composeClassParts(toggleRowParts),
    toggleTitle: composeClassParts(toggleTitleParts),
    toggleCopy: composeClassParts(toggleCopyParts),
    soundActions: composeClassParts(soundActionsParts),
    selectField: composeClassParts(selectFieldParts),
    testButton: composeClassParts(testButtonParts),
} as const;
