import { describe, expect, it } from 'vitest';
import { getReadableForeground } from '@/utils/colors';

describe('getReadableForeground', () => {
    it('uses luminance rather than hex magnitude for saturated accents', () => {
        expect(getReadableForeground('#00ff00')).toBe('#0e1013');
        expect(getReadableForeground('#0000ff')).toBe('#ffffff');
    });

    it('keeps dark and light custom accents readable, including short hex values', () => {
        expect(getReadableForeground('#111')).toBe('#ffffff');
        expect(getReadableForeground('#eee')).toBe('#0e1013');
    });
});
