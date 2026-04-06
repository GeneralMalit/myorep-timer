import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
    cleanup();
});

global.performance = {
    ...global.performance,
    now: () => Date.now(),
};

class MockWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    url: string;

    constructor(url: string) {
        this.url = url;
    }

    postMessage(data: unknown) {
        if (this.onmessage) {
            setTimeout(() => {
                if (!this.onmessage) {
                    return;
                }

                const incoming = data as { action?: string };
                if (incoming?.action === 'start') {
                    this.onmessage(new MessageEvent('message', { data: { action: 'tick', elapsed: 100 } }));
                    return;
                }

                this.onmessage(new MessageEvent('message', { data }));
            }, 0);
        }
    }

    terminate() {}
    addEventListener() {}
    removeEventListener() {}
}

global.Worker = MockWorker as unknown as typeof Worker;

const localStorageMock = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    length: 0,
    key: () => null,
};

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
});

const mockAudioContext = {
    state: 'running',
    resume: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
    close: () => Promise.resolve(),
    createOscillator: () => ({
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {},
        frequency: { value: 0 },
    }),
    createGain: () => ({
        connect: () => {},
        disconnect: () => {},
        gain: { value: 1, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
    }),
    destination: {},
};

global.AudioContext = (() => mockAudioContext) as unknown as typeof AudioContext;
(global as unknown as Record<string, unknown>).webkitAudioContext = global.AudioContext;

class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
        return [];
    }

    root = null;
    rootMargin = '';
    thresholds: number[] = [];
}

class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    }),
});

global.requestAnimationFrame = (callback: FrameRequestCallback) => {
    return setTimeout(callback, 16) as unknown as number;
};

global.cancelAnimationFrame = (id: number) => {
    clearTimeout(id);
};

(global as unknown as Record<string, unknown>).__APP_VERSION__ = '9.9.9-test';

HTMLCanvasElement.prototype.getContext = (() => ({
    fillStyle: '',
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    fillRect: () => {},
    fillText: () => {},
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;
