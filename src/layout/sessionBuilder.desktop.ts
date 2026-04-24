import { composeClassParts } from '@/layout';

const shellParts = {
    layout: 'flex min-h-0 w-full flex-col',
    spacing: 'gap-4 px-4 py-3 sm:px-5 sm:py-5 xl:px-6 xl:py-6',
    viewport: 'h-full',
};

const shellInnerParts = {
    layout: 'mx-auto flex min-h-0 h-full w-full flex-col',
    spacing: 'gap-4',
    size: 'max-w-[1024px]',
};

const headerParts = {
    layout: 'flex flex-col items-center text-center',
    spacing: 'gap-4',
};

const titleBlockParts = {
    spacing: 'space-y-2',
    size: 'max-w-3xl',
};

const summaryParts = {
    size: 'mx-auto max-w-2xl',
    typography: 'text-sm font-medium leading-relaxed text-muted-foreground',
};

const controlsParts = {
    layout: 'flex w-full flex-col items-center',
    spacing: 'gap-4',
};

const toggleParts = {
    size: 'w-full max-w-md',
    layout: 'justify-center',
};

const actionsWrapParts = {
    layout: 'flex justify-center px-2 py-2',
};

const actionsGridParts = {
    layout: 'flex w-full max-w-[920px] items-center justify-center overflow-x-auto',
    spacing: 'gap-3 pb-1',
};

const estimatedTimeParts = {
    layout: 'flex w-full max-w-[920px] items-baseline justify-end',
    spacing: 'gap-3 px-1',
    typography: 'text-[12px] font-semibold uppercase tracking-[0.24em] text-muted-foreground',
};

const canvasWrapParts = {
    layout: 'flex min-h-0 flex-1 justify-center',
    size: 'min-h-[340px]',
};

const canvasInnerParts = {
    layout: 'flex min-h-0 w-full flex-1',
    size: 'max-w-[920px]',
};

const dialogBackdropParts = {
    position: 'fixed inset-0 z-[115]',
    layout: 'flex items-center justify-center',
    surface: 'bg-black/70',
    spacing: 'px-4 py-6',
    effects: 'backdrop-blur-sm',
};

const dialogPanelParts = {
    size: 'w-full max-w-md',
    surface: 'border border-border/60 bg-background/95 rounded-[28px]',
    spacing: 'p-5',
    effects: 'shadow-[0_24px_90px_rgba(0,0,0,0.45)]',
};

const dialogActionsParts = {
    spacing: 'mt-6',
    layout: 'grid grid-cols-1 gap-2 sm:grid-cols-2',
};

export const sessionBuilderDesktopLayout = {
    shell: composeClassParts(shellParts),
    shellInner: composeClassParts(shellInnerParts),
    header: composeClassParts(headerParts),
    titleBlock: composeClassParts(titleBlockParts),
    summary: composeClassParts(summaryParts),
    controls: composeClassParts(controlsParts),
    toggle: composeClassParts(toggleParts),
    actionsWrap: composeClassParts(actionsWrapParts),
    actionsGrid: composeClassParts(actionsGridParts),
    estimatedTime: composeClassParts(estimatedTimeParts),
    canvasWrap: composeClassParts(canvasWrapParts),
    canvasInner: composeClassParts(canvasInnerParts),
    dialog: {
        backdrop: composeClassParts(dialogBackdropParts),
        panel: composeClassParts(dialogPanelParts),
        handle: '',
        actions: composeClassParts(dialogActionsParts),
    },
} as const;
