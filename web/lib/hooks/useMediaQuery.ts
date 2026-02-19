import { useState, useEffect } from "react";

export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState<boolean>(() => {
        // SSR support: default to false if window is not defined
        if (typeof window !== "undefined") {
            return window.matchMedia(query).matches;
        }
        return false;
    });

    useEffect(() => {
        if (typeof window === "undefined") return;

        const media = window.matchMedia(query);
        const listener = (event: MediaQueryListEvent) => {
            setMatches(event.matches);
        };

        // Modern browsers
        media.addEventListener("change", listener);

        // Initial check in case it changed before listener attachment
        setMatches(media.matches);

        return () => {
            media.removeEventListener("change", listener);
        };
    }, [query]);

    return matches;
}
