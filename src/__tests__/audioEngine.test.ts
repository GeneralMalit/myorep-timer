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

    it('schedules metronome ticks on the audio context clock with stable offsets', async () => {
        const oscillatorStarts: number[] = [];
        const oscillatorStops: number[] = [];
        const gainEvents: Array<{ method: string; value: number; time: number }> = [];
        const oscillator = {
            type: 'sine' as OscillatorType,
            frequency: {
                setValueAtTime: vi.fn(),
                exponentialRampToValueAtTime: vi.fn(),
            },
            connect: vi.fn(),
            start: vi.fn((time: number) => oscillatorStarts.push(time)),
            stop: vi.fn((time: number) => oscillatorStops.push(time)),
        };
        const gain = {
            gain: {
                setValueAtTime: vi.fn((value: number, time: number) => gainEvents.push({ method: 'set', value, time })),
                exponentialRampToValueAtTime: vi.fn((value: number, time: number) => gainEvents.push({ method: 'exp', value, time })),
                linearRampToValueAtTime: vi.fn(),
            },
            connect: vi.fn(),
            disconnect: vi.fn(),
        };
        const audioContextSpy = vi.fn(function MockAudioContext(this: Record<string, unknown>) {
            Object.assign(this, {
                state: 'running',
                currentTime: 42,
                resume: vi.fn(() => Promise.resolve()),
                createOscillator: vi.fn(() => ({ ...oscillator, frequency: { ...oscillator.frequency } })),
                createGain: vi.fn(() => ({ ...gain, gain: { ...gain.gain } })),
                createBuffer: vi.fn(),
                createBufferSource: vi.fn(),
                destination: {},
            });
        });

        global.AudioContext = audioContextSpy as unknown as typeof AudioContext;
        (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext = global.AudioContext;

        const audioEngine = await loadAudioEngine();
        audioEngine.scheduleTickSequence('woodblock', [0, 1, 2]);

        expect(oscillatorStarts).toEqual([42, 43, 44]);
        expect(oscillatorStops).toEqual([42.05, 43.05, 44.05]);
        expect(gainEvents.filter((event) => event.method === 'set').map((event) => event.time)).toEqual([42, 43, 44]);
    });
});
