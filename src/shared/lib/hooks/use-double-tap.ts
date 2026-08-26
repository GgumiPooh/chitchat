"use client";

import { useCallback, useRef, type MouseEvent, type PointerEvent } from "react";
import type { Nullable, Optional } from "../nullish";

const DOUBLE_TAP_WINDOW = 380; // ms
const DOUBLE_TAP_DISTANCE_SLOP = 24; // px

type TapOrigin = {
  x: number;
  y: number;
  time: number;
};

export type DoubleTapOptions = {
  onDoubleTap?: () => void;
};

/**
 * Detects double tap/click on a message bubble to trigger quick reactions (like heart ❤️),
 * while preventing double clicks from triggering single tap actions (unfold, expand, jump to reply).
 */
export function useDoubleTap(options: DoubleTapOptions = {}) {
  const { onDoubleTap } = options;
  const lastTapRef = useRef<Nullable<TapOrigin>>(null);
  const startPointerRef = useRef<Nullable<{ x: number; y: number }>>(null);
  const singleTapTimerRef = useRef<Optional<ReturnType<typeof setTimeout>>>(undefined);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (!event.isPrimary) {
      return;
    }
    startPointerRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const start = startPointerRef.current;
      startPointerRef.current = null;

      if (!start || !onDoubleTap) {
        return;
      }

      // WARN: On desktop, mouse clicks fire native `onDoubleClick`.
      // Processing mouse here too would trigger `onDoubleTap` TWICE (once in pointerUp and once in dblclick).
      if (event.pointerType === "mouse") {
        return;
      }

      // If moved significantly during a single touch/click, it's a drag / swipe / scroll
      if (
        Math.hypot(event.clientX - start.x, event.clientY - start.y) >= DOUBLE_TAP_DISTANCE_SLOP
      ) {
        return;
      }

      const now = Date.now();
      const lastTap = lastTapRef.current;

      if (
        lastTap &&
        now - lastTap.time <= DOUBLE_TAP_WINDOW &&
        Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) <= DOUBLE_TAP_DISTANCE_SLOP
      ) {
        // Double tap confirmed
        lastTapRef.current = null;
        if (singleTapTimerRef.current !== undefined) {
          clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = undefined;
        }
        onDoubleTap();
      } else {
        lastTapRef.current = { x: event.clientX, y: event.clientY, time: now };
      }
    },
    [onDoubleTap],
  );

  /**
   * Wrap single-tap handler so it executes only if a second tap does NOT occur within DOUBLE_TAP_WINDOW.
   * If onDoubleTap is not provided, runs single tap immediately.
   */
  const wrapSingleTap = useCallback(
    (singleTapHandler: Optional<(event: MouseEvent<HTMLElement>) => void>) => {
      if (!singleTapHandler) {
        return undefined;
      }
      if (!onDoubleTap) {
        return singleTapHandler;
      }

      return (event: MouseEvent<HTMLElement>) => {
        // On desktop, the second click of a double click has detail > 1
        if (event.detail > 1) {
          return;
        }

        if (singleTapTimerRef.current !== undefined) {
          clearTimeout(singleTapTimerRef.current);
        }

        singleTapTimerRef.current = setTimeout(() => {
          singleTapTimerRef.current = undefined;
          singleTapHandler(event);
        }, DOUBLE_TAP_WINDOW);
      };
    },
    [onDoubleTap],
  );

  return {
    pointerHandlers: {
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
    },
    onDoubleClick: onDoubleTap
      ? (event: MouseEvent<HTMLElement>) => {
          event.preventDefault();
          event.stopPropagation();
          // Clear any native word selection that the browser triggered on double click
          window.getSelection()?.removeAllRanges();
          if (singleTapTimerRef.current !== undefined) {
            clearTimeout(singleTapTimerRef.current);
            singleTapTimerRef.current = undefined;
          }
          onDoubleTap();
        }
      : undefined,
    wrapSingleTap,
  };
}
