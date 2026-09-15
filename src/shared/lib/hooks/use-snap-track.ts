"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  type TouchEvent,
} from "react";
import { A_SECOND } from "../date/time";
import { GESTURE_SLOP } from "../input/gesture";
import type { Nullable } from "../nullish";

// INFO: Flick speed and distance thresholds for mouse-driven tab navigation on desktop.
const FLICK_DISTANCE = 24;
const FLICK_DURATION = A_SECOND / 4;

type MouseDrag = {
  pointerId: number;
  startX: number;
  startScrollLeft: number;
  startedAt: number;
  hasDragged: boolean;
};

export type SnapTrackProps = {
  onClickCapture: (event: MouseEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onScroll: () => void;
  onScrollEnd: () => void;
  onTouchCancel: (event: TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: (event: TouchEvent<HTMLDivElement>) => void;
  onTouchStart: (event: TouchEvent<HTMLDivElement>) => void;
  onWheel: () => void;
};

export type UseSnapTrackOptions = {
  /** Reference to the scroll snap container element. */
  trackRef: RefObject<Nullable<HTMLDivElement>>;
  /** The total number of snap slides. */
  count: number;
  /** Initial slide index to align to on first layout mount. */
  initialIndex?: number;
  /** Called when a snap crossing lands on a new slide. */
  onIndexChange?: (index: number) => void;
};

/**
 * Manages a CSS Scroll Snap container (`snap-x snap-mandatory`):
 * handles programmatic smooth/instant stepping, position tracking on native scroll,
 * interruption detection on pointer/wheel, initial index alignment, and desktop mouse
 * drag-to-scroll with flick detection and click suppression.
 */
export function useSnapTrack({
  trackRef,
  count,
  initialIndex = 0,
  onIndexChange,
}: UseSnapTrackOptions) {
  const steppedRef = useRef<Nullable<number>>(null);
  const hasInitializedRef = useRef(false);
  const lastReportedIndexRef = useRef(initialIndex);
  const onIndexChangeRef = useRef(onIndexChange);
  const dragRef = useRef<Nullable<MouseDrag>>(null);
  // WARN: Outlives the drag so the capture-phase `click` event dispatched immediately after `pointerup` can be swallowed.
  const hasDraggedRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const isTouchingRef = useRef(false);
  const settleTimerRef = useRef<Nullable<ReturnType<typeof setTimeout>>>(null);

  useLayoutEffect(() => {
    onIndexChangeRef.current = onIndexChange;
  });

  useEffect(() => {
    return () => {
      if (settleTimerRef.current !== null) {
        clearTimeout(settleTimerRef.current);
      }
    };
  }, []);

  // INFO: Align to initial index on mount without smooth animation.
  useLayoutEffect(() => {
    const track = trackRef.current;

    if (!track || hasInitializedRef.current) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (!hasInitializedRef.current && track.clientWidth > 0) {
        hasInitializedRef.current = true;
        if (initialIndex > 0 && initialIndex < count) {
          track.scrollTo({ left: track.clientWidth * initialIndex });
          lastReportedIndexRef.current = initialIndex;
        }
        observer.disconnect();
      }
    });

    observer.observe(track);
    return () => observer.disconnect();
  }, [initialIndex, count, trackRef]);

  const checkSettle = useCallback(() => {
    if (isTouchingRef.current || dragRef.current !== null) {
      return;
    }

    const track = trackRef.current;

    if (!track || track.clientWidth === 0) {
      return;
    }

    const position = Math.round(track.scrollLeft / track.clientWidth);

    if (steppedRef.current === position) {
      steppedRef.current = null;
    }

    if (steppedRef.current !== null) {
      return;
    }

    if (position >= 0 && position < count && position !== lastReportedIndexRef.current) {
      lastReportedIndexRef.current = position;
      onIndexChangeRef.current?.(position);
    }
  }, [count, trackRef]);

  const handleScroll = useCallback(() => {
    // WARN: Never update active slide or trigger programmatic scrolls while the user is actively touching or dragging.
    if (isTouchingRef.current || dragRef.current !== null) {
      return;
    }

    const track = trackRef.current;

    if (!track || track.clientWidth === 0) {
      return;
    }

    const position = Math.round(track.scrollLeft / track.clientWidth);

    if (steppedRef.current === position) {
      steppedRef.current = null;
    }

    if (steppedRef.current !== null) {
      return;
    }

    // INFO: Fallback debounce for environments where scrollend is delayed or unsupported.
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current);
    }
    settleTimerRef.current = setTimeout(checkSettle, 120);
  }, [checkSettle, trackRef]);

  const handleScrollEnd = useCallback(() => {
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    checkSettle();
  }, [checkSettle]);

  const cancelInterruptedStep = useCallback(() => {
    steppedRef.current = null;
  }, []);

  const handleTouchStart = useCallback(() => {
    cancelInterruptedStep();

    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }

    const track = trackRef.current;

    if (track && track.clientWidth > 0) {
      const position = Math.round(track.scrollLeft / track.clientWidth);

      if (position >= 0 && position < count && position !== lastReportedIndexRef.current) {
        lastReportedIndexRef.current = position;
        onIndexChangeRef.current?.(position);
      }
    }

    isTouchingRef.current = true;
  }, [cancelInterruptedStep, count, trackRef]);

  const handleTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      // WARN: If multiple fingers were touching and only one lifted, keep isTouching true until all fingers leave.
      if (event.touches.length > 0) {
        return;
      }

      isTouchingRef.current = false;
      if (settleTimerRef.current !== null) {
        clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = setTimeout(checkSettle, 120);
    },
    [checkSettle],
  );

  const handleTouchCancel = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (event.touches.length > 0) {
        return;
      }

      isTouchingRef.current = false;
      if (settleTimerRef.current !== null) {
        clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = setTimeout(checkSettle, 120);
    },
    [checkSettle],
  );

  const handleWheel = useCallback(() => {
    cancelInterruptedStep();
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current);
    }
    settleTimerRef.current = setTimeout(checkSettle, 120);
  }, [cancelInterruptedStep, checkSettle]);

  const scrollToIndex = useCallback(
    (targetIndex: number, behavior: ScrollBehavior = "smooth") => {
      const track = trackRef.current;

      if (!track || track.clientWidth === 0) {
        return;
      }

      const next = Math.min(Math.max(targetIndex, 0), count - 1);
      const targetLeft = track.clientWidth * next;

      // INFO: Skip if the container is already at the target scroll position.
      if (Math.abs(track.scrollLeft - targetLeft) < 1 && behavior === "smooth") {
        return;
      }

      if (behavior === "smooth") {
        steppedRef.current = next;
      } else {
        steppedRef.current = null;
      }

      lastReportedIndexRef.current = next;
      track.scrollTo({ left: targetLeft, behavior });
    },
    [count, trackRef],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      cancelInterruptedStep();

      // WARN: Only handle primary mouse clicks. Mobile touch is handled natively by the browser CSS Scroll Snap compositor.
      if (event.pointerType !== "mouse" || event.button !== 0) {
        return;
      }

      const track = trackRef.current;

      if (!track) {
        return;
      }

      if (settleTimerRef.current !== null) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }

      if (track.clientWidth > 0) {
        const position = Math.round(track.scrollLeft / track.clientWidth);

        if (position >= 0 && position < count && position !== lastReportedIndexRef.current) {
          lastReportedIndexRef.current = position;
          onIndexChangeRef.current?.(position);
        }
      }

      dragRef.current = {
        hasDragged: false,
        pointerId: event.pointerId,
        startScrollLeft: track.scrollLeft,
        startX: event.clientX,
        startedAt: event.timeStamp,
      };
    },
    [cancelInterruptedStep, count, trackRef],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;

      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      dragRef.current = null;
      setIsDragging(false);

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (!drag.hasDragged) {
        return;
      }

      const track = trackRef.current;

      if (!track || track.clientWidth === 0) {
        return;
      }

      const clientWidth = track.clientWidth;
      const deltaX = event.clientX - drag.startX;
      const duration = event.timeStamp - drag.startedAt;
      const isFlick = Math.abs(deltaX) > FLICK_DISTANCE && duration < FLICK_DURATION;

      const startPosition = Math.round(drag.startScrollLeft / clientWidth);
      const displacement = (track.scrollLeft - drag.startScrollLeft) / clientWidth;
      let targetIndex: number;

      if (isFlick) {
        targetIndex = deltaX < 0 ? startPosition + 1 : startPosition - 1;
      } else if (displacement > 0.2) {
        targetIndex = startPosition + Math.ceil(displacement);
      } else if (displacement < -0.2) {
        targetIndex = startPosition + Math.floor(displacement);
      } else {
        targetIndex = startPosition;
      }

      const next = Math.min(Math.max(targetIndex, 0), count - 1);

      if (next !== lastReportedIndexRef.current) {
        lastReportedIndexRef.current = next;
        onIndexChangeRef.current?.(next);
      }

      scrollToIndex(next, "smooth");
    },
    [count, scrollToIndex, trackRef],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;

      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      if (event.buttons === 0) {
        handlePointerUp(event);

        return;
      }

      const deltaX = event.clientX - drag.startX;

      if (!drag.hasDragged) {
        if (Math.abs(deltaX) < GESTURE_SLOP) {
          return;
        }

        drag.hasDragged = true;
        hasDraggedRef.current = true;
        steppedRef.current = null;
        setIsDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      const track = trackRef.current;

      if (track) {
        track.scrollLeft = drag.startScrollLeft - deltaX;
      }
    },
    [handlePointerUp, trackRef],
  );

  const handlePointerCancel = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      handlePointerUp(event);
    },
    [handlePointerUp],
  );

  const handleClickCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  const trackProps: SnapTrackProps = {
    onClickCapture: handleClickCapture,
    onPointerCancel: handlePointerCancel,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onScroll: handleScroll,
    onScrollEnd: handleScrollEnd,
    onTouchCancel: handleTouchCancel,
    onTouchEnd: handleTouchEnd,
    onTouchStart: handleTouchStart,
    onWheel: handleWheel,
  };

  return {
    cancelInterruptedStep,
    onClickCapture: handleClickCapture,
    onPointerCancel: handlePointerCancel,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onScroll: handleScroll,
    onScrollEnd: handleScrollEnd,
    onTouchCancel: handleTouchCancel,
    onTouchEnd: handleTouchEnd,
    onTouchStart: handleTouchStart,
    onWheel: handleWheel,
    scrollToIndex,
    trackProps,
    isDragging,
  };
}
