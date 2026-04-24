import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadAudioEngine = async () => {
    vi.resetModules();
    const module = await import('@/utils/audioEngine');
    return module.audioEngine;
};

describe('audioEngine', () => {
    beforeEach(() => {
        const speak = vi.fn();
        const cancel = vi.fn();
        const getVoices = vi.fn(() => [
            { name: 'Google US English', lang: 'en-US' } as SpeechSynthesisVoice,
        ]);

        Object.defineProperty(window, 'speechSynthesis', {
            configurable: true,
            writable: true,
            value: {
                speak,
                cancel,
                getVoices,
                speaking: false,
                pending: false,
                onvoiceschanged: null,
            } satisfies Partial<SpeechSynthesis>,
        });

        Object.defineProperty(document, 'hidden', {
            configurable: true,
            get: () => false,
        });

        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'visible',
        });

        (globalThis as typeof globalThis & { SpeechSynthesisUtterance: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance = class {
            text: string;
            lang = '';
            volume = 1;
            rate = 1;
            pitch = 1;
            voice: SpeechSynthesisVoice | null = null;
            onerror: ((event: Event) => void) | null = null;

            constructor(text: string) {
                this.text = text;
            }
        } as unknown as typeof SpeechSynthesisUtterance;
    });

    it('does not dispatch speech while the document is hidden', async () => {
        Object.defineProperty(document, 'hidden', {
            configurable: true,
            get: () => true,
        });
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'hidden',
        });

        const audioEngine = await loadAudioEngine();
        audioEngine.speak('Ready');

        expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
    });

    it('does not initialize audio context or ticks while the document is hidden', async () => {
        const audioContextSpy = vi.fn(() => ({
            state: 'running',
            resume: vi.fn(() => Promise.resolve()),
            createOscillator: vi.fn(),
            createGain: vi.fn(),
            destination: {},
        }));

        global.AudioContext = audioContextSpy as unknown as typeof AudioContext;
        (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext = global.AudioContext;

        Object.defineProperty(document, 'hidden', {
            configurable: true,
            get: () => true,
        });
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'hidden',
        });

        const audioEngine = await loadAudioEngine();
        audioEngine.playTick();

        expect(audioContextSpy).not.toHaveBeenCalled();
    });
});
