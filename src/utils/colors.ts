const linearChannel = (channel: number): number => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const DARK_LUMINANCE = 0.2126 * linearChannel(14) + 0.7152 * linearChannel(16) + 0.0722 * linearChannel(19);

/** Choose the higher-contrast foreground for a user-selected hex background. */
export const getReadableForeground = (color: string): '#0e1013' | '#ffffff' => {
    const hex = color.replace(/^#/, '');
    const expanded = hex.length === 3 ? hex.split('').map((digit) => digit + digit).join('') : hex;
    if (!/^[\da-f]{6}$/i.test(expanded)) return '#ffffff';
    const luminance = 0.2126 * linearChannel(parseInt(expanded.slice(0, 2), 16))
        + 0.7152 * linearChannel(parseInt(expanded.slice(2, 4), 16))
        + 0.0722 * linearChannel(parseInt(expanded.slice(4, 6), 16));
    return (luminance + 0.05) / (DARK_LUMINANCE + 0.05) >= 1.05 / (luminance + 0.05) ? '#0e1013' : '#ffffff';
};
