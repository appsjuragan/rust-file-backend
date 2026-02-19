import { useCallback, useRef, useState } from 'react';

type LongPressEvent = React.MouseEvent | React.TouchEvent | React.PointerEvent;

/**
 * A hook to detect long press gestures, primarily for mobile context menus.
 */
export const useLongPress = (
    onLongPress: (e: LongPressEvent) => void,
    onClick?: (e: LongPressEvent) => void,
    { delay = 500, shouldPreventDefault = true } = {}
) => {
    const [longPressTriggered, setLongPressTriggered] = useState(false);
    const timeout = useRef<ReturnType<typeof setTimeout>>();
    const target = useRef<EventTarget | null>(null);

    const preventDefault = (event: Event) => {
        if (!event.cancelable) return;
        event.preventDefault();
    };

    const start = useCallback(
        (event: LongPressEvent) => {
            if (shouldPreventDefault && event.target) {
                event.target.addEventListener("touchend", preventDefault, {
                    passive: false
                });
                target.current = event.target;
            }

            // For mouse, only left click
            if ('button' in event && event.button !== 0) return;

            setLongPressTriggered(false);
            timeout.current = setTimeout(() => {
                onLongPress(event);
                setLongPressTriggered(true);
                // Vibration is handled by the caller or specialized hooks
            }, delay);
        },
        [onLongPress, delay, shouldPreventDefault]
    );

    const clear = useCallback(
        (event: LongPressEvent, shouldTriggerClick = true) => {
            if (timeout.current) clearTimeout(timeout.current);

            if (shouldTriggerClick && !longPressTriggered && onClick) {
                onClick(event);
            }

            setLongPressTriggered(false);

            if (shouldPreventDefault && target.current) {
                target.current.removeEventListener("touchend", preventDefault);
            }
        },
        [shouldPreventDefault, onClick, longPressTriggered]
    );

    return {
        onMouseDown: (e: React.MouseEvent) => start(e),
        onTouchStart: (e: React.TouchEvent) => start(e),
        onMouseUp: (e: React.MouseEvent) => clear(e),
        onMouseLeave: (e: React.MouseEvent) => clear(e, false),
        onTouchEnd: (e: React.TouchEvent) => clear(e),
        onContextMenu: (e: React.MouseEvent) => {
            // If long press already triggered, prevent system context menu
            if (longPressTriggered) {
                e.preventDefault();
            }
        }
    };
};
