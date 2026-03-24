import React, { useState } from "react";
import { request } from "../../services/httpClient";
import { LaptopIcon, CheckCircle2, AlertTriangle } from "lucide-react";

export const DeviceActivatePage: React.FC = () => {
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (code.length !== 6) {
            setError("Please enter the 6-digit code shown on your device.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            await request("/auth/device/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_code: code }),
            });
            setSuccess(true);
        } catch (err: any) {
            console.error("Device confirmation failed:", err);
            // The backend will respond with 400 'Invalid or expired code'
            if (err.message) {
                setError(err.message === "Request failed" ? "Invalid or expired code." : err.message);
            } else {
                // Just generic message
                setError("Failed to verify code. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDeny = async () => {
        if (code.length !== 6) {
            setError("Enter the code first to deny it.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            await request("/auth/device/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_code: code, deny: true }),
            });
            // Show same success screen but with a deny message
            setError("Device request denied.");
        } catch (err: any) {
            setError(err.message || "Failed to deny request.");
        } finally {
            setLoading(false);
        }
    }

    const goHome = () => {
        window.location.href = "/";
    };

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full space-y-8 text-center bg-white dark:bg-gray-800 p-10 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
                    <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 mb-6">
                        <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">
                        Device Connected!
                    </h2>
                    <p className="mt-2 text-md text-gray-600 dark:text-gray-300">
                        Your desktop app has been successfully authorized and is now ready to securely sync your files.
                    </p>
                    <div className="mt-8">
                        <button
                            onClick={goHome}
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
                        >
                            Return to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white dark:bg-gray-800 p-10 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
                <div>
                    <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-indigo-100 dark:bg-indigo-900 mb-4">
                        <LaptopIcon className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h2 className="text-center text-3xl font-extrabold text-gray-900 dark:text-white">
                        Connect Device
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
                        Enter the 6-digit code shown on your AppJuragan Desktop Sync application to securely link it to your account.
                    </p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    {error && (
                        <div className="rounded-md bg-red-50 dark:bg-red-900/30 p-4 flex items-center border border-red-200 dark:border-red-800">
                            <AlertTriangle className="h-5 w-5 text-red-500 dark:text-red-400 mr-3" />
                            <div className="text-sm text-red-700 dark:text-red-300 font-medium">{error}</div>
                        </div>
                    )}

                    <div>
                        <label htmlFor="code" className="sr-only">
                            Activation Code
                        </label>
                        <input
                            id="code"
                            name="code"
                            type="text"
                            required
                            maxLength={6}
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="appearance-none rounded-lg relative block w-full px-4 py-4 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-2xl text-center tracking-widest font-mono"
                            placeholder="000000"
                        />
                    </div>

                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={handleDeny}
                            disabled={loading}
                            className="w-1/3 flex justify-center py-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors duration-200"
                        >
                            Deny
                        </button>
                        <button
                            type="submit"
                            disabled={loading || code.length !== 6}
                            className="w-2/3 flex justify-center py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors duration-200"
                        >
                            {loading ? "Verifying..." : "Approve Device"}
                        </button>
                    </div>

                    <div className="text-center mt-4">
                        <button type="button" onClick={goHome} className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
                            Cancel & Return Home
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
