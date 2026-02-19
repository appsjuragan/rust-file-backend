import { useCallback, useRef, useState } from 'react';

/**
 * A hook to detect long press gestures, primarily for mobile context menus.
 */
export const useLongPress = (
    onLongPress: (e: any) => void,
    onClick?: (e: any) => void,
    { delay = 500, shouldPreventDefault = true } = {}
) => {
    const [longPressTriggered, setLongPressTriggered] = useState(false);
    const timeout = useRef<ReturnType<typeof setTimeout>>();
    const target = useRef<any>();

    const start = useCallback(
        (event: any) => {
            if (shouldPreventDefault && event.target) {
                event.target.addEventListener("touchend", preventDefault, {
                    passive: false
                });
                target.current = event.target;
            }

            // For mouse, only left click
            if (event.type === 'mousedown' && event.button !== 0) return;

            setLongPressTriggered(false);
            timeout.current = setTimeout(() => {
                onLongPress(event);
                setLongPressTriggered(true);
                if (navigator.vibrate) navigator.vibrate(60);
            }, delay);
        },
        [onLongPress, delay, shouldPreventDefault]
    );

    const clear = useCallback(
        (event: any, shouldTriggerClick = true) => {
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

    const preventDefault = (event: any) => {
        if (!event.cancelable) return;
        event.preventDefault();
    };

    return {
        onMouseDown: (e: any) => start(e),
        onTouchStart: (e: any) => start(e),
        onMouseUp: (e: any) => clear(e),
        onMouseLeave: (e: any) => clear(e, false),
        onTouchEnd: (e: any) => clear(e),
        onContextMenu: (e: any) => {
            // If long press already triggered, prevent system context menu
            if (longPressTriggered) {
                e.preventDefault();
            }
        }
    };
};
