import { composeClassParts } from '@/layout';

const asideBaseParts = {
    position: 'fixed inset-y-0 left-0 z-50',
    layout: 'flex flex-col',
    size: 'w-[min(22rem,calc(100vw-1rem))] max-w-full',
    surface: 'rounded-r-[2rem] border-r border-border/60 bg-background',
    effects: 'shadow-2xl transition-all duration-300',
};

const headerParts = {
    layout: 'flex items-center justify-between',
    size: 'h-20',
    spacing: 'px-4 pt-[calc(var(--safe-top)+0.5rem)]',
    surface: 'border-b border-border/50',
};

const headerBrandParts = {
    layout: 'flex min-w-0 items-center overflow-hidden',
    spacing: 'gap-3',
};

const headerTitleParts = {
    size: 'truncate pr-2',
    typography: 'text-xl font-black italic tracking-tighter text-primary',
};

const headerSubtitleParts = {
    typography: 'text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground/60',
};

const contentParts = {
    layout: 'no-scrollbar flex-1 overflow-y-auto',
    spacing: 'space-y-5 px-4 py-5 pb-[calc(var(--safe-bottom)+1rem)]',
};

const sectionCardParts = {
    spacing: 'p-4',
    surface: 'rounded-[24px] border border-border/60 bg-card/70',
};

const sectionTitleParts = {
    layout: 'mb-4 flex items-center gap-2',
    typography: 'text-xs font-bold uppercase tracking-widest text-muted-foreground/60',
};

const themeButtonBaseParts = {
    layout: 'group flex min-h-11 items-center',
    spacing: 'gap-3 px-3 py-2',
    surface: 'rounded-2xl border border-border/50',
    typography: 'text-left',
    effects: 'transition-all duration-200',
};

const sessionsHeaderParts = {
    layout: 'flex items-center justify-between',
    spacing: 'gap-2',
};

const listParts = {
    layout: 'no-scrollbar overflow-y-auto pr-1',
    spacing: 'max-h-56 space-y-3',
};

const itemParts = {
    spacing: 'space-y-2 pb-3',
};

const itemHeaderParts = {
    layout: 'flex items-start justify-between',
    spacing: 'gap-3',
};

const actionGridParts = {
    layout: 'grid grid-cols-2',
    spacing: 'gap-2',
};

const footerParts = {
    spacing: 'p-4',
    surface: 'border-t border-border',
};

export const sidebarMobileLayout = {
    asideBase: composeClassParts(asideBaseParts),
    asideOpen: 'translate-x-0',
    asideClosed: '-translate-x-[calc(100%+1rem)]',
    header: composeClassParts(headerParts),
    headerBrand: composeClassParts(headerBrandParts),
    headerBrandIcon: 'flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/20',
    headerBrandText: 'min-w-0',
    headerTitle: composeClassParts(headerTitleParts),
    headerSubtitle: composeClassParts(headerSubtitleParts),
    headerButton: 'shrink-0',
    content: composeClassParts(contentParts),
    sectionCard: composeClassParts(sectionCardParts),
    sectionTitle: composeClassParts(sectionTitleParts),
    themeGrid: 'grid gap-2',
    themeButtonBase: composeClassParts(themeButtonBaseParts),
    themeButtonActive: 'bg-primary/10 text-primary',
    themeButtonInactive: 'bg-background/50 text-muted-foreground hover:bg-accent',
    themeDot: 'h-3 w-3 shrink-0 rounded-full transition-transform group-hover:scale-125',
    infoCard: composeClassParts(sectionCardParts),
    infoEyebrow: 'text-[10px] font-black uppercase tracking-[0.28em] text-muted-foreground/60',
    infoButton: 'min-h-11 justify-start p-0 text-left text-sm font-black tracking-tight text-foreground no-underline',
    infoText: 'text-[11px] leading-relaxed text-muted-foreground/80',
    sectionEyebrow: 'text-[10px] font-black uppercase tracking-[0.28em] text-muted-foreground/60',
    sessionsSection: composeClassParts({ ...sectionCardParts, stack: 'space-y-3' }),
    sessionsHeader: composeClassParts(sessionsHeaderParts),
    sessionsTitle: 'text-sm font-black tracking-tight text-foreground',
    sessionsNewButton: 'min-h-11 px-3 text-[10px] font-bold',
    plusCard: 'rounded-2xl border border-border/60 bg-background/60 p-4 text-left',
    plusTitle: 'text-[10px] font-black uppercase tracking-[0.24em] text-primary',
    plusDescription: 'mt-2 text-base font-black tracking-tight text-foreground',
    plusCopy: 'mt-2 text-[11px] leading-relaxed text-muted-foreground',
    plusButton: 'mt-4 min-h-11 w-full justify-center rounded-xl font-bold',
    sessionsList: composeClassParts(listParts),
    sessionsEmpty: 'px-1 text-[10px] uppercase tracking-wider text-muted-foreground/60',
    sessionItem: composeClassParts(itemParts),
    sessionItemDivider: 'border-b border-border/50',
    sessionItemHeader: composeClassParts(itemHeaderParts),
    sessionItemTitle: 'truncate text-xs font-bold',
    sessionItemMeta: 'text-[10px] uppercase tracking-tight text-muted-foreground',
    sessionItemTimeWrap: 'shrink-0 text-right',
    sessionItemTimeLabel: 'text-[9px] font-black uppercase tracking-[0.22em] text-muted-foreground',
    sessionItemTimeValue: 'text-[10px] font-black tracking-tight text-foreground',
    sessionActionsGrid: composeClassParts(actionGridParts),
    sessionActionButton: 'min-h-11 px-2 text-[10px] font-bold',
    workoutsSection: composeClassParts({ ...sectionCardParts, stack: 'space-y-3' }),
    workoutsTitle: 'text-sm font-black tracking-tight text-foreground',
    workoutsActionsGrid: composeClassParts(actionGridParts),
    workoutsButton: 'min-h-11 w-full px-0 font-bold',
    workoutsImportSummary: 'rounded-lg border border-border/50 bg-accent/20 p-2 text-[10px] leading-relaxed',
    workoutsImportSummaryTitle: 'font-bold uppercase tracking-wider text-muted-foreground',
    workoutsImportSummaryError: 'mt-1 text-destructive',
    workoutsImportSummaryDismiss: 'mt-1 font-semibold text-primary',
    workoutsList: composeClassParts(listParts),
    workoutItem: composeClassParts(itemParts),
    workoutItemTitle: 'truncate text-xs font-bold',
    workoutItemMeta: 'text-[10px] uppercase tracking-tight text-muted-foreground',
    workoutItemActionsGrid: composeClassParts(actionGridParts),
    workoutActionButton: 'min-h-11 px-2 text-[10px] font-bold',
    workoutStat: 'flex min-h-11 items-center justify-center rounded border border-border/60 bg-background/60 text-[9px] font-bold',
    footer: composeClassParts(footerParts),
    footerButton: 'min-h-12 w-full gap-2 font-bold transition-all',
    footerButtonCollapsed: 'justify-center px-0',
    footerIcon: 'shrink-0',
    footerVersion: 'mt-4 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/40',
} as const;
