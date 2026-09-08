import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface WorkerCommand {
    action: 'start' | 'stop';
    interval?: number;
    runId?: number;
}

interface TickMessage {
    action: 'tick';
    elapsed: number;
    sampleEpochMs: number;
    runId?: number;
}

interface ScheduledInterval {
    callback: () => void;
    delay: number;
    active: boolean;
}

interface MockWorkerScope {
    onmessage: ((event: MessageEvent<WorkerCommand>) => void) | null;
    postMessage: ReturnType<typeof vi.fn>;
}

const TIME_ORIGIN = 1_700_000_000_000;

describe('timerWorker production module', () => {
    let nowMs: number;
    let nextIntervalId: number;
    let intervals: Map<number, ScheduledInterval>;
    let workerScope: MockWorkerScope;
    let setIntervalMock: ReturnType<typeof vi.fn>;
    let clearIntervalMock: ReturnType<typeof vi.fn>;

    const send = (data: WorkerCommand) => {
        if (!workerScope.onmessage) throw new Error('Worker message handler was not registered');
        workerScope.onmessage(new MessageEvent('message', { data }));
    };

    const getOnlyIntervalId = () => {
        expect(intervals.size).toBe(1);
        return [...intervals.keys()][0];
    };

    const fireInterval = (id: number) => {
        const interval = intervals.get(id);
        if (!interval?.active) return false;

        interval.callback();
        return true;
    };

    beforeEach(async () => {
        vi.resetModules();

        nowMs = 0;
        nextIntervalId = 1;
        intervals = new Map();
        workerScope = {
            onmessage: null,
            postMessage: vi.fn(),
        };

        setIntervalMock = vi.fn((callback: TimerHandler, delay?: number) => {
            if (typeof callback !== 'function') throw new Error('Expected an interval callback');

            const id = nextIntervalId++;
            intervals.set(id, {
                callback: () => callback(),
                delay: Number(delay),
                active: true,
            });
            return id;
        });
        clearIntervalMock = vi.fn((id: number) => {
            const interval = intervals.get(Number(id));
            if (interval) interval.active = false;
        });

        vi.stubGlobal('self', workerScope);
        vi.stubGlobal('performance', {
            now: vi.fn(() => nowMs),
            timeOrigin: TIME_ORIGIN,
        });
        vi.stubGlobal('setInterval', setIntervalMock);
        vi.stubGlobal('clearInterval', clearIntervalMock);

        await import('../utils/timerWorker');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('registers the real worker handler and posts an exact timestamped tick with its runId', () => {
        expect(workerScope.onmessage).toBeTypeOf('function');

        nowMs = 10_000;
        send({ action: 'start', interval: 125, runId: 23 });

        const intervalId = getOnlyIntervalId();
        expect(setIntervalMock).toHaveBeenCalledWith(expect.any(Function), 125);

        nowMs = 10_187.5;
        expect(fireInterval(intervalId)).toBe(true);
        expect(workerScope.postMessage).toHaveBeenCalledExactlyOnceWith({
            action: 'tick',
            elapsed: 187.5,
            sampleEpochMs: TIME_ORIGIN + 10_187.5,
            runId: 23,
        } satisfies TickMessage);
    });

    it('uses the default cadence and omits runId when the start command has none', () => {
        nowMs = 500;
        send({ action: 'start' });

        const intervalId = getOnlyIntervalId();
        expect(intervals.get(intervalId)?.delay).toBe(1000);

        nowMs = 1_500;
        fireInterval(intervalId);

        expect(workerScope.postMessage).toHaveBeenCalledWith({
            action: 'tick',
            elapsed: 1000,
            sampleEpochMs: TIME_ORIGIN + 1_500,
        } satisfies TickMessage);
    });

    it('invalidates the previous interval when a replacement run starts', () => {
        nowMs = 100;
        send({ action: 'start', interval: 50, runId: 1 });
        const firstIntervalId = getOnlyIntervalId();

        nowMs = 550;
        send({ action: 'start', interval: 200, runId: 2 });
        const secondIntervalId = nextIntervalId - 1;

        expect(clearIntervalMock).toHaveBeenCalledWith(firstIntervalId);
        expect(intervals.get(firstIntervalId)?.active).toBe(false);
        expect(intervals.get(secondIntervalId)?.active).toBe(true);

        nowMs = 750;
        expect(fireInterval(firstIntervalId)).toBe(false);
        expect(fireInterval(secondIntervalId)).toBe(true);
        expect(workerScope.postMessage).toHaveBeenCalledExactlyOnceWith({
            action: 'tick',
            elapsed: 200,
            sampleEpochMs: TIME_ORIGIN + 750,
            runId: 2,
        } satisfies TickMessage);
    });

    it('stops the active run, clears its runId, and leaves repeated stop commands harmless', () => {
        nowMs = 2_000;
        send({ action: 'start', interval: 50, runId: 73 });
        const intervalId = getOnlyIntervalId();
        const stoppedCallback = intervals.get(intervalId)?.callback;

        send({ action: 'stop' });
        expect(clearIntervalMock).toHaveBeenCalledExactlyOnceWith(intervalId);
        expect(intervals.get(intervalId)?.active).toBe(false);

        nowMs = 2_500;
        expect(fireInterval(intervalId)).toBe(false);
        expect(workerScope.postMessage).not.toHaveBeenCalled();
        expect(() => send({ action: 'stop' })).not.toThrow();
        expect(clearIntervalMock).toHaveBeenCalledTimes(1);

        // A cleared browser interval cannot fire. Calling the captured callback directly
        // makes the otherwise-private run metadata observable and proves stop reset it.
        stoppedCallback?.();
        expect(workerScope.postMessage).toHaveBeenCalledExactlyOnceWith({
            action: 'tick',
            elapsed: 500,
            sampleEpochMs: TIME_ORIGIN + 2_500,
        } satisfies TickMessage);
    });

    it('samples monotonic elapsed time instead of estimating it from callback cadence', () => {
        nowMs = 4_000;
        send({ action: 'start', interval: 50, runId: 9 });
        const intervalId = getOnlyIntervalId();

        for (const sample of [4_050, 4_175, 4_600]) {
            nowMs = sample;
            fireInterval(intervalId);
        }

        const ticks = workerScope.postMessage.mock.calls.map(([message]) => message as TickMessage);
        expect(ticks.map(({ elapsed }) => elapsed)).toEqual([50, 175, 600]);
        expect(ticks.map(({ sampleEpochMs }) => sampleEpochMs)).toEqual([
            TIME_ORIGIN + 4_050,
            TIME_ORIGIN + 4_175,
            TIME_ORIGIN + 4_600,
        ]);
        expect(ticks.map(({ runId }) => runId)).toEqual([9, 9, 9]);
    });
});
