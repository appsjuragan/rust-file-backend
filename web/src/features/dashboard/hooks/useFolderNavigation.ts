import { useState, useEffect, useRef, useCallback } from "react";

export function useFolderNavigation(
    currentFolder: string,
    setCurrentFolder: (id: string) => void,
    sidebarVisible: boolean,
    setSidebarVisible: (val: boolean) => void
) {
    const isInternalNavigation = useRef(false);
    const sidebarNavigatingRef = useRef(false);
    const sidebarVisibleRef = useRef(sidebarVisible);

    useEffect(() => {
        sidebarVisibleRef.current = sidebarVisible;
    }, [sidebarVisible]);

    // Folder Navigation History handling
    useEffect(() => {
        const handlePopState = (e: PopStateEvent) => {
            if (e.state && e.state.currentFolder !== undefined) {
                isInternalNavigation.current = true;
                setCurrentFolder(e.state.currentFolder);
            }
        };

        // Initialize history state on first load if not set
        if (
            !window.history.state ||
            window.history.state.currentFolder === undefined
        ) {
            window.history.replaceState(
                { ...window.history.state, currentFolder },
                ""
            );
        }

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    // Push history state on folder change
    useEffect(() => {
        if (isInternalNavigation.current) {
            isInternalNavigation.current = false;
            return;
        }

        if (window.history.state?.currentFolder !== currentFolder) {
            if (window.history.state?.sidebarId) {
                window.history.replaceState(
                    { ...window.history.state, currentFolder, sidebarId: undefined },
                    ""
                );
                sidebarNavigatingRef.current = true;
            } else {
                window.history.pushState(
                    { ...window.history.state, currentFolder },
                    ""
                );
            }
        }
    }, [currentFolder]);

    // Wrapped navigation handler
    const navigateToFolder = useCallback(
        (id: string) => {
            const isMobile = window.innerWidth <= 768;
            if (isMobile && sidebarVisibleRef.current) {
                if (window.history.state?.sidebarId) {
                    window.history.replaceState(
                        {
                            ...window.history.state,
                            currentFolder: id,
                            sidebarId: undefined,
                        },
                        ""
                    );
                    sidebarNavigatingRef.current = true;
                }
            }
            setCurrentFolder(id);
        },
        [setCurrentFolder]
    );

    // Back button handling for Sidebar on Mobile
    useEffect(() => {
        const isMobile = window.innerWidth <= 768;
        if (isMobile && sidebarVisible) {
            const stateId = `sidebar-${Math.random().toString(36).substr(2, 9)}`;
            window.history.pushState(
                { ...window.history.state, sidebarId: stateId },
                ""
            );
            sidebarNavigatingRef.current = false;

            const handlePopState = (e: PopStateEvent) => {
                if (sidebarVisibleRef.current && e.state?.sidebarId !== stateId) {
                    setSidebarVisible(false);
                }
            };

            const timer = setTimeout(() => {
                window.addEventListener("popstate", handlePopState);
            }, 50);

            return () => {
                clearTimeout(timer);
                window.removeEventListener("popstate", handlePopState);

                if (
                    window.history.state?.sidebarId === stateId &&
                    !sidebarNavigatingRef.current
                ) {
                    window.history.back();
                }
                sidebarNavigatingRef.current = false;
            };
        }
    }, [sidebarVisible, setSidebarVisible]);

    return { navigateToFolder };
}
