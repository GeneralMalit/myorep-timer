import { createHmac, timingSafeEqual } from 'node:crypto';
import type { BillingEnvironment } from '@/server/billingEnv';

const PADDLE_API_BASE = 'https://api.paddle.com';

export interface PaddleBillingUser {
    id: string;
    email: string | null;
}

export interface PaddleEntitlementProjection {
    userId: string;
    paddleCustomerId: string | null;
    paddleSubscriptionId: string;
    paddlePriceId: string | null;
    subscriptionStatus: string;
    active: boolean;
    currentPeriodEnd: string | null;
    occurredAt: string | null;
}

interface PaddleEnvelope<T> {
    data: T;
}

interface PaddleCustomer {
    id: string;
}

interface PaddleTransaction {
    id: string;
}

interface PaddlePortalSession {
    urls?: {
        general?: {
            overview?: string;
        };
    };
}

export interface PaddleSubscription {
    id: string;
    customer_id: string | null;
    status: string;
    next_billed_at: string | null;
    custom_data?: Record<string, unknown> | null;
    items?: Array<{
        price?: {
            id?: string | null;
        } | null;
    }> | null;
}

export interface PaddleWebhookEvent<T = unknown> {
    event_id: string;
    event_type: string;
    occurred_at: string;
    data: T;
}

const paddleRequest = async <T>(
    env: BillingEnvironment,
    path: string,
    init: RequestInit = {},
): Promise<T> => {
    const response = await fetch(`${PADDLE_API_BASE}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${env.paddleApiKey}`,
            'Content-Type': 'application/json',
            ...init.headers,
        },
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Paddle request failed with status ${response.status}.`);
    }

    const payload = await response.json() as PaddleEnvelope<T>;
    return payload.data;
};

export const buildPaddleHostedCheckoutUrl = (appUrl: string, transactionId: string): string => {
    const url = new URL(appUrl);
    url.searchParams.set('_ptxn', transactionId);
    return url.toString();
};

export const buildPaddleReturnUrl = (appUrl: string, status: 'success' | 'cancel' | 'portal'): string => {
    const url = new URL(appUrl);
    url.searchParams.delete('_ptxn');
    url.searchParams.set('billing', status);
    return url.toString();
};

export const createPaddleCustomer = async (
    env: BillingEnvironment,
    user: PaddleBillingUser,
): Promise<PaddleCustomer> => {
    return paddleRequest<PaddleCustomer>(env, '/customers', {
        method: 'POST',
        body: JSON.stringify({
            email: user.email ?? undefined,
            custom_data: {
                supabaseUserId: user.id,
            },
        }),
    });
};

export const createPaddleCheckoutTransaction = async (
    env: BillingEnvironment,
    params: {
        customerId: string;
        userId: string;
    },
): Promise<PaddleTransaction> => {
    return paddleRequest<PaddleTransaction>(env, '/transactions', {
        method: 'POST',
        body: JSON.stringify({
            items: [
                {
                    price_id: env.paddlePlusPriceId,
                    quantity: 1,
                },
            ],
            customer_id: params.customerId,
            collection_mode: 'automatic',
            custom_data: {
                supabaseUserId: params.userId,
            },
        }),
    });
};

export const createPaddleCustomerPortalSession = async (
    env: BillingEnvironment,
    customerId: string,
): Promise<PaddlePortalSession> => {
    return paddleRequest<PaddlePortalSession>(env, `/customers/${customerId}/portal-sessions`, {
        method: 'POST',
    });
};

const parsePaddleSignatureHeader = (signatureHeader: string): { timestamp: string; digest: string } => {
    const pairs = signatureHeader
        .split(';')
        .map((part) => part.trim())
        .map((part) => {
            const [key, value] = part.split('=', 2);
            return [key, value] as const;
        });

    const timestamp = pairs.find(([key]) => key === 'ts')?.[1];
    const digest = pairs.find(([key]) => key === 'h1')?.[1];
    if (!timestamp || !digest) {
        throw new Error('Malformed Paddle signature header.');
    }

    return { timestamp, digest };
};

export const verifyAndParsePaddleWebhookEvent = (
    rawBody: string,
    signatureHeader: string,
    notificationSecretKey: string,
): PaddleWebhookEvent => {
    const { timestamp, digest } = parsePaddleSignatureHeader(signatureHeader);
    const signedPayload = `${timestamp}:${rawBody}`;
    const computedDigest = createHmac('sha256', notificationSecretKey)
        .update(signedPayload, 'utf8')
        .digest('hex');

    const incomingBuffer = Buffer.from(digest, 'hex');
    const computedBuffer = Buffer.from(computedDigest, 'hex');
    if (
        incomingBuffer.length !== computedBuffer.length
        || !timingSafeEqual(incomingBuffer, computedBuffer)
    ) {
        throw new Error('Invalid Paddle signature.');
    }

    return JSON.parse(rawBody) as PaddleWebhookEvent;
};

export const isPaddleSubscriptionActive = (status: string): boolean => {
    return status === 'active' || status === 'trialing';
};

export const buildEntitlementProjectionFromPaddleSubscription = (
    subscription: PaddleSubscription,
    userId: string,
    occurredAt: string | null,
): PaddleEntitlementProjection => {
    const firstItem = subscription.items?.[0];
    const priceId = firstItem?.price?.id ?? null;

    return {
        userId,
        paddleCustomerId: subscription.customer_id ?? null,
        paddleSubscriptionId: subscription.id,
        paddlePriceId: priceId,
        subscriptionStatus: subscription.status,
        active: isPaddleSubscriptionActive(subscription.status),
        currentPeriodEnd: subscription.next_billed_at ?? null,
        occurredAt,
    };
};
