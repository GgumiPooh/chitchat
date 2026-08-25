"use client";

import type { Nullable } from "@/shared/lib";
import { distanceBetween, useIsCoarsePointer } from "@/shared/lib";
import { useEffect, useRef, useState } from "react";

export type ArchiveColumnCount = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type PinchColumnsOptions = {
  columns: ArchiveColumnCount;
  onColumnsChange: (columns: ArchiveColumnCount) => void;
};

const MIN_COLUMNS: ArchiveColumnCount = 1;
const MAX_COLUMNS: ArchiveColumnCount = 7;

// INFO: DESIGN.md § 7.10.3. Pinching in widens the grid, out narrows it — tuned against a real pinch, where 1.25× per step read as the grid lagging the fingers.
const SHRINK_RATIO = 0.87;
const GROW_RATIO = 1.15;

/**
 * AGENTS.md § 4.1. A two-finger scale tracker for 보관함's mobile column count —
 * `usePinchZoom`'s API is built around a continuous photo transform, where this
 * needs a whole-number step per ~1.25× of scale. Each step re-bases the tracked
 * distance rather than the gesture's own start, letting one pinch walk several
 * steps. Gated on `useIsCoarsePointer` alone (AGENTS.md § 4.2.), never on
 * viewport — the desktop layout forces 5 columns regardless of what this sets.
 *
 * WARN: Touch events on a manually attached, non-passive `touchmove`, not pointer
 * events. `touch-action: pan-y` keeps the grid scrollable, and it also lets the
 * browser claim the first finger's drift as a scroll before the second lands —
 * `pointercancel`, and the pointer count never reaches 2. Only `preventDefault`
 * on the two-finger `touchmove` keeps the pan from being taken; React's
 * `onTouchMove` is passive and cannot.
 */
export function usePinchColumns({ columns, onColumnsChange }: PinchColumnsOptions) {
  const isCoarsePointer = useIsCoarsePointer();
  const [element, setElement] = useState<Nullable<HTMLElement>>(null);
  const latestRef = useRef({ columns, onColumnsChange });

  useEffect(() => {
    latestRef.current = { columns, onColumnsChange };
  });

  useEffect(() => {
    if (!element || !isCoarsePointer) {
      return;
    }

    let stepOrigin: Nullable<number> = null;

    // WARN: Re-based on **every** change to the touch set, not only when it drops below 2 — a third finger down (tracking paused) followed by one of the original pair lifting leaves a pair that was never each other's baseline, and the stale origin reads as a pinch that never happened.
    const rebase = (event: TouchEvent) => {
      stepOrigin = event.touches.length === 2 ? Math.max(spanOf(event.touches), 1) : null;
    };

    const track = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      const distance = spanOf(event.touches);

      if (stepOrigin === null) {
        stepOrigin = Math.max(distance, 1);

        return;
      }

      const ratio = distance / stepOrigin;
      const { columns: current, onColumnsChange: change } = latestRef.current;

      if (ratio < SHRINK_RATIO && current < MAX_COLUMNS) {
        stepOrigin = distance;
        change((current + 1) as ArchiveColumnCount);
      } else if (ratio > GROW_RATIO && current > MIN_COLUMNS) {
        stepOrigin = distance;
        change((current - 1) as ArchiveColumnCount);
      }
    };

    element.addEventListener("touchstart", rebase, { passive: true });
    element.addEventListener("touchmove", track, { passive: false });
    element.addEventListener("touchend", rebase, { passive: true });
    element.addEventListener("touchcancel", rebase, { passive: true });

    return () => {
      element.removeEventListener("touchstart", rebase);
      element.removeEventListener("touchmove", track);
      element.removeEventListener("touchend", rebase);
      element.removeEventListener("touchcancel", rebase);
    };
  }, [element, isCoarsePointer]);

  return {
    ref: setElement,
    style: isCoarsePointer ? { touchAction: "pan-y" as const } : undefined,
  };
}

function spanOf(touches: TouchList): number {
  const [first, second] = [touches[0], touches[1]];

  return distanceBetween(
    { x: first.clientX, y: first.clientY },
    { x: second.clientX, y: second.clientY },
  );
}
