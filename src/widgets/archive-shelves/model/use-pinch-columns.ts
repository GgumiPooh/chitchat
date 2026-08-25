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

/**
 * AGENTS.md § 4.1. A two-finger scale tracker for 보관함's mobile column count —
 * `usePinchZoom`'s API is built around a continuous photo transform, where this
 * maps the gesture's **cumulative** scale to a whole number: the tile width the
 * fingers are asking for is the width they started on times their scale, so a
 * wide fast pinch crosses several columns at once rather than ratcheting one per
 * threshold. Gated on `useIsCoarsePointer` alone (AGENTS.md § 4.2.), never on
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

    let origin: Nullable<{ span: number; columns: number; emitted: number }> = null;

    // WARN: Re-based on **every** change to the touch set, not only when it drops below 2 — a third finger down (tracking paused) followed by one of the original pair lifting leaves a pair that was never each other's baseline, and the stale origin reads as a pinch that never happened.
    // WARN: Based on the last count this hook *emitted*, not `latestRef`'s — a step runs through a View Transition and lands a frame late, so the prop still says the old count at the moment the next touch set forms.
    const rebase = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        origin = null;

        return;
      }

      const columns = origin?.emitted ?? latestRef.current.columns;

      origin = { span: Math.max(spanOf(event.touches), 1), columns, emitted: columns };
    };

    const track = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      if (origin === null) {
        rebase(event);

        return;
      }

      const scale = spanOf(event.touches) / origin.span;
      const target = Math.min(
        MAX_COLUMNS,
        Math.max(MIN_COLUMNS, Math.round(origin.columns / scale)),
      ) as ArchiveColumnCount;

      if (target !== origin.emitted) {
        origin.emitted = target;
        latestRef.current.onColumnsChange(target);
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
