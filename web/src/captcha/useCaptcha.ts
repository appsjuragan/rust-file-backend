import { useState, useCallback, useEffect } from "react";
import { authService } from "../services/authService";

export interface CaptchaChallenge {
    captcha_id: string;
    question: string;
    expires_in: number;
}

export interface UseCaptchaReturn {
    /** Current CAPTCHA challenge (null if loading, cooldown, or error) */
    captcha: CaptchaChallenge | null;
    /** User's typed answer */
    captchaAnswer: string;
    setCaptchaAnswer: (val: string) => void;
    /** Whether CAPTCHA is currently loading */
    captchaLoading: boolean;
    /** Seconds remaining before captcha expires */
    captchaExpiry: number;
    /** Seconds remaining in cooldown (0 = no cooldown) */
    cooldownSeconds: number;
    /** Fetch/refresh a new CAPTCHA challenge */
    fetchCaptcha: () => Promise<void>;
    /** Validate that CAPTCHA is ready and answered; returns error message or null */
    validateCaptcha: () => string | null;
    /** Get the current captcha payload for API submission */
    getCaptchaPayload: () => { captcha_id: string; captcha_answer: number } | null;
    /** Whether the form should be disabled due to captcha state */
    isDisabled: boolean;
}

/**
 * Custom hook encapsulating all CAPTCHA state management:
 * - Fetches challenges from the backend
 * - Manages expiry countdown timer
 * - Manages cooldown countdown after too many failed attempts
 * - Auto-refreshes when challenges expire
 */
export function useCaptcha(active: boolean): UseCaptchaReturn {
    const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
    const [captchaAnswer, setCaptchaAnswer] = useState("");
    const [captchaLoading, setCaptchaLoading] = useState(false);
    const [captchaExpiry, setCaptchaExpiry] = useState(0);
    const [cooldownSeconds, setCooldownSeconds] = useState(0);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const fetchCaptcha = useCallback(async () => {
        setCaptchaLoading(true);
        setCaptchaAnswer("");
        setFetchError(null);
        try {
            const data = await authService.getCaptcha();

            // Validate data structure
            if (!data || typeof data.expires_in !== 'number' || !data.captcha_id) {
                console.error("Invalid CAPTCHA data received:", data);
                throw new Error("Invalid CAPTCHA format from server");
            }

            setCaptcha(data);
            setCaptchaExpiry(data.expires_in);
            setCooldownSeconds(0);
        } catch (err: any) {
            console.error("CAPTCHA fetch error:", err);
            const match = err.message?.match(/wait (\d+) seconds/);
            if (match) {
                const seconds = parseInt(match[1], 10);
                setCooldownSeconds(isNaN(seconds) ? 60 : seconds);
                setCaptcha(null);
            } else {
                setFetchError(err.message || "Failed to load CAPTCHA");
                setCaptcha(null);
            }
        } finally {
            setCaptchaLoading(false);
        }
    }, []);

    // Fetch on mount when active
    useEffect(() => {
        if (active) {
            fetchCaptcha();
        }
    }, [active, fetchCaptcha]);

    // Expiry countdown
    useEffect(() => {
        if (captchaExpiry <= 0) return;
        const timer = setInterval(() => {
            setCaptchaExpiry(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    fetchCaptcha();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [captcha?.captcha_id, fetchCaptcha]);

    // Cooldown countdown
    useEffect(() => {
        if (cooldownSeconds <= 0) return;
        const timer = setInterval(() => {
            setCooldownSeconds(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    fetchCaptcha();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [cooldownSeconds, fetchCaptcha]);

    const validateCaptcha = useCallback((): string | null => {
        if (!captcha) return "Please wait for CAPTCHA to load";
        if (!captchaAnswer.trim()) return "Please solve the CAPTCHA";
        return null;
    }, [captcha, captchaAnswer]);

    const getCaptchaPayload = useCallback(() => {
        if (!captcha) return null;
        return {
            captcha_id: captcha.captcha_id,
            captcha_answer: parseInt(captchaAnswer, 10),
        };
    }, [captcha, captchaAnswer]);

    const isDisabled = !captcha || cooldownSeconds > 0;

    return {
        captcha,
        captchaAnswer,
        setCaptchaAnswer,
        captchaLoading,
        captchaExpiry,
        cooldownSeconds,
        fetchCaptcha,
        validateCaptcha,
        getCaptchaPayload,
        isDisabled,
    };
}
