let timerId: ReturnType<typeof setInterval> | null = null;
let startTime = 0;

interface WorkerMessage {
    action: 'start' | 'stop';
    interval?: number;
    runId?: number;
}

let activeRunId: number | undefined;

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    if (e.data.action === 'start') {
        const interval = e.data.interval || 1000;

        if (timerId) clearInterval(timerId);

        startTime = performance.now();
        activeRunId = e.data.runId;
        timerId = setInterval(() => {
            const now = performance.now();
            const elapsed = now - startTime;
            const sampleEpochMs = performance.timeOrigin + now;
            self.postMessage(activeRunId === undefined
                ? { action: 'tick', elapsed, sampleEpochMs }
                : { action: 'tick', elapsed, sampleEpochMs, runId: activeRunId });
        }, interval);
    } else if (e.data.action === 'stop') {
        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }
        activeRunId = undefined;
    }
};

export {};
