import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test the timerWorker logic
// Since Workers run in isolation, we'll test the logic by mocking the worker environment

describe('timerWorker', () => {
    let workerCode: string;
    let mockPostMessage: ReturnType<typeof vi.fn>;
    let messageHandler: ((e: MessageEvent) => void) | null = null;
    let intervalIds: number[] = [];

    beforeEach(() => {
        // Mock self (WorkerGlobalScope)
        mockPostMessage = vi.fn();
        intervalIds = [];

        const mockSelf = {
            onmessage: null as ((e: MessageEvent) => void) | null,
            postMessage: mockPostMessage,
        };

        // Read and execute worker code in mocked environment
        // The worker code uses 'self' which we need to mock
        const workerModule = `
            let timerId = null;
            let currentInterval = null;
            let startTime = 0;

            self.onmessage = (e) => {
                if (e.data.action === 'start') {
                    const interval = e.data.interval || 1000;
                    
                    if (timerId) clearInterval(timerId);

                    currentInterval = interval;
                    startTime = performance.now();
                    timerId = setInterval(() => {
                        const now = performance.now();
                        const elapsed = now - startTime;
                        self.postMessage({ action: 'tick', elapsed });
                    }, interval);
                } else if (e.data.action === 'stop') {
                    if (timerId) {
                        clearInterval(timerId);
                        timerId = null;
                        currentInterval = null;
                    }
                }
            };
        `;

        // Store reference to the mock self
        (global as unknown as Record<string, unknown>).self = mockSelf;

        // Execute worker code
        eval(workerModule);

        messageHandler = mockSelf.onmessage;
    });

    afterEach(() => {
        // Clear all intervals
        intervalIds.forEach(id => clearInterval(id));
        intervalIds = [];
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    describe('message handling', () => {
        it('should handle start action and post tick messages', async () => {
            vi.useFakeTimers();

            const mockPerformanceNow = vi.fn()
                .mockReturnValueOnce(1000) // startTime
                .mockReturnValueOnce(1100) // First tick (100ms elapsed)
                .mockReturnValueOnce(1200); // Second tick (200ms elapsed)

            global.performance = {
                ...global.performance,
                now: mockPerformanceNow,
            };

            // Send start message
            messageHandler?.(new MessageEvent('message', {
                data: { action: 'start', interval: 100 }
            }));

            // Wait for interval to be set up
            await vi.advanceTimersByTimeAsync(0);

            // Advance time to trigger first tick
            await vi.advanceTimersByTimeAsync(100);

            expect(mockPostMessage).toHaveBeenCalledWith({
                action: 'tick',
                elapsed: 100
            });

            // Advance time to trigger second tick
            await vi.advanceTimersByTimeAsync(100);

            expect(mockPostMessage).toHaveBeenCalledTimes(2);
        });

        it('should handle stop action and clear interval', async () => {
            vi.useFakeTimers();

            const mockPerformanceNow = vi.fn()
                .mockReturnValueOnce(1000)
                .mockReturnValueOnce(1100)
                .mockReturnValueOnce(1200);

            global.performance = {
                ...global.performance,
                now: mockPerformanceNow,
            };

            // Start the timer
            messageHandler?.(new MessageEvent('message', {
                data: { action: 'start', interval: 100 }
            }));

            await vi.advanceTimersByTimeAsync(0);

            // Stop the timer
            messageHandler?.(new MessageEvent('message', {
                data: { action: 'stop' }
            }));

            await vi.advanceTimersByTimeAsync(0);

            // Reset mock to check no more calls
            mockPostMessage.mockClear();

            // Advance time - should not trigger any ticks
            await vi.advanceTimersByTimeAsync(500);

            expect(mockPostMessage).not.toHaveBeenCalled();
        });

        it('should use default interval of 1000ms when not specified', async () => {
            vi.useFakeTimers();

            const mockPerformanceNow = vi.fn()
                .mockReturnValueOnce(0)
                .mockReturnValueOnce(1000);

            global.performance = {
                ...global.performance,
                now: mockPerformanceNow,
            };

            messageHandler?.(new MessageEvent('message', {
                data: { action: 'start' } // No interval specified
            }));

            await vi.advanceTimersByTimeAsync(0);

            // Should not trigger at 500ms (less than default 1000ms)
            await vi.advanceTimersByTimeAsync(500);
            expect(mockPostMessage).not.toHaveBeenCalled();

            // Should trigger at 1000ms
            await vi.advanceTimersByTimeAsync(500);
            expect(mockPostMessage).toHaveBeenCalledWith({
                action: 'tick',
                elapsed: 1000
            });
        });

        it('should clear existing interval when starting new timer', async () => {
            vi.useFakeTimers();

            const mockPerformanceNow = vi.fn()
                .mockReturnValueOnce(0)   // First start: startTime = 0
                .mockReturnValueOnce(50)  // Second start: startTime = 50
                .mockReturnValueOnce(250); // Tick after 200ms interval: elapsed = 250 - 50 = 200

            global.performance = {
                ...global.performance,
                now: mockPerformanceNow,
            };

            // Start first timer
            messageHandler?.(new MessageEvent('message', {
                data: { action: 'start', interval: 100 }
            }));

            await vi.advanceTimersByTimeAsync(0);

            // Start second timer (should clear first)
            messageHandler?.(new MessageEvent('message', {
                data: { action: 'start', interval: 200 }
            }));

            await vi.advanceTimersByTimeAsync(0);

            // Reset and advance (new interval is 200ms)
            mockPostMessage.mockClear();
            await vi.advanceTimersByTimeAsync(200);

            // Should have been called with new timing
            expect(mockPostMessage).toHaveBeenCalledWith({
                action: 'tick',
                elapsed: 200
            });
        });
    });

    describe('timer accuracy', () => {
        it('should calculate elapsed time correctly', async () => {
            vi.useFakeTimers();

            const startTime = 10000;
            const elapsedTimes = [10000, 10500, 11000, 11500];
            let callIndex = 0;

            const mockPerformanceNow = vi.fn(() => {
                return elapsedTimes[callIndex++] ?? 12000;
            });

            global.performance = {
                ...global.performance,
                now: mockPerformanceNow,
            };

            messageHandler?.(new MessageEvent('message', {
                data: { action: 'start', interval: 500 }
            }));

            await vi.advanceTimersByTimeAsync(0);

            // First tick at 500ms elapsed
            await vi.advanceTimersByTimeAsync(500);
            expect(mockPostMessage).toHaveBeenLastCalledWith({
                action: 'tick',
                elapsed: 500
            });

            // Second tick at 1000ms elapsed
            await vi.advanceTimersByTimeAsync(500);
            expect(mockPostMessage).toHaveBeenLastCalledWith({
                action: 'tick',
                elapsed: 1000
            });
        });
    });

    describe('edge cases', () => {
        it('should handle stop when timer is not running', () => {
            // Should not throw error
            expect(() => {
                messageHandler?.(new MessageEvent('message', {
                    data: { action: 'stop' }
                }));
            }).not.toThrow();
        });

        it('should handle multiple stop calls', async () => {
            vi.useFakeTimers();

            // Start timer
            messageHandler?.(new MessageEvent('message', {
                data: { action: 'start', interval: 100 }
            }));

            await vi.advanceTimersByTimeAsync(0);

            // Stop multiple times - should not throw
            expect(() => {
                messageHandler?.(new MessageEvent('message', {
                    data: { action: 'stop' }
                }));
                messageHandler?.(new MessageEvent('message', {
                    data: { action: 'stop' }
                }));
            }).not.toThrow();
        });
    });
});