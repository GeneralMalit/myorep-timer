import { getSupabaseClient } from '@/lib/supabase';
import { loadSupabaseAccountState } from '@/lib/supabaseAccount';
import type { AccountResolvedState } from '@/types/account';

interface BillingUrlResponse {
    url: string;
}

interface BillingApiErrorResponse {
    error?: string;
}

export interface BillingActionResult {
    ok: boolean;
    message: string;
}

const BILLING_API_BASE = '/api/paddle';

const parseBillingError = async (response: Response): Promise<string> => {
    try {
        const payload = await response.json() as BillingApiErrorResponse;
        if (payload.error?.trim()) {
            return payload.error;
        }
    } catch {
        // Fall through to the generic message below.
    }

    return `Billing request failed with status ${response.status}.`;
};

const requireAccessToken = async (): Promise<{ ok: true; token: string } | { ok: false; message: string }> => {
    const client = getSupabaseClient();
    if (!client) {
        return { ok: false, message: 'Supabase is not configured for this build.' };
    }

    const { data, error } = await client.auth.getSession();
    if (error) {
        return { ok: false, message: error.message };
    }

    const accessToken = data.session?.access_token;
    if (!accessToken) {
        return { ok: false, message: 'Sign in first to manage Plus billing.' };
    }

    return { ok: true, token: accessToken };
};

const requestBillingUrl = async (path: string): Promise<{ ok: true; url: string } | { ok: false; message: string }> => {
    const tokenResult = await requireAccessToken();
    if (!tokenResult.ok) {
        return tokenResult;
    }

    const response = await fetch(`${BILLING_API_BASE}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${tokenResult.token}`,
        },
    });

    if (!response.ok) {
        return {
            ok: false,
            message: await parseBillingError(response),
        };
    }

    const payload = await response.json() as BillingUrlResponse;
    if (!payload.url) {
        return { ok: false, message: 'Billing service did not return a redirect URL.' };
    }

    return { ok: true, url: payload.url };
};

const redirectToBillingUrl = (url: string): void => {
    window.location.assign(url);
};

export const startBillingCheckout = async (): Promise<BillingActionResult> => {
    const result = await requestBillingUrl('/checkout');
    if (!result.ok) {
        return result;
    }

    redirectToBillingUrl(result.url);
    return { ok: true, message: 'Redirecting to secure checkout.' };
};

export const openBillingPortal = async (): Promise<BillingActionResult> => {
    const result = await requestBillingUrl('/portal');
    if (!result.ok) {
        return result;
    }

    redirectToBillingUrl(result.url);
    return { ok: true, message: 'Redirecting to subscription management.' };
};

export const refreshBillingEntitlementState = async (): Promise<AccountResolvedState | null> => {
    const client = getSupabaseClient();
    if (!client) {
        return null;
    }

    const { data, error } = await client.auth.getSession();
    if (error || !data.session) {
        return null;
    }

    return loadSupabaseAccountState(client, data.session);
};
