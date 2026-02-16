import React, { useState, useEffect } from "react";
import { authService } from "../../services/authService";
import { formatFriendlyError } from "../../utils/errorFormatter";
import { CaptchaWidget, useCaptcha } from "../../captcha";
import { SvgIcon } from "../../../lib";
import "./Auth.css";

interface AuthPageProps {
    onLogin: (token: string) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onLogin }) => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [authLoading, setAuthLoading] = useState(false);
    const [error, setError] = useState("");

    // Background Image State
    const [bgImage, setBgImage] = useState("");
    const [bgLoaded, setBgLoaded] = useState(false);

    // Captcha Hook
    const captchaHook = useCaptcha(true);

    useEffect(() => {
        const idx = Math.floor(Math.random() * 8);
        fetch(`https://bing.biturl.top/?resolution=1920&format=json&index=${idx}&mkt=en-US`)
            .then(res => res.json())
            .then(data => {
                if (data.url) {
                    const img = new Image();
                    img.onload = () => {
                        setBgImage(data.url);
                        setBgLoaded(true);
                    };
                    img.src = data.url;
                }
            })
            .catch(err => console.error("Failed to load background:", err));
    }, []);

    const validateInputs = () => {
        if (username.length < 3) {
            setError("Username must be at least 3 characters");
            return false;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return false;
        }
        return true;
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!validateInputs()) return;

        const captchaError = captchaHook.validateCaptcha();
        if (captchaError) { setError(captchaError); return; }

        const captchaPayload = captchaHook.getCaptchaPayload()!;

        setAuthLoading(true);
        try {
            const res = await authService.login({ username, password, ...captchaPayload });
            onLogin(res.token);
        } catch (err: any) {
            setError(formatFriendlyError(err.message));
            captchaHook.fetchCaptcha();
        } finally {
            setAuthLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!validateInputs()) return;

        const captchaError = captchaHook.validateCaptcha();
        if (captchaError) { setError(captchaError); return; }

        const captchaPayload = captchaHook.getCaptchaPayload()!;

        setAuthLoading(true);
        try {
            const res = await authService.register({ username, password, ...captchaPayload });
            onLogin(res.token);
        } catch (err: any) {
            setError(formatFriendlyError(err.message));
            captchaHook.fetchCaptcha();
        } finally {
            setAuthLoading(false);
        }
    };

    return (
        <div
            className={`auth-container ${bgLoaded ? 'bg-visible' : ''}`}
            style={bgImage ? { backgroundImage: `url(${bgImage})` } : {}}
        >
            <div className="auth-card">
                <div className="flex justify-center mb-3">
                    <div className="rfm-app-logo !w-16 !h-16 !rounded-[2rem] !p-3.5 shadow-2xl">
                        <SvgIcon svgType="rocket" className="rfm-app-logo-icon" />
                    </div>
                </div>
                <div className="rfm-app-title !items-center !gap-0 mb-4">
                    <span className="rfm-app-title-main !text-4xl !tracking-tighter">Juragan</span>
                    <span className="rfm-app-title-sub !text-4xl !tracking-tighter !-mt-4">Cloud</span>
                </div>
                <p>Advanced Agentic File Management</p>
                <form onSubmit={handleLogin}>
                    <input
                        type="text"
                        placeholder="Username"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        required
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                    />

                    <CaptchaWidget
                        captcha={captchaHook.captcha}
                        captchaAnswer={captchaHook.captchaAnswer}
                        onAnswerChange={captchaHook.setCaptchaAnswer}
                        captchaLoading={captchaHook.captchaLoading}
                        captchaExpiry={captchaHook.captchaExpiry}
                        cooldownSeconds={captchaHook.cooldownSeconds}
                        onRefresh={captchaHook.fetchCaptcha}
                    />

                    {error && <div className="error">{error}</div>}
                    <div className="auth-buttons">
                        <button type="submit" className="login-btn" disabled={authLoading || captchaHook.isDisabled}>
                            {authLoading ? "Logging in..." : "Login"}
                        </button>
                        <button type="button" onClick={handleRegister} className="register-btn" disabled={authLoading || captchaHook.isDisabled}>
                            {authLoading ? <div className="spinner-small"></div> : "Register"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
