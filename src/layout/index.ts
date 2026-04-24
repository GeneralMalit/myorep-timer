export type ResponsiveLayout<T> = {
    mobile: T;
    desktop: T;
};

type ClassPart = string | false | null | undefined;
type ClassPartRecord = Record<string, ClassPart>;

export const getResponsiveLayout = <T>(isMobileViewport: boolean, mobileLayout: T, desktopLayout: T): T =>
    isMobileViewport ? mobileLayout : desktopLayout;

export const defineResponsiveLayout = <T>(mobile: T, desktop: T): ResponsiveLayout<T> => ({
    mobile,
    desktop,
});

export const composeClassParts = (...parts: Array<ClassPart | ClassPartRecord>): string =>
    parts
        .flatMap((part) => {
            if (!part) return [];
            if (typeof part === 'string') return [part];
            return Object.values(part).filter(Boolean) as string[];
        })
        .join(' ');
