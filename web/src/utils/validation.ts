export interface ValidationRules {
    allowed_mimes: string[];
    blocked_extensions: string[];
    max_file_size: number;
}

export const isRestrictedFile = (
    file: File,
    rules?: ValidationRules | null
): { restricted: boolean; reason?: string } => {
    const filename = file.name;
    const ext = filename.split('.').pop()?.toLowerCase();
    const mime = file.type.toLowerCase();

    // 1. Size check
    if (rules?.max_file_size && file.size > rules.max_file_size) {
        return {
            restricted: true,
            reason: `File size (${(file.size / 1024 / 1024).toFixed(2)} MB) exceeds maximum allowed limit (${(rules.max_file_size / 1024 / 1024).toFixed(2)} MB).`
        };
    }

    // 2. Extension check
    if (ext) {
        if (rules?.blocked_extensions && rules.blocked_extensions.includes(ext)) {
            return {
                restricted: true,
                reason: `File extension '.${ext}' is restricted for security reasons.`
            };
        }
    }

    // 3. MIME type check
    // If we have rules, use them. Otherwise, default to some basic sanity or skip.
    if (rules?.allowed_mimes && rules.allowed_mimes.length > 0) {
        // Strip parameters from mime (e.g. "text/plain; charset=utf-8")
        const normalizedMime = mime.split(';')[0]?.trim() || "";

        if (!rules.allowed_mimes.includes(normalizedMime)) {
            return {
                restricted: true,
                reason: `MIME type '${normalizedMime}' is not allowed. Only documents, media, and archives are permitted.`
            };
        }
    }

    return { restricted: false };
};
