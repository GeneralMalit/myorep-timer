export interface SupabaseServerEnvironment {
    supabaseUrl: string;
    supabaseAnonKey: string;
    supabaseServiceRoleKey: string;
}

export interface BillingEnvironment extends SupabaseServerEnvironment {
    appUrl: string;
    paddleApiKey: string;
    paddleNotificationSecretKey: string;
    paddlePlusPriceId: string;
}

const readEnv = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
};

const readEnvWithFallback = (names: string[]): string => {
    for (const name of names) {
        const value = process.env[name]?.trim();
        if (value) {
            return value;
        }
    }

    throw new Error(`Missing required environment variable. Expected one of: ${names.join(', ')}`);
};

export const getSupabaseServerEnvironment = (): SupabaseServerEnvironment => {
    return {
        supabaseUrl: readEnvWithFallback(['SUPABASE_URL', 'VITE_SUPABASE_URL']),
        supabaseAnonKey: readEnvWithFallback(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY']),
        supabaseServiceRoleKey: readEnv('SUPABASE_SERVICE_ROLE_KEY'),
    };
};

export const getBillingEnvironment = (): BillingEnvironment => {
    return {
        appUrl: readEnv('APP_URL'),
        paddleApiKey: readEnv('PADDLE_API_KEY'),
        paddleNotificationSecretKey: readEnv('PADDLE_NOTIFICATION_SECRET_KEY'),
        paddlePlusPriceId: readEnv('PADDLE_PLUS_PRICE_ID'),
        ...getSupabaseServerEnvironment(),
    };
};
