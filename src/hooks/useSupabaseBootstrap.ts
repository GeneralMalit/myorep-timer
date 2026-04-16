import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
    getSupabaseAuthCodeFromUrl,
    getSupabaseClient,
    getSupabaseEnvironment,
    isSupabaseNativeAuthCallbackUrl,
} from '@/lib/supabase';
import { loadSupabaseAccountState } from '@/lib/supabaseAccount';
import { useAccountStore } from '@/store/useAccountStore';

export const useSupabaseBootstrap = (): void => {
    const applySession = useAccountStore((state) => state.applySession);
    const applyAccountState = useAccountStore((state) => state.applyAccountState);
    const markError = useAccountStore((state) => state.markError);
    const markUnavailable = useAccountStore((state) => state.markUnavailable);
    const setBootstrapStatus = useAccountStore((state) => state.setBootstrapStatus);

    useEffect(() => {
        const env = getSupabaseEnvironment();
        if (!env.enabled) {
            return;
        }

        const client = getSupabaseClient();
        if (!client) {
            markUnavailable();
            return;
        }

        let isActive = true;
        let requestId = 0;
        const handledNativeCodes = new Set<string>();
        const inFlightNativeCodes = new Set<string>();
        setBootstrapStatus('bootstrapping');

        const resolveSessionState = async (session: Parameters<typeof applySession>[0]) => {
            const currentRequestId = ++requestId;
            if (!session) {
                applySession(null);
                setBootstrapStatus('ready');
                return;
            }

            applySession(session);

            try {
                const resolvedState = await loadSupabaseAccountState(client, session);
                if (!isActive || currentRequestId !== requestId) {
                    return;
                }

                applyAccountState(resolvedState);
                setBootstrapStatus('ready');
            } catch (error: unknown) {
                if (!isActive || currentRequestId !== requestId) {
                    return;
                }

                const message = error instanceof Error
                    ? error.message
                    : 'Failed to load Supabase account state.';
                markError(message);
            }
        };

        void client.auth.getSession()
            .then(({ data, error }) => {
                if (!isActive) {
                    return;
                }

                if (error) {
                    markError(error.message);
                    return;
                }

                void resolveSessionState(data.session);
            })
            .catch((error: unknown) => {
                if (!isActive) {
                    return;
                }

                const message = error instanceof Error
                    ? error.message
                    : 'Failed to bootstrap Supabase auth.';
                markError(message);
            });

        const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
            if (!isActive) {
                return;
            }

            void resolveSessionState(session);
        });

        const completeNativeAuthCallback = async (url: string | null | undefined) => {
            if (!isActive || !url || !isSupabaseNativeAuthCallbackUrl(url)) {
                return;
            }

            const code = getSupabaseAuthCodeFromUrl(url);
            if (!code || handledNativeCodes.has(code) || inFlightNativeCodes.has(code)) {
                return;
            }

            inFlightNativeCodes.add(code);

            try {
                const { data, error } = await client.auth.exchangeCodeForSession(code);
                if (!isActive) {
                    return;
                }

                if (error) {
                    markError(error.message);
                    return;
                }

                handledNativeCodes.add(code);
                await resolveSessionState(data.session);
            } catch (error: unknown) {
                if (!isActive) {
                    return;
                }

                const message = error instanceof Error
                    ? error.message
                    : 'Failed to complete native Supabase auth callback.';
                markError(message);
            } finally {
                inFlightNativeCodes.delete(code);
            }
        };

        let removeUrlListener: (() => void) | null = null;
        if (Capacitor.isNativePlatform()) {
            void App.getLaunchUrl()
                .then(({ url }) => completeNativeAuthCallback(url))
                .catch((error: unknown) => {
                    if (!isActive) {
                        return;
                    }

                    const message = error instanceof Error
                        ? error.message
                        : 'Failed to read native launch URL.';
                    markError(message);
                });

            void App.addListener('appUrlOpen', async ({ url }) => {
                await completeNativeAuthCallback(url);
            }).then((listener) => {
                if (!isActive) {
                    void listener.remove();
                    return;
                }

                removeUrlListener = () => {
                    void listener.remove();
                };
            }).catch((error: unknown) => {
                if (!isActive) {
                    return;
                }

                const message = error instanceof Error
                    ? error.message
                    : 'Failed to subscribe to native auth callback events.';
                markError(message);
            });
        }

        return () => {
            isActive = false;
            subscription.unsubscribe();
            removeUrlListener?.();
        };
    }, [applyAccountState, applySession, markError, markUnavailable, setBootstrapStatus]);
};
