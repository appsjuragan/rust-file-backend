import React, { useState } from "react";
import CommonModal from "./CommonModal";
import { fileService } from "../../../src/services/fileService";

interface IVerifyPasswordModalProps {
    isVisible: boolean;
    onClose: () => void;
    onSuccess: () => void;
    shareToken: string;
}

const VerifyPasswordModal: React.FC<IVerifyPasswordModalProps> = ({
    isVisible,
    onClose,
    onSuccess,
    shareToken,
}) => {
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password.trim()) return;

        setLoading(true);
        setError("");
        try {
            const res = await fileService.verifySharePassword(shareToken, password);
            if (res.verified) {
                onSuccess();
                setPassword("");
                onClose();
            } else {
                setError("Incorrect password");
            }
        } catch (err) {
            setError("Failed to verify password");
        } finally {
            setLoading(false);
        }
    };

    return (
        <CommonModal
            isVisible={isVisible}
            onClose={onClose}
            title="Enter Password"
            autoHeight
        >
            <div className="p-2 sm:p-4" style={{ color: "var(--rfm-text-primary)" }}>
                <p className="text-sm mb-4">
                    This shared item is password protected.
                </p>
                <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
                    <input
                        type="text"
                        autoComplete="off"
                        className="rfm-new-folder-modal-input w-full p-2 rounded text-black"
                        style={{
                            backgroundColor: "var(--rfm-bg-element)",
                            color: "var(--rfm-text-primary)",
                            borderColor: "var(--rfm-border-color)",
                            border: "1px solid",
                            WebkitTextSecurity: "disc"
                        } as any}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoFocus
                        placeholder="Enter access password"
                    />
                    {error && <p className="text-red-400 text-xs">{error}</p>}
                    <button
                        type="submit"
                        disabled={loading || !password.trim()}
                        className="rfm-new-folder-modal-btn w-full disabled:opacity-50"
                    >
                        {loading ? "Verifying..." : "Unlock Access"}
                    </button>
                </form>
            </div>
        </CommonModal>
    );
};

export default VerifyPasswordModal;
