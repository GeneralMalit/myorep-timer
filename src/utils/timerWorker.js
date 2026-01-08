let timerId = null;

self.onmessage = (e) => {
    if (e.data.action === 'start') {
        const interval = e.data.interval || 1000;
        if (timerId) clearInterval(timerId);
        timerId = setInterval(() => {
            self.postMessage({ action: 'tick' });
        }, interval);
    } else if (e.data.action === 'stop') {
        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }
    }
};
