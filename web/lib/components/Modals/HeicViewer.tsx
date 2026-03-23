import React, { useEffect, useState, useRef } from "react";

import SvgIcon from "../Icons/SvgIcon";

interface HeicViewerProps {
    url: string;
    className?: string;
    onContextMenu?: (e: React.MouseEvent) => void;
}

const HeicViewer: React.FC<HeicViewerProps> = ({ url, className, onContextMenu }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        let isMounted = true;

        const renderHeic = async () => {
            try {
                setLoading(true);
                setError(null);

                // Dynamically import libheif-js only when needed (2MB+ WASM)
                // @ts-ignore
                const libheif = (await import("libheif-js")).default;

                // Fetch image data
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Failed to fetch HEIC: ${response.statusText}`);
                const arrayBuffer = await response.arrayBuffer();

                // libheif-js returns a function (factory) that returns the decoder
                const decoder = new libheif.HeifDecoder();
                const data = decoder.decode(arrayBuffer);

                if (!data || data.length === 0) {
                    throw new Error("No images found in HEIC file");
                }

                const image = data[0]; // Take the first image
                const width = image.get_width();
                const height = image.get_height();

                if (!isMounted) return;

                // Display on canvas
                const canvas = canvasRef.current;
                if (!canvas) return;

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                const imageData = ctx.createImageData(width, height);

                await new Promise<void>((resolve, reject) => {
                    image.display(imageData, (displayData: ImageData) => {
                        if (!displayData) {
                            reject(new Error("HEIC display failed"));
                            return;
                        }
                        ctx.putImageData(displayData, 0, 0);
                        resolve();
                    });
                });

                setLoading(false);
            } catch (err: any) {
                console.error("HEIC decoding error:", err);
                if (isMounted) {
                    setError(err.message || "Failed to decode HEIC image");
                    setLoading(false);
                }
            }
        };

        renderHeic();

        return () => {
            isMounted = false;
        };
    }, [url]);

    return (
        <div className={`heic-viewer-container ${className || ""}`} style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "auto",
            position: "relative"
        }}>
            {loading && (
                <div className="rfm-preview-loading flex flex-col gap-4">
                    <SvgIcon svgType="loading" size={40} className="text-sky-500" />
                    <span className="text-sm opacity-60">Decoding high-efficiency image...</span>
                </div>
            )}
            {error && <div className="rfm-preview-error">Error: {error}</div>}
            <canvas
                ref={canvasRef}
                onContextMenu={onContextMenu}
                style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                    display: loading || error ? "none" : "block",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
                    borderRadius: "4px"
                }}
            />
        </div>
    );
};

export default HeicViewer;
