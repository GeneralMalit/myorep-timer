import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
    getSupabaseAuthCodeFromUrl,
    getSupabaseClient,
    getSupabaseEnvironment,
    isSupabaseNativeAuthCallbackUrl,
    isSupabaseRecoveryUrl,
} from '@/lib/supabase';
import { loadSupabaseAccountState } from '@/lib/supabaseAccount';
import { useAccountStore } from '@/store/useAccountStore';

const getSessionResolutionKey = (session: Session): string => {
    const metadata = session.user.user_metadata as Record<string, unknown> | undefined;
    const stringMetadataValue = (key: string): string | null => {
        const value = metadata?.[key];
        return typeof value === 'string' ? value : null;
    };

    return JSON.stringify([
        session.user.id,
        session.user.email ?? null,
        session.user.created_at ?? null,
        session.user.updated_at ?? null,
        stringMetadataValue('username'),
        stringMetadataValue('full_name'),
        stringMetadataValue('name'),
    ]);
};

export const useSupabaseBootstrap = (): void => {
    const applySession = useAccountStore((state) => state.applySession);
    const applyAccountState = useAccountStore((state) => state.applyAccountState);
    const markError = useAccountStore((state) => state.markError);
    const markUnavailable = useAccountStore((state) => state.markUnavailable);
    const setPasswordRecoveryMode = useAccountStore((state) => state.setPasswordRecoveryMode);
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
        let hasObservedAuthEvent = false;
        let resolvedSessionKey: string | null = null;
        let pendingResolution: {
            key: string;
            requestId: number;
            latestSession: Session;
            promise: Promise<void> | null;
        } | null = null;
        const handledNativeCodes = new Set<string>();
        const inFlightNativeCodes = new Set<string>();
        let isPasswordRecoveryMode = false;
        setBootstrapStatus('bootstrapping');

        const resolveSessionState = (session: Parameters<typeof applySession>[0]): Promise<void> => {
            if (!session) {
                requestId += 1;
                pendingResolution = null;
                resolvedSessionKey = null;
                applySession(null);
                setPasswordRecoveryMode(isPasswordRecoveryMode);
                setBootstrapStatus('ready');
                return Promise.resolve();
            }

            const resolutionKey = getSessionResolutionKey(session);
            if (pendingResolution?.key === resolutionKey) {
                pendingResolution.latestSession = session;
                return pendingResolution.promise ?? Promise.resolve();
            }

            if (resolvedSessionKey === resolutionKey) {
                const currentState = useAccountStore.getState();
                if (currentState.session?.user.id === session.user.id) {
                    requestId += 1;
                    pendingResolution = null;
                    applyAccountState({
                        session,
                        profile: currentState.profile,
                        entitlement: currentState.entitlement,
                        mode: currentState.mode,
                        syncStatus: currentState.syncStatus,
                    });
                    setPasswordRecoveryMode(isPasswordRecoveryMode);
                    setBootstrapStatus('ready');
                    return Promise.resolve();
                }

                resolvedSessionKey = null;
            }

            const currentRequestId = ++requestId;
            resolvedSessionKey = null;
            const activeResolution = {
                key: resolutionKey,
                requestId: currentRequestId,
                latestSession: session,
                promise: null as Promise<void> | null,
            };
            pendingResolution = activeResolution;

            const resolutionPromise = (async () => {
                try {
                    const resolvedState = await loadSupabaseAccountState(client, session);
                    if (!isActive || currentRequestId !== requestId) {
                        return;
                    }

                    resolvedSessionKey = resolutionKey;
                    applyAccountState({
                        ...resolvedState,
                        session: activeResolution.latestSession,
                    });
                    setPasswordRecoveryMode(isPasswordRecoveryMode);
                    setBootstrapStatus('ready');
                } catch (error: unknown) {
                    if (!isActive || currentRequestId !== requestId) {
                        return;
                    }

                    applySession(activeResolution.latestSession);
                    const message = error instanceof Error
                        ? error.message
                        : 'Failed to load Supabase account state.';
                    markError(message);
                } finally {
                    if (pendingResolution === activeResolution) {
                        pendingResolution = null;
                    }
                }
            })();
            activeResolution.promise = resolutionPromise;
            return resolutionPromise;
        };

        const hasRecoveryUrl = typeof window !== 'undefined' && isSupabaseRecoveryUrl(window.location.href);
        if (hasRecoveryUrl) {
            isPasswordRecoveryMode = true;
            setPasswordRecoveryMode(true);
        }

        const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
            if (!isActive) {
                return;
            }

            hasObservedAuthEvent = true;
            if (event === 'PASSWORD_RECOVERY') {
                isPasswordRecoveryMode = true;
                setPasswordRecoveryMode(true);
            } else if (event === 'SIGNED_OUT') {
                isPasswordRecoveryMode = false;
                setPasswordRecoveryMode(false);
            } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                const hasRecoveryUrl = typeof window !== 'undefined' && isSupabaseRecoveryUrl(window.location.href);
                isPasswordRecoveryMode = hasRecoveryUrl;
                if (!hasRecoveryUrl) {
                    setPasswordRecoveryMode(false);
                }
            }

            void resolveSessionState(session);
        });

        void client.auth.getSession()
            .then(({ data, error }) => {
                if (!isActive || hasObservedAuthEvent) {
                    return;
                }

                if (error) {
                    markError(error.message);
                    return;
                }

                void resolveSessionState(data.session);
            })
            .catch((error: unknown) => {
                if (!isActive || hasObservedAuthEvent) {
                    return;
                }

                const message = error instanceof Error
                    ? error.message
                    : 'Failed to bootstrap Supabase auth.';
                markError(message);
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

                setPasswordRecoveryMode(isSupabaseRecoveryUrl(url));
                isPasswordRecoveryMode = isSupabaseRecoveryUrl(url);
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
                .then((launch) => completeNativeAuthCallback(launch?.url))
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
    }, [applyAccountState, applySession, markError, markUnavailable, setBootstrapStatus, setPasswordRecoveryMode]);
};
