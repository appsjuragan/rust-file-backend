import { useCallback, useRef, useState } from "react";

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
  const pos = useRef<{ x: number; y: number } | null>(null);
  const isScrolling = useRef(false);

  const preventDefault = (event: Event) => {
    if (!event.cancelable) return;
    event.preventDefault();
  };

  const start = useCallback(
    (event: LongPressEvent) => {
      isScrolling.current = false;

      if (shouldPreventDefault && event.target) {
        event.target.addEventListener("touchend", preventDefault, {
          passive: false,
        });
        target.current = event.target;
      }

      // For mouse, only left click
      if ("button" in event && event.button !== 0) return;

      if ("touches" in event && event.touches && event.touches.length > 0) {
        pos.current = {
          x: event.touches[0]!.clientX,
          y: event.touches[0]!.clientY,
        };
      } else {
        pos.current = {
          x: (event as React.MouseEvent).clientX,
          y: (event as React.MouseEvent).clientY,
        };
      }

      setLongPressTriggered(false);
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => {
        if (isScrolling.current) return;
        onLongPress(event);
        setLongPressTriggered(true);
      }, delay);
    },
    [onLongPress, delay, shouldPreventDefault]
  );

  const move = useCallback((event: LongPressEvent) => {
    if (!pos.current) return;
    let currentX, currentY;
    if ("touches" in event && event.touches && event.touches.length > 0) {
      currentX = event.touches[0]!.clientX;
      currentY = event.touches[0]!.clientY;
    } else {
      currentX = (event as React.MouseEvent).clientX;
      currentY = (event as React.MouseEvent).clientY;
    }

    const moveX = Math.abs(currentX - pos.current.x);
    const moveY = Math.abs(currentY - pos.current.y);

    // If user moved finger/mouse by more than 10 pixels, consider it a scroll/drag
    if (moveX > 10 || moveY > 10) {
      isScrolling.current = true;
      if (timeout.current) clearTimeout(timeout.current);
    }
  }, []);

  const clear = useCallback(
    (event: LongPressEvent, shouldTriggerClick = true) => {
      if (timeout.current) clearTimeout(timeout.current);

      if (
        shouldTriggerClick &&
        !longPressTriggered &&
        onClick &&
        !isScrolling.current
      ) {
        onClick(event);
      }

      setLongPressTriggered(false);
      pos.current = null;

      // Give a tiny delay before resetting isScrolling to catch rogue click events
      // that run right after touchend
      setTimeout(() => {
        isScrolling.current = false;
      }, 50);

      if (shouldPreventDefault && target.current) {
        target.current.removeEventListener("touchend", preventDefault);
        target.current = null;
      }
    },
    [shouldPreventDefault, onClick, longPressTriggered]
  );

  return {
    onMouseDown: (e: React.MouseEvent) => start(e),
    onTouchStart: (e: React.TouchEvent) => start(e),
    onMouseMove: (e: React.MouseEvent) => move(e),
    onTouchMove: (e: React.TouchEvent) => move(e),
    onMouseUp: (e: React.MouseEvent) => clear(e),
    onMouseLeave: (e: React.MouseEvent) => clear(e, false),
    onTouchEnd: (e: React.TouchEvent) => clear(e),
    onContextMenu: (e: React.MouseEvent) => {
      // If long press already triggered, prevent system context menu
      if (longPressTriggered || isScrolling.current) {
        e.preventDefault();
      }
    },
  };
};
