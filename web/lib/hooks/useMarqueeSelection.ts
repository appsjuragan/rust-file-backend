import { useState, useCallback, useRef } from "react";
import React from "react";

interface MarqueeRect {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export function useMarqueeSelection(
    selectedIds: string[],
    setSelectedIds: (ids: string[]) => void
) {
    const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
    const didDragSelectionRef = useRef(false);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            // Only left click
            if (e.button !== 0) return;

            // Check if clicking on a file item or interactive element
            const target = e.target as HTMLElement;
            if (
                target.closest(".rfm-file-item") ||
                target.closest("button") ||
                target.closest("input")
            ) {
                return;
            }

            const container = document.getElementById("react-file-manager-workspace");
            if (!container) return;

            const startX = e.clientX;
            const startY = e.clientY;

            // Capture initial selection state for modifiers
            const isAdditive = e.ctrlKey || e.metaKey || e.shiftKey;
            const initialSelectionIds = isAdditive
                ? new Set(selectedIds)
                : new Set<string>();

            // Reset drag flag
            didDragSelectionRef.current = false;

            const mouseMoveHandler = (moveEvent: MouseEvent) => {
                moveEvent.preventDefault(); // Prevent text selection

                const currentX = moveEvent.clientX;
                const currentY = moveEvent.clientY;

                // Check for significant movement to count as drag
                if (
                    !didDragSelectionRef.current &&
                    (Math.abs(currentX - startX) > 4 || Math.abs(currentY - startY) > 4)
                ) {
                    didDragSelectionRef.current = true;
                }

                setMarquee({
                    x1: startX,
                    y1: startY,
                    x2: currentX,
                    y2: currentY,
                });

                const marqueeRect = {
                    left: Math.min(startX, currentX),
                    top: Math.min(startY, currentY),
                    right: Math.max(startX, currentX),
                    bottom: Math.max(startY, currentY),
                };

                const items = container.querySelectorAll(".rfm-file-item");
                const nextSelection = new Set(initialSelectionIds);

                items.forEach((item) => {
                    const rect = item.getBoundingClientRect();

                    if (
                        rect.left < marqueeRect.right &&
                        rect.right > marqueeRect.left &&
                        rect.top < marqueeRect.bottom &&
                        rect.bottom > marqueeRect.top
                    ) {
                        const id = item.getAttribute("data-id");
                        if (id) nextSelection.add(id);
                    }
                });

                setSelectedIds(Array.from(nextSelection));
            };

            const mouseUpHandler = () => {
                setMarquee(null);
                document.removeEventListener("mousemove", mouseMoveHandler);
                document.removeEventListener("mouseup", mouseUpHandler);
            };

            document.addEventListener("mousemove", mouseMoveHandler);
            document.addEventListener("mouseup", mouseUpHandler);
        },
        [selectedIds, setSelectedIds]
    );

    return { marquee, handleMouseDown, didDragSelectionRef };
}
