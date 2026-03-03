import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';

// Cleanup after each test - using vitest's global afterEach
// The afterEach is provided globally when globals: true is set in vitest.config.js
if (typeof afterEach !== 'undefined') {
    afterEach(() => {
        cleanup();
    });
}

// Mock performance.now() for consistent timing tests
global.performance = {
    ...global.performance,
    now: () => Date.now(),
};

// Mock Worker for timerWorker tests
class MockWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    url: string;

    constructor(url: string) {
        this.url = url;
    }

    postMessage(data: unknown) {
        // Mock implementation - tests can override this
        if (this.onmessage) {
            // Simulate async behavior
            setTimeout(() => {
                if (this.onmessage) {
                    this.onmessage(new MessageEvent('message', { data }));
                }
            }, 0);
        }
    }

    terminate() {
        // Mock terminate
    }

    addEventListener() {
        // Mock addEventListener
    }

    removeEventListener() {
        // Mock removeEventListener
    }
}

global.Worker = MockWorker as unknown as typeof Worker;

// Mock localStorage for Zustand persist middleware
const localStorageMock = {
    getItem: () => null,
    setItem: () => { },
    removeItem: () => { },
    clear: () => { },
    length: 0,
    key: () => null,
};

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
});

// Mock AudioContext for audio engine
const mockAudioContext = {
    state: 'running',
    resume: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
    close: () => Promise.resolve(),
    createOscillator: () => ({
        connect: () => { },
        disconnect: () => { },
        start: () => { },
        stop: () => { },
        frequency: { value: 0 },
    }),
    createGain: () => ({
        connect: () => { },
        disconnect: () => { },
        gain: { value: 1, setValueAtTime: () => { }, exponentialRampToValueAtTime: () => { } },
    }),
    destination: {},
};

global.AudioContext = (() => mockAudioContext) as unknown as typeof AudioContext;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as unknown as Record<string, unknown>).webkitAudioContext = global.AudioContext;

// Mock IntersectionObserver
global.IntersectionObserver = (() => ({
    observe: () => { },
    unobserve: () => { },
    disconnect: () => { },
    takeRecords: () => [],
    root: null,
    rootMargin: '',
    thresholds: [],
}));

// Mock ResizeObserver
global.ResizeObserver = (() => ({
    observe: () => { },
    unobserve: () => { },
    disconnect: () => { },
}));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: () => { },
        removeListener: () => { },
        addEventListener: () => { },
        removeEventListener: () => { },
        dispatchEvent: () => false,
    }),
});

// Mock requestAnimationFrame
global.requestAnimationFrame = (callback: FrameRequestCallback) => {
    return setTimeout(callback, 16) as unknown as number;
};

global.cancelAnimationFrame = (id: number) => {
    clearTimeout(id);
};