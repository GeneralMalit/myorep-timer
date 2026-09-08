import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MockUtteranceShape {
    text: string;
    lang: string;
    volume: number;
    rate: number;
    pitch: number;
    voice: SpeechSynthesisVoice | null;
    onerror: ((event: SpeechSynthesisErrorEvent) => void) | null;
}

interface AudioHarness {
    ctor: ReturnType<typeof vi.fn>;
    context: Record<string, unknown>;
    oscillators: Array<Record<string, unknown>>;
    gains: Array<Record<string, unknown>>;
    sources: Array<Record<string, unknown>>;
}

const originalSpeechDescriptor = Object.getOwnPropertyDescriptor(window, 'speechSynthesis');
const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
const originalAudioContext = window.AudioContext;
const originalWebkitAudioContext = (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

const installUtterance = () => {
    class MockUtterance implements MockUtteranceShape {
        text: string;
        lang = '';
        volume = 1;
        rate = 1;
        pitch = 1;
        voice: SpeechSynthesisVoice | null = null;
        onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;

        constructor(text: string) {
            this.text = text;
        }
    }

    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance as unknown as typeof SpeechSynthesisUtterance);
};

const installSpeech = (voices: SpeechSynthesisVoice[] = []) => {
    const speech = {
        speak: vi.fn(),
        cancel: vi.fn(),
        getVoices: vi.fn(() => voices),
        speaking: false,
        pending: false,
        onvoiceschanged: null,
    };
    Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        writable: true,
        value: speech,
    });
    return speech;
};

const removeSpeech = () => {
    Reflect.deleteProperty(window, 'speechSynthesis');
};

const setVisibility = (hidden: boolean, visibilityState: DocumentVisibilityState = hidden ? 'hidden' : 'visible') => {
    Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => hidden,
    });
    Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => visibilityState,
    });
};

const createAudioHarness = (options: {
    state?: AudioContextState;
    currentTime?: number;
    resume?: () => Promise<void>;
    warmupThrows?: boolean;
    cleanupThrows?: boolean;
} = {}): AudioHarness => {
    const oscillators: Array<Record<string, unknown>> = [];
    const gains: Array<Record<string, unknown>> = [];
    const sources: Array<Record<string, unknown>> = [];

    const context: Record<string, unknown> = {
        state: options.state ?? 'running',
        currentTime: options.currentTime ?? 10,
        destination: {},
        resume: vi.fn(options.resume ?? (() => Promise.resolve())),
        createBuffer: vi.fn(() => {
            if (options.warmupThrows) {
                throw new Error('buffer unavailable');
            }
            return { duration: 0 };
        }),
        createBufferSource: vi.fn(() => {
            const source = {
                buffer: null,
                connect: vi.fn(),
                start: vi.fn(),
            };
            sources.push(source);
            return source;
        }),
        createOscillator: vi.fn(() => {
            let stopCount = 0;
            const oscillator = {
                type: 'sine' as OscillatorType,
                frequency: {
                    setValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                },
                connect: vi.fn(),
                disconnect: vi.fn(() => {
                    if (options.cleanupThrows) {
                        throw new Error('disconnect failed');
                    }
                }),
                start: vi.fn(),
                stop: vi.fn(() => {
                    stopCount += 1;
                    if (options.cleanupThrows && stopCount > 1) {
                        throw new Error('already stopped');
                    }
                }),
            };
            oscillators.push(oscillator);
            return oscillator;
        }),
        createGain: vi.fn(() => {
            const gain = {
                gain: {
                    value: 1,
                    setValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                    linearRampToValueAtTime: vi.fn(),
                },
                connect: vi.fn(),
                disconnect: vi.fn(() => {
                    if (options.cleanupThrows) {
                        throw new Error('disconnect failed');
                    }
                }),
            };
            gains.push(gain);
            return gain;
        }),
    };

    const ctor = vi.fn(function MockAudioContext(this: Record<string, unknown>) {
        Object.assign(this, context);
    });

    return { ctor, context, oscillators, gains, sources };
};

const installAudioCtor = (ctor: unknown, useWebkit = false) => {
    Object.defineProperty(window, 'AudioContext', {
        configurable: true,
        writable: true,
        value: useWebkit ? undefined : ctor,
    });
    Object.defineProperty(window, 'webkitAudioContext', {
        configurable: true,
        writable: true,
        value: useWebkit ? ctor : undefined,
    });
};

const loadAudioModule = async () => {
    vi.resetModules();
    return import('@/utils/audioEngine');
};

beforeEach(() => {
    setVisibility(false);
    installUtterance();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();

    if (originalSpeechDescriptor) {
        Object.defineProperty(window, 'speechSynthesis', originalSpeechDescriptor);
    } else {
        Reflect.deleteProperty(window, 'speechSynthesis');
    }
    if (originalHiddenDescriptor) {
        Object.defineProperty(document, 'hidden', originalHiddenDescriptor);
    }
    if (originalVisibilityDescriptor) {
        Object.defineProperty(document, 'visibilityState', originalVisibilityDescriptor);
    }
    Object.defineProperty(window, 'AudioContext', {
        configurable: true,
        writable: true,
        value: originalAudioContext,
    });
    Object.defineProperty(window, 'webkitAudioContext', {
        configurable: true,
        writable: true,
        value: originalWebkitAudioContext,
    });
});

describe('AudioEngine browser API branches', () => {
    it('does nothing when browser speech and audio APIs are unavailable', async () => {
        removeSpeech();
        installAudioCtor(undefined);
        const { AudioEngine } = await loadAudioModule();
        const engine = new AudioEngine();

        expect(() => engine.init()).not.toThrow();
        expect(() => engine.playTick()).not.toThrow();
        expect(() => engine.scheduleTickSequence('woodblock', [0])).not.toThrow();
        expect(() => engine.cancelSpeech()).not.toThrow();
        expect(() => engine.speak('Ready')).not.toThrow();
        expect(() => engine.speakWithTones('Ready')).not.toThrow();
        expect(() => (engine as unknown as { scheduleTickAt: (type: string, time: number) => void })
            .scheduleTickAt('woodblock', 0)).toThrow('AudioContext is not initialized.');
    });

    it('uses webkit audio fallback, warms once, and unlocks without speech', async () => {
        removeSpeech();
        const harness = createAudioHarness();
        installAudioCtor(harness.ctor, true);
        const { AudioEngine } = await loadAudioModule();
        const engine = new AudioEngine();

        engine.init();
        engine.init();

        expect(harness.ctor).toHaveBeenCalledTimes(1);
        expect(harness.context.createBuffer).toHaveBeenCalledTimes(1);
        expect(harness.sources[0].start).toHaveBeenCalledWith(0);
    });

    it('returns early while hidden and treats missing document as visible', async () => {
        const speech = installSpeech();
        const harness = createAudioHarness();
        installAudioCtor(harness.ctor);
        setVisibility(false, 'hidden');
        const { AudioEngine } = await loadAudioModule();
        const engine = new AudioEngine();

        engine.init();
        engine.playTick();
        engine.scheduleTickSequence('woodblock', [0]);
        engine.speak('hidden');
        expect(harness.ctor).not.toHaveBeenCalled();
        expect(speech.speak).not.toHaveBeenCalled();

        const currentDocument = document;
        vi.stubGlobal('document', undefined);
        engine.init();
        expect(harness.ctor).toHaveBeenCalledTimes(1);
        vi.stubGlobal('document', currentDocument);
    });

    it('logs constructor, resume, and warmup failures without throwing', async () => {
        removeSpeech();
        const throwingCtor = vi.fn(function ThrowingAudioContext() {
            throw new Error('constructor failed');
        });
        installAudioCtor(throwingCtor);
        const { AudioEngine } = await loadAudioModule();
        const failedEngine = new AudioEngine();
        expect(() => failedEngine.init()).not.toThrow();
        expect(console.error).toHaveBeenCalledWith(
            '[AudioEngine] AudioContext failed to initialize:',
            expect.any(Error),
        );

        const harness = createAudioHarness({
            state: 'suspended',
            resume: () => Promise.reject(new Error('resume failed')),
            warmupThrows: true,
        });
        installAudioCtor(harness.ctor);
        const engine = new AudioEngine();
        engine.init();
        await Promise.resolve();
        await Promise.resolve();

        expect(console.error).toHaveBeenCalledWith('[AudioEngine] Audio warmup failed:', expect.any(Error));
        expect(console.error).toHaveBeenCalledWith('[AudioEngine] AudioContext resume failed:', expect.any(Error));
    });

    it('schedules every tick timbre and ignores invalid sequence offsets', async () => {
        removeSpeech();
        const harness = createAudioHarness({ currentTime: 20 });
        installAudioCtor(harness.ctor);
        const { AudioEngine } = await loadAudioModule();
        const engine = new AudioEngine();

        for (const type of ['woodblock', 'mechanical', 'electronic', 'low-thud', 'unknown']) {
            engine.playTick(type);
        }
        engine.scheduleTickSequence('mechanical', [Number.NaN, -1, Number.POSITIVE_INFINITY, 0, 1.5]);

        expect(harness.oscillators.map((oscillator) => oscillator.type)).toEqual([
            'sine',
            'triangle',
            'square',
            'sine',
            'sine',
            'triangle',
            'triangle',
        ]);
        const scheduled = harness.oscillators.slice(-2);
        expect(scheduled[0].start).toHaveBeenCalledWith(20);
        expect(scheduled[1].start).toHaveBeenCalledWith(21.5);
        expect((harness.gains[2].gain as Record<string, ReturnType<typeof vi.fn>>).linearRampToValueAtTime).toHaveBeenCalled();
    });

    it('cancels scheduled nodes with best-effort cleanup when browser nodes throw', async () => {
        removeSpeech();
        const harness = createAudioHarness({ cleanupThrows: true });
        installAudioCtor(harness.ctor);
        const { AudioEngine } = await loadAudioModule();
        const engine = new AudioEngine();

        engine.scheduleTickSequence('woodblock', [0]);
        expect(() => engine.cancelScheduledTicks()).not.toThrow();
        expect(() => engine.cancelScheduledTicks()).not.toThrow();
        expect(harness.oscillators[0].stop).toHaveBeenCalledTimes(2);
        expect(harness.oscillators[0].disconnect).toHaveBeenCalledTimes(1);
    });

    it('selects preferred and fallback voices and installs the voice-change callback', async () => {
        const preferred = { name: 'Microsoft Aria Online', lang: 'EN-US' } as SpeechSynthesisVoice;
        const speech = installSpeech([preferred]);
        const harness = createAudioHarness();
        installAudioCtor(harness.ctor);
        const { AudioEngine } = await loadAudioModule();
        const preferredEngine = new AudioEngine();

        expect(speech.onvoiceschanged).toEqual(expect.any(Function));
        preferredEngine.speak('Preferred');
        const preferredUtterance = speech.speak.mock.calls.at(-1)?.[0] as unknown as MockUtteranceShape;
        expect(preferredUtterance.voice).toBe(preferred);
        expect(preferredUtterance.lang).toBe('EN-US');

        const fallback = { name: 'Regional English', lang: 'en-GB' } as SpeechSynthesisVoice;
        const fallbackSpeech = installSpeech([
            { name: 'Voix', lang: 'fr-FR' } as SpeechSynthesisVoice,
            fallback,
        ]);
        const fallbackEngine = new AudioEngine();
        fallbackEngine.speak('Fallback');
        const fallbackUtterance = fallbackSpeech.speak.mock.calls.at(-1)?.[0] as unknown as MockUtteranceShape;
        expect(fallbackUtterance.voice).toBe(fallback);

        const firstVoice = { name: 'Voix', lang: '' } as SpeechSynthesisVoice;
        const firstSpeech = installSpeech([firstVoice]);
        const firstEngine = new AudioEngine();
        firstEngine.speak('First');
        const firstUtterance = firstSpeech.speak.mock.calls.at(-1)?.[0] as unknown as MockUtteranceShape;
        expect(firstUtterance.voice).toBe(firstVoice);
        expect(firstUtterance.lang).toBe('en-US');
    });

    it('retries empty voice lists and sets mobile versus desktop speech rates', async () => {
        const voice = { name: 'Samantha', lang: 'en-US' } as SpeechSynthesisVoice;
        const speech = installSpeech([]);
        const harness = createAudioHarness();
        installAudioCtor(harness.ctor);
        const { AudioEngine } = await loadAudioModule();
        const engine = new AudioEngine();
        (engine as unknown as { unlocked: boolean }).unlocked = true;
        speech.getVoices.mockReturnValue([voice]);
        vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone)');

        engine.speak(3);
        const mobileUtterance = speech.speak.mock.calls.at(-1)?.[0] as unknown as MockUtteranceShape;
        expect(mobileUtterance.text).toBe('3');
        expect(mobileUtterance.rate).toBe(1.05);

        (engine as unknown as { selectedVoice: SpeechSynthesisVoice | null }).selectedVoice = null;
        vi.restoreAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Desktop');
        engine.speak('Desktop');
        const desktopUtterance = speech.speak.mock.calls.at(-1)?.[0] as unknown as MockUtteranceShape;
        expect(desktopUtterance.rate).toBe(1.15);
    });

    it('flushes queued speech and suppresses expected cancellation errors', async () => {
        const voice = { name: 'Google US English', lang: 'en-US' } as SpeechSynthesisVoice;
        const speech = installSpeech([voice]);
        speech.speaking = true;
        const harness = createAudioHarness();
        installAudioCtor(harness.ctor);
        const { AudioEngine } = await loadAudioModule();
        const engine = new AudioEngine();

        engine.speak('One');
        expect(speech.cancel).toHaveBeenCalled();
        let utterance = speech.speak.mock.calls.at(-1)?.[0] as unknown as MockUtteranceShape;
        utterance.onerror?.({ error: 'canceled' } as SpeechSynthesisErrorEvent);
        utterance.onerror?.({ error: 'interrupted' } as SpeechSynthesisErrorEvent);
        expect(console.error).not.toHaveBeenCalledWith('[AudioEngine] Speech error:', expect.anything());

        utterance.onerror?.({ error: 'synthesis-failed' } as SpeechSynthesisErrorEvent);
        expect(console.error).toHaveBeenCalledWith('[AudioEngine] Speech error:', expect.anything());

        speech.speaking = false;
        speech.pending = true;
        engine.speak('Two');
        utterance = speech.speak.mock.calls.at(-1)?.[0] as unknown as MockUtteranceShape;
        expect(utterance.text).toBe('Two');
    });

    it('contains speech cancellation and dispatch failures', async () => {
        const speech = installSpeech([]);
        speech.cancel.mockImplementation(() => {
            throw new Error('cancel failed');
        });
        speech.speak.mockImplementation(() => {
            throw new Error('speak failed');
        });
        const harness = createAudioHarness();
        installAudioCtor(harness.ctor);
        const { AudioEngine } = await loadAudioModule();
        const engine = new AudioEngine();

        expect(() => engine.cancelSpeech()).not.toThrow();
        expect(console.error).toHaveBeenCalledWith('[AudioEngine] Speech cancellation failed:', expect.any(Error));
        speech.cancel.mockImplementation(() => {});
        (engine as unknown as { unlocked: boolean }).unlocked = true;
        expect(() => engine.speak('Failure')).not.toThrow();
        expect(console.error).toHaveBeenCalledWith('[AudioEngine] Speech dispatch failed:', expect.any(Error));
    });

    it('handles an absent global window', async () => {
        removeSpeech();
        installAudioCtor(undefined);
        const { AudioEngine } = await loadAudioModule();
        const currentWindow = window;
        vi.stubGlobal('window', undefined);
        const engine = new AudioEngine();

        expect(() => engine.init()).not.toThrow();
        expect(() => engine.cancelSpeech()).not.toThrow();
        expect(() => engine.speak('server')).not.toThrow();
        vi.stubGlobal('window', currentWindow);
    });
});
