/// <reference types="vite/client" />

declare module '*?url' {
    const content: string;
    export default content;
}

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
    readonly VITE_ENABLE_SUPABASE?: string;
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
    readonly VITE_SUPABASE_REDIRECT_URL?: string;
    readonly VITE_APP_ENV?: string;
    readonly VITE_PADDLE_CLIENT_TOKEN?: string;
    readonly VITE_PADDLE_ENV?: 'sandbox' | 'production';
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
