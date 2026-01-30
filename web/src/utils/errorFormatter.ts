export const formatFriendlyError = (errMessage: string): string => {
    if (!errMessage) return "An unexpected error occurred.";

    // Handle common validation error patterns from the backend
    // Patterns like: "name: Validation error: length [{"max": Number(100), "value": String(""), "min": Number(1)}]"

    if (errMessage.includes("Validation error:")) {
        const parts = errMessage.split("Validation error:");
        const fieldPart = (parts[0] || "").trim().replace(":", "");
        const errorDetails = (parts[1] || "").trim();

        if (!fieldPart || !errorDetails) return errMessage;

        const fieldName = fieldPart.charAt(0).toUpperCase() + fieldPart.slice(1);

        if (errorDetails.startsWith("length")) {
            // Parse the length constraints if possible
            const minMatch = errorDetails.match(/"min":\s*Number\((\d+)\)/);
            const maxMatch = errorDetails.match(/"max":\s*Number\((\d+)\)/);

            const min = minMatch ? minMatch[1] : null;
            const max = maxMatch ? maxMatch[1] : null;

            if (min && max) {
                return `${fieldName} must be between ${min} and ${max} characters.`;
            } else if (min) {
                return `${fieldName} must be at least ${min} characters.`;
            } else if (max) {
                return `${fieldName} cannot exceed ${max} characters.`;
            }
        }

        if (errorDetails.includes("must be a valid email")) {
            return "Please enter a valid email address.";
        }

        // Fallback for other validation errors
        const firstPart = errorDetails.split('[')[0];
        return `Invalid ${fieldPart}: ${(firstPart || "").trim() || "validation failed"}`;
    }

    // Handle other common errors
    if (errMessage.includes("Unauthorized") || errMessage.includes("401")) {
        return "Session expired. Please log in again.";
    }

    if (errMessage.includes("Network Error") || errMessage.includes("Failed to fetch")) {
        return "Could not connect to the server. Please check your internet connection.";
    }

    return errMessage;
};
