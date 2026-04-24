import { composeClassParts } from '@/layout';

const shellParts = {
    layout: 'flex min-h-0 w-full flex-col',
    spacing: 'gap-5 px-3 py-3 pb-6',
    viewport: 'min-h-full',
};

const shellInnerParts = {
    layout: 'mx-auto flex min-h-0 w-full flex-col',
    spacing: 'gap-4',
    size: 'max-w-none',
};

const headerParts = {
    layout: 'flex flex-col',
    spacing: 'gap-4',
};

const titleBlockParts = {
    spacing: 'space-y-2',
};

const summaryParts = {
    typography: 'text-sm font-medium leading-relaxed text-muted-foreground',
};

const controlsParts = {
    layout: 'flex w-full flex-col items-start',
    spacing: 'gap-4',
};

const actionsWrapParts = {
    size: 'w-full px-1 py-1',
};

const actionsGridParts = {
    layout: 'grid w-full grid-cols-2',
    spacing: 'gap-3',
};

const estimatedTimeParts = {
    layout: 'flex w-full items-baseline justify-start',
    spacing: 'gap-3 px-1',
    typography: 'text-[12px] font-semibold uppercase tracking-[0.24em] text-muted-foreground',
};

const canvasWrapParts = {
    layout: 'flex min-h-0 flex-none',
};

const canvasInnerParts = {
    layout: 'flex min-h-0 w-full',
};

const dialogBackdropParts = {
    position: 'fixed inset-0 z-[115]',
    layout: 'flex items-end justify-center',
    surface: 'bg-black/70',
    spacing: 'px-0 py-0',
    effects: 'backdrop-blur-sm',
};

const dialogPanelParts = {
    size: 'w-full max-w-none',
    surface: 'border border-border/60 border-b-0 bg-background/95 rounded-t-[28px] rounded-b-none',
    spacing: 'p-5',
    effects: 'shadow-[0_24px_90px_rgba(0,0,0,0.45)]',
};

const dialogHandleParts = {
    spacing: 'mx-auto mb-4',
    size: 'h-1.5 w-12',
    surface: 'rounded-full bg-muted/50',
};

const dialogActionsParts = {
    spacing: 'mt-6',
    layout: 'grid grid-cols-1 gap-2',
};

export const sessionBuilderMobileLayout = {
    shell: composeClassParts(shellParts),
    shellInner: composeClassParts(shellInnerParts),
    header: composeClassParts(headerParts),
    titleBlock: composeClassParts(titleBlockParts),
    summary: composeClassParts(summaryParts),
    controls: composeClassParts(controlsParts),
    toggle: '',
    actionsWrap: composeClassParts(actionsWrapParts),
    actionsGrid: composeClassParts(actionsGridParts),
    estimatedTime: composeClassParts(estimatedTimeParts),
    canvasWrap: composeClassParts(canvasWrapParts),
    canvasInner: composeClassParts(canvasInnerParts),
    dialog: {
        backdrop: composeClassParts(dialogBackdropParts),
        panel: composeClassParts(dialogPanelParts),
        handle: composeClassParts(dialogHandleParts),
        actions: composeClassParts(dialogActionsParts),
    },
} as const;
