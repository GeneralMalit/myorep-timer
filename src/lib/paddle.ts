type PaddleEnvironment = 'sandbox' | 'production';

interface PaddleEvent {
    name?: string;
}

interface PaddleInstance {
    Environment?: {
        set: (environment: PaddleEnvironment) => void;
    };
    Initialize?: (options: {
        token: string;
        checkout?: {
            settings?: {
                successUrl?: string;
            };
        };
        eventCallback?: (event: PaddleEvent) => void;
    }) => void;
}

const getPaddleClientToken = (): string | null => {
    const value = import.meta.env.VITE_PADDLE_CLIENT_TOKEN?.trim();
    return value || null;
};

const getPaddleEnvironment = (): PaddleEnvironment => {
    return import.meta.env.VITE_PADDLE_ENV === 'sandbox' ? 'sandbox' : 'production';
};

const buildPaddleReturnUrl = (currentUrl: string, status: 'success' | 'cancel'): string => {
    const url = new URL(currentUrl);
    url.searchParams.delete('_ptxn');
    url.searchParams.set('billing', status);
    return url.toString();
};

const redirectToBillingState = (status: 'success' | 'cancel'): void => {
    window.location.replace(buildPaddleReturnUrl(window.location.href, status));
};

export const initializePaddleCheckoutFromQuery = async (): Promise<boolean> => {
    if (typeof window === 'undefined') {
        return false;
    }

    const url = new URL(window.location.href);
    if (!url.searchParams.get('_ptxn')) {
        return false;
    }

    const token = getPaddleClientToken();
    if (!token) {
        throw new Error('Missing VITE_PADDLE_CLIENT_TOKEN for Paddle checkout.');
    }

    const { initializePaddle } = await import('@paddle/paddle-js');
    const paddle = await initializePaddle({
        token,
    }) as PaddleInstance | undefined;

    if (!paddle) {
        throw new Error('Could not initialize Paddle checkout.');
    }

    if (getPaddleEnvironment() === 'sandbox') {
        paddle.Environment?.set('sandbox');
    }

    let completed = false;
    paddle.Initialize?.({
        token,
        checkout: {
            settings: {
                successUrl: buildPaddleReturnUrl(window.location.href, 'success'),
            },
        },
        eventCallback: (event) => {
            if (event.name === 'checkout.completed') {
                completed = true;
                return;
            }

            if (event.name === 'checkout.closed' && !completed) {
                redirectToBillingState('cancel');
            }
        },
    });

    return true;
};
