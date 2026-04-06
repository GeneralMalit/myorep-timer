let timerId: ReturnType<typeof setInterval> | null = null;
let startTime = 0;

interface WorkerMessage {
    action: 'start' | 'stop';
    interval?: number;
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    if (e.data.action === 'start') {
        const interval = e.data.interval || 1000;

        if (timerId) clearInterval(timerId);

        startTime = performance.now();
        timerId = setInterval(() => {
            const elapsed = performance.now() - startTime;
            self.postMessage({ action: 'tick', elapsed });
        }, interval);
    } else if (e.data.action === 'stop') {
        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }
    }
};

export {};
