"use client";

import { distanceBetween, useIsCoarsePointer } from "@/shared/lib";
import type { PointerEvent } from "react";
import { useRef } from "react";

type Point = { x: number; y: number };

export type ArchiveColumnCount = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type PinchColumnsOptions = {
  columns: ArchiveColumnCount;
  onColumnsChange: (columns: ArchiveColumnCount) => void;
};

const MIN_COLUMNS: ArchiveColumnCount = 1;
const MAX_COLUMNS: ArchiveColumnCount = 7;

// INFO: AGENTS.md § 4.1. Pinching in widens the grid, out narrows it — tuned against a real pinch rather than a précised ratio.
const SHRINK_RATIO = 0.8;
const GROW_RATIO = 1.25;

/**
 * AGENTS.md § 4.1. A two-pointer scale tracker for 보관함's mobile column count —
 * `usePinchZoom`'s API is built around a continuous photo transform, where this
 * needs a whole-number step per ~1.25× of scale. Each step re-bases the tracked
 * distance rather than the gesture's own start, letting one pinch walk several
 * steps. Gated on `useIsCoarsePointer` alone (AGENTS.md § 4.2.), never on
 * viewport — the desktop layout forces 5 columns regardless of what this sets.
 */
export function usePinchColumns({ columns, onColumnsChange }: PinchColumnsOptions) {
  const isCoarsePointer = useIsCoarsePointer();
  const pointersRef = useRef(new Map<number, Point>());
  const stepOriginRef = useRef<number | null>(null);

  if (!isCoarsePointer) {
    return {};
  }

  return {
    style: { touchAction: "pan-y" as const },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      syncStepOrigin();
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const pointers = pointersRef.current;

      if (!pointers.has(event.pointerId)) {
        return;
      }

      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const origin = stepOriginRef.current;

      if (origin === null || pointers.size !== 2) {
        return;
      }

      const [first, second] = [...pointers.values()];
      const distance = distanceBetween(first, second);
      const ratio = distance / origin;

      if (ratio < SHRINK_RATIO && columns < MAX_COLUMNS) {
        stepOriginRef.current = distance;
        onColumnsChange((columns + 1) as ArchiveColumnCount);
      } else if (ratio > GROW_RATIO && columns > MIN_COLUMNS) {
        stepOriginRef.current = distance;
        onColumnsChange((columns - 1) as ArchiveColumnCount);
      }
    },
    onPointerUp: release,
    onPointerCancel: release,
  };

  function release(event: PointerEvent<HTMLElement>) {
    pointersRef.current.delete(event.pointerId);
    syncStepOrigin();
  }

  // WARN: Re-based on **every** change to the pointer id set, not only when it drops below 2 — a third finger down (size 3, tracking paused) followed by one of the original pair lifting (back to size 2) leaves a pair that was never each other's baseline, and re-basing on the stale origin reads as a pinch that never happened.
  function syncStepOrigin() {
    const pointers = pointersRef.current;

    if (pointers.size !== 2) {
      stepOriginRef.current = null;

      return;
    }

    const [first, second] = [...pointers.values()];

    stepOriginRef.current = Math.max(distanceBetween(first, second), 1);
  }
}
