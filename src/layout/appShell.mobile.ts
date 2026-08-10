import { composeClassParts } from '@/layout';

const mainShellParts = {
    base: 'relative overflow-x-hidden overflow-y-auto scroll-contain-y',
    spacing: 'px-[max(1rem,var(--safe-left))] pb-[calc(var(--safe-bottom)+1rem)] pt-[calc(var(--safe-top)+0.75rem)]',
    motion: 'transition-[margin] duration-300',
    viewport: 'h-dvh-safe',
};

const contentShellParts = {
    base: 'relative z-10 flex flex-col',
    viewport: 'min-h-full',
};

const mobileHeaderParts = {
    layout: 'mb-4 flex items-center justify-between gap-3',
    surface: 'rounded-[1.75rem] border border-border/60 bg-card/80',
    spacing: 'px-4 py-3',
    effects: 'shadow-lg',
    responsive: 'md:hidden',
};

const workoutSetupShellParts = {
    base: 'w-full',
    motion: 'animate-in fade-in slide-in-from-bottom-4 duration-700',
    spacing: 'space-y-4 px-1 py-2',
};

const timerScreenShellParts = {
    base: 'flex w-full max-w-5xl flex-1 flex-col items-center justify-start',
    motion: 'animate-in fade-in zoom-in-95 duration-500',
    spacing: 'space-y-4 px-1 py-2 pb-[calc(var(--safe-bottom)+1rem)]',
};

const footerShellParts = {
    base: 'w-full text-center',
    border: 'border-t border-border/50',
    spacing: 'mt-5 px-2 py-4',
    effects: 'opacity-50 transition-opacity hover:opacity-100',
};

const footerStatusRowParts = {
    layout: 'flex justify-center',
    spacing: 'mt-2',
};

const dialogOverlayParts = {
    position: 'fixed inset-0 z-[120]',
    layout: 'flex items-end justify-center',
    surface: 'bg-black/75',
    spacing: 'px-[max(1rem,var(--safe-left))] py-[max(1rem,var(--safe-bottom))]',
    effects: 'backdrop-blur-sm',
    responsive: 'sm:items-center sm:px-4 sm:py-6',
};

const dialogPanelParts = {
    size: 'max-h-[calc(var(--viewport-dynamic)-var(--safe-top)-var(--safe-bottom)-1rem)] w-full max-w-md',
    layout: 'overflow-y-auto scroll-contain-y',
    surface: 'rounded-[28px] border border-border/60 bg-background/95',
    spacing: 'p-5 sm:p-6',
    effects: 'shadow-[0_24px_90px_rgba(0,0,0,0.45)]',
};

export const appShellMobile = {
    mainShell: composeClassParts(mainShellParts),
    contentShell: composeClassParts(contentShellParts),
    mobileHeader: composeClassParts(mobileHeaderParts),
    workoutSetupShell: composeClassParts(workoutSetupShellParts),
    timerScreenShell: composeClassParts(timerScreenShellParts),
    footerShell: composeClassParts(footerShellParts),
    footerStatusRow: composeClassParts(footerStatusRowParts),
    dialogOverlay: composeClassParts(dialogOverlayParts),
    dialogPanel: composeClassParts(dialogPanelParts),
} as const;
