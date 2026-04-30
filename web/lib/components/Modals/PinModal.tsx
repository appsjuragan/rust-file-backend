import React, { useState, useEffect, useRef } from "react";
import SvgIcon from "../Icons/SvgIcon";
import "./CommonModal.css";

interface IPinModalProps {
    isVisible: boolean;
    title: string;
    onClose: () => void;
    onConfirm: (pin: string) => Promise<void>;
}

const PinModal: React.FC<IPinModalProps> = ({ isVisible, title, onClose, onConfirm }) => {
    const [pin, setPin] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isVisible) {
            setPin("");
            setError(null);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isVisible]);

    useEffect(() => {
        if (pin.length === 6) {
            handleConfirm();
        }
    }, [pin]);

    const handleConfirm = async () => {
        if (pin.length !== 6) return;
        setIsLoading(true);
        setError(null);
        try {
            await onConfirm(pin);
            onClose();
        } catch (err: any) {
            setError(err.message || "Incorrect PIN");
            setPin("");
            inputRef.current?.focus();
        } finally {
            setIsLoading(false);
        }
    };

    if (!isVisible) return null;

    return (
        <div className="rfm-modal-overlay z-[10000]" onClick={onClose}>
            <div className="rfm-modal-container max-w-sm" onClick={(e) => e.stopPropagation()}>
                <div className="rfm-modal-header">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40">
                            <SvgIcon svgType="lock" className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h2 className="rfm-modal-title uppercase tracking-widest text-xs font-black opacity-60">
                            {title}
                        </h2>
                    </div>
                    <button className="rfm-modal-close" onClick={onClose}>
                        <SvgIcon svgType="close" />
                    </button>
                </div>

                <div className="p-8 flex flex-col items-center">
                    <p className="text-sm text-stone-500 dark:text-slate-400 mb-8 text-center">
                        Enter your 6-digit security PIN to continue.
                    </p>

                    <div className="relative flex gap-3 mb-4">
                        {[...Array(6)].map((_, i) => (
                            <div
                                key={i}
                                className={`w-12 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all duration-200 ${pin.length > i
                                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                                    : "border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-900"
                                    }`}
                            >
                                {pin.length > i ? "●" : ""}
                            </div>
                        ))}
                        <input
                            ref={inputRef}
                            type="tel"
                            maxLength={6}
                            value={pin}
                            onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, "");
                                if (val.length <= 6) setPin(val);
                            }}
                            className="absolute inset-0 opacity-0 cursor-default"
                            autoFocus
                        />
                    </div>

                    {error && (
                        <p className="text-xs text-rose-500 font-medium mt-2 animate-pulse">
                            {error}
                        </p>
                    )}

                    {isLoading && (
                        <div className="mt-4">
                            <SvgIcon svgType="loading" className="w-6 h-6 text-blue-500" />
                        </div>
                    )}
                </div>

                <div className="p-4 bg-stone-50 dark:bg-slate-900/50 rounded-b-2xl border-t border-stone-100 dark:border-slate-800 flex justify-end gap-3">
                    <button
                        className="px-6 py-2 rounded-xl text-sm font-bold text-stone-500 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        className={`px-8 py-2 rounded-xl text-sm font-black text-white transition-all ${pin.length === 6
                            ? "bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95"
                            : "bg-stone-300 dark:bg-slate-800 cursor-not-allowed"
                            }`}
                        onClick={handleConfirm}
                        disabled={pin.length !== 6 || isLoading}
                    >
                        VERIFY
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PinModal;
