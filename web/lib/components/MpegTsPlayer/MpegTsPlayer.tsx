import React, { useEffect, useRef, useState } from "react";
import mpegts from "mpegts.js";
import "./MpegTsPlayer.css";

interface MpegTsPlayerProps {
    url: string;
    controls?: boolean;
    playing?: boolean;
    muted?: boolean;
    width?: string | number;
    height?: string | number;
    style?: React.CSSProperties;
    className?: string;
    onContextMenu?: (e: React.MouseEvent) => void;
}

const MpegTsPlayer: React.FC<MpegTsPlayerProps> = ({
    url,
    controls = true,
    playing = false,
    muted = false,
    width = "100%",
    height = "100%",
    style,
    className,
    onContextMenu,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerRef = useRef<mpegts.Player | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!videoRef.current || !url) return;

        if (!mpegts.isSupported()) {
            setError("MPEG-TS playback is not supported in this browser.");
            return;
        }

        // Clean up any previous player instance
        if (playerRef.current) {
            playerRef.current.pause();
            playerRef.current.unload();
            playerRef.current.detachMediaElement();
            playerRef.current.destroy();
            playerRef.current = null;
        }

        const player = mpegts.createPlayer({
            type: "mpegts",
            url: url,
        }, {
            enableWorker: true,
            lazyLoadMaxDuration: 3 * 60,
            seekType: "range",
        });

        player.attachMediaElement(videoRef.current);
        player.load();

        if (playing) {
            player.play();
        }

        player.on(mpegts.Events.ERROR, (errorType: string, errorDetail: string, errorInfo: any) => {
            console.error("mpegts.js error:", errorType, errorDetail, errorInfo);
            setError(`Playback error: ${errorDetail || errorType}`);
        });

        playerRef.current = player;

        return () => {
            if (playerRef.current) {
                playerRef.current.pause();
                playerRef.current.unload();
                playerRef.current.detachMediaElement();
                playerRef.current.destroy();
                playerRef.current = null;
            }
        };
    }, [url]);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = muted;
        }
    }, [muted]);

    if (error) {
        return (
            <div className="mpegts-player-error">
                <span>{error}</span>
            </div>
        );
    }

    return (
        <video
            ref={videoRef}
            controls={controls}
            muted={muted}
            playsInline
            width={width}
            height={height}
            style={style}
            className={`mpegts-player-video ${className || ""}`}
            onContextMenu={onContextMenu}
            controlsList="nodownload"
        />
    );
};

export default MpegTsPlayer;
