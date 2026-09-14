"use client";

import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import type { Nullable } from "../nullish";

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
 * interruption detection on pointer/wheel, and initial index alignment.
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

  useLayoutEffect(() => {
    onIndexChangeRef.current = onIndexChange;
  });

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

  const handleScroll = useCallback(() => {
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

  const scrollToIndex = useCallback(
    (targetIndex: number, behavior: ScrollBehavior = "smooth") => {
      const track = trackRef.current;

      if (!track || track.clientWidth === 0) {
        return;
      }

      const next = Math.min(Math.max(targetIndex, 0), count - 1);
      const currentPos = Math.round(track.scrollLeft / track.clientWidth);

      if (next === currentPos && behavior === "smooth") {
        return;
      }

      if (behavior === "smooth") {
        steppedRef.current = next;
      } else {
        steppedRef.current = null;
      }

      lastReportedIndexRef.current = next;
      track.scrollTo({ left: track.clientWidth * next, behavior });
    },
    [count, trackRef],
  );

  const cancelInterruptedStep = useCallback(() => {
    steppedRef.current = null;
  }, []);

  return {
    cancelInterruptedStep,
    onScroll: handleScroll,
    scrollToIndex,
  };
}
