"use client";

import { A_SECOND, type Nullable } from "@/shared/lib";
import { useCallback, useEffect, useRef } from "react";

// INFO: Past both of `virtual-core`'s own gates — it resets `isScrolling` 150ms after the last scroll event, and holds a just-ended touch for another 150ms past `touchend`.
const SETTLE_DELAY = A_SECOND / 5;

export type SettledCommitOptions = {
  scroller: Nullable<HTMLElement>;
  /** Whether something is waiting for the list to go still. */
  isPending: boolean;
  onSettled: () => void;
};

/**
 * Runs `onSettled` once the scroller has been still for `SETTLE_DELAY` with no
 * finger on it — which is the only moment a prepend may be committed
 * (REQUIREMENTS.md § 8.3.).
 *
 * WARN: The whole point is *when*, not *whether*. WebKit hands the scroll offset to the compositor for the length of a gesture, so the scroll correction a prepend needs is dropped if it lands mid-flick — the virtualizer defers it to a scroll that has already moved on, which reads as the room jumping into the past and snapping back.
 */
export function useSettledCommit({ scroller, isPending, onSettled }: SettledCommitOptions) {
  const timerRef = useRef(0);
  const isTouchingRef = useRef(false);

  const schedule = useCallback(() => {
    clearTimeout(timerRef.current);

    // WARN: A finger resting on the list fires no `scroll` at all, and committing under it lands in the very deferral this exists to avoid. `touchend` is what restarts the wait.
    if (isTouchingRef.current) {
      return;
    }

    timerRef.current = window.setTimeout(onSettled, SETTLE_DELAY);
  }, [onSettled]);

  useEffect(() => {
    if (!scroller) {
      return;
    }

    const holdTouch = () => {
      isTouchingRef.current = true;
      clearTimeout(timerRef.current);
    };

    const releaseTouch = () => {
      isTouchingRef.current = false;
      schedule();
    };

    scroller.addEventListener("scroll", schedule, { passive: true });
    scroller.addEventListener("touchstart", holdTouch, { passive: true });
    scroller.addEventListener("touchend", releaseTouch, { passive: true });
    // INFO: A cancelled pointer is the browser taking the gesture over as a scroll; the finger is gone either way.
    scroller.addEventListener("touchcancel", releaseTouch, { passive: true });

    return () => {
      clearTimeout(timerRef.current);
      scroller.removeEventListener("scroll", schedule);
      scroller.removeEventListener("touchstart", holdTouch);
      scroller.removeEventListener("touchend", releaseTouch);
      scroller.removeEventListener("touchcancel", releaseTouch);
    };
  }, [scroller, schedule]);

  // INFO: A page that lands while the list is already still fires no `scroll` of its own, so its arrival has to start the wait too.
  useEffect(() => {
    if (isPending) {
      schedule();
    }
  }, [isPending, schedule]);
}
