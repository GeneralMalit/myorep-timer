import { composeClassParts } from '@/layout';

const shellParts = {
    layout: 'relative mx-auto flex w-full select-none items-center justify-center',
    spacing: 'px-1 sm:px-4',
    size: 'max-w-[28rem]',
};

const shellWithUpDownParts = {
    size: 'min-h-[16rem]',
};

const svgParts = {
    layout: 'aspect-square w-full transform -rotate-90 overflow-visible',
    size: 'max-w-[28rem]',
};

const upDownTextParts = {
    spacing: 'px-4',
    typography: 'text-4xl font-black tracking-tighter sm:text-6xl',
    motion: 'transition-all duration-300',
};

const infoWrapParts = {
    layout: 'flex max-w-full flex-col items-center',
    spacing: 'px-5 sm:px-8',
};

const subTextParts = {
    spacing: 'mt-2',
    size: 'max-w-[18rem] sm:max-w-none',
    typography: 'text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground sm:text-xl sm:tracking-wide',
};

export const concentricTimerDesktopLayout = {
    size: 450,
    strokeWidth: 12,
    shell: composeClassParts(shellParts),
    shellWithUpDown: composeClassParts(shellWithUpDownParts),
    svg: composeClassParts(svgParts),
    upDownText: composeClassParts(upDownTextParts),
    infoWrap: composeClassParts(infoWrapParts),
    subText: composeClassParts(subTextParts),
} as const;
