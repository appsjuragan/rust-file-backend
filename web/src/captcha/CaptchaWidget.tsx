import React from "react";
import type { CaptchaChallenge } from "./useCaptcha";
import "./CaptchaWidget.css";

interface CaptchaWidgetProps {
  captcha: CaptchaChallenge | null;
  captchaAnswer: string;
  onAnswerChange: (val: string) => void;
  captchaLoading: boolean;
  captchaExpiry: number;
  cooldownSeconds: number;
  onRefresh: () => void;
}

/**
 * Self-contained CAPTCHA widget component.
 * Renders one of four states: cooldown, loading, challenge, or error/retry.
 */
export const CaptchaWidget: React.FC<CaptchaWidgetProps> = ({
  captcha,
  captchaAnswer,
  onAnswerChange,
  captchaLoading,
  captchaExpiry,
  cooldownSeconds,
  onRefresh,
}) => {
  if (cooldownSeconds > 0) {
    return (
      <div className="captcha-section">
        <div className="captcha-cooldown">
          <div className="captcha-cooldown-icon">⏳</div>
          <div className="captcha-cooldown-text">
            Too many attempts. Please wait <strong>{cooldownSeconds}s</strong>
          </div>
          <div className="captcha-cooldown-bar">
            <div
              className="captcha-cooldown-bar-inner"
              style={{
                width: "100%",
                animation: `captchaCooldownShrink ${cooldownSeconds}s linear forwards`,
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (captchaLoading) {
    return (
      <div className="captcha-section">
        <div className="captcha-loading">
          <div className="spinner-small" />
          <span>Loading security challenge...</span>
        </div>
      </div>
    );
  }

  if (captcha) {
    const safeExpiry = isNaN(captchaExpiry) ? 0 : captchaExpiry;
    const minutes = Math.floor(safeExpiry / 60);
    const seconds = (safeExpiry % 60).toString().padStart(2, "0");

    return (
      <div className="captcha-section">
        <div className="captcha-challenge">
          <div className="captcha-header">
            <span className="captcha-shield">🛡️</span>
            <span className="captcha-label">Security Check</span>
            <div className="captcha-timer-group">
              <span
                className={`captcha-timer ${
                  captchaExpiry <= 15 ? "captcha-timer-warning" : ""
                }`}
              >
                {minutes}:{seconds}
              </span>
              <button
                type="button"
                className="captcha-refresh"
                onClick={onRefresh}
                title="Get new challenge"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38" />
                </svg>
              </button>
            </div>
          </div>
          <div className="captcha-question">{captcha.question}</div>
        </div>
        <input
          type="number"
          placeholder="Your answer"
          value={captchaAnswer}
          onChange={(e) => onAnswerChange(e.target.value)}
          className="captcha-input"
          required
          autoComplete="off"
        />
      </div>
    );
  }

  // Error / failed to load state
  return (
    <div className="captcha-section">
      <div className="captcha-error">
        <span>Failed to load CAPTCHA.</span>
        <button type="button" onClick={onRefresh} className="captcha-retry-btn">
          Retry
        </button>
      </div>
    </div>
  );
};
