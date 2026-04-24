export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
export const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

export const normalizeUsername = (value: string): string => {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, USERNAME_MAX_LENGTH);
};

export const isValidUsername = (value: string): boolean => {
    return USERNAME_PATTERN.test(value.trim());
};

export const deriveUsernameFromEmail = (email: string | null | undefined): string => {
    const localPart = email?.split('@')[0] ?? '';
    const normalized = normalizeUsername(localPart);
    if (normalized.length >= USERNAME_MIN_LENGTH) {
        return normalized;
    }

    return 'athlete';
};
