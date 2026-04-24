import { composeClassParts } from '@/layout';

const shellParts = {
    layout: 'relative mx-auto flex w-full select-none items-center justify-center',
    spacing: 'px-1',
    size: 'max-w-[22rem]',
};

const shellWithUpDownParts = {
    size: 'min-h-[11rem]',
};

const svgParts = {
    layout: 'aspect-square w-full transform -rotate-90 overflow-visible',
    size: 'max-w-[22rem]',
};

const upDownTextParts = {
    spacing: 'px-3',
    typography: 'text-3xl font-black tracking-tighter',
    motion: 'transition-all duration-300',
};

const infoWrapParts = {
    layout: 'flex max-w-full flex-col items-center',
    spacing: 'px-3',
};

const subTextParts = {
    spacing: 'mt-2',
    size: 'max-w-[16rem]',
    typography: 'text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground',
};

export const concentricTimerMobileLayout = {
    size: 360,
    strokeWidth: 10,
    shell: composeClassParts(shellParts),
    shellWithUpDown: composeClassParts(shellWithUpDownParts),
    svg: composeClassParts(svgParts),
    upDownText: composeClassParts(upDownTextParts),
    infoWrap: composeClassParts(infoWrapParts),
    subText: composeClassParts(subTextParts),
} as const;
