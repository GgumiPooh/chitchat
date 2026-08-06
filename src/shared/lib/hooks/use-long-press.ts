"use client";

import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { A_SECOND } from "../date/time";
import { GESTURE_SLOP } from "../gesture";
import type { Nullable, Optional } from "../nullish";

const LONG_PRESS_DELAY = A_SECOND / 2;

// WARN: Every element that takes the handlers below needs this. A held finger otherwise runs the browser's own long-press natives first — the selection drag over `select-text`, iOS's callout, the image drag — and the sheet opens behind a gesture the page no longer owns. A fine pointer keeps all of them, since it never arms the timer.
export const LONG_PRESS_TARGET_CLASS =
  "[-webkit-touch-callout:none] [@media(pointer:coarse)]:select-none";

/** Where the hold fired, for a gesture that has to pick its own finger out of a multi-touch (`REQUIREMENTS.md § 10.`). */
export type LongPressPoint = { x: number; y: number };

export type LongPressOptions = {
  /** DESIGN.md § 3.2. Off where the pointer equivalent is a control of its own rather than this gesture, so right-click keeps the browser's own menu. */
  withContextMenu?: boolean;
  /** DESIGN.md § 3.2. Called the moment the hold wins, so a gesture the same finger could still complete is taken out of the running. */
  onFire?: () => void;
};

/**
 * DESIGN.md § 3.2. Touch holds the element; a mouse right-clicks it. Both open
 * the same action sheet, so the long-press affordance is never mouse-inaccessible.
 *
 * WARN: The handlers belong on the held element itself or on an ancestor of
 * whatever is clickable inside it — `onClickCapture` is what stops the tap the
 * release ends in, and it only reaches a target it is above.
 */
export function useLongPress(
  onLongPress: Optional<(point: LongPressPoint) => void>,
  { withContextMenu = true, onFire }: LongPressOptions = {},
) {
  const timerRef = useRef<Optional<ReturnType<typeof setTimeout>>>(undefined);
  const startRef = useRef<Nullable<LongPressPoint>>(null);
  const hasFiredRef = useRef(false);

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current);
    startRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  return {
    // WARN: A mouse must not arm the timer — the bubble is `select-text`, so press-and-drag to select would open the sheet mid-selection. The mouse affordance is `onContextMenu`.
    onPointerDown: (event: PointerEvent) => {
      // WARN: Only a pointer that could arm the timer may clear the flag, and only after it has been established that it is one. A second finger landing while the sheet is open is not a new gesture — clearing on it releases the `click` the first finger's release still owes, and the tap lands on whatever is under the sheet.
      if (!onLongPress || !event.isPrimary || event.pointerType === "mouse") {
        return;
      }

      // WARN: Cleared here rather than only in the click capture — a `pointercancel` is followed by no `click` at all, so a flag left standing would swallow the next genuine tap.
      hasFiredRef.current = false;
      startRef.current = { x: event.clientX, y: event.clientY };
      timerRef.current = setTimeout(fire, LONG_PRESS_DELAY);
    },
    onPointerMove: (event: PointerEvent) => {
      const start = startRef.current;

      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= GESTURE_SLOP) {
        cancel();
      }
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    // INFO: Scrolling the list steals the pointer, which fires this — without it a swipe past a bubble would open the sheet.
    onPointerCancel: cancel,
    // WARN: The finger is still down when the hold fires, so the release still ends in a `click` — without this, holding a photo opens the viewer underneath the sheet the hold just opened.
    onClickCapture: (event: MouseEvent) => {
      if (hasFiredRef.current) {
        hasFiredRef.current = false;
        event.stopPropagation();
        event.preventDefault();
      }
    },
    onContextMenu: (event: MouseEvent) => {
      if (!onLongPress || !withContextMenu) {
        return;
      }

      event.preventDefault();
      cancel();
      onLongPress({ x: event.clientX, y: event.clientY });
    },
  };

  function fire() {
    const start = startRef.current;

    if (!start) {
      return;
    }

    hasFiredRef.current = true;
    // WARN: Before the sheet opens, not after. The finger is still down and still owns whatever gesture it shares the element with — on a bubble that is the § 8.10. pull, which would otherwise go on tracking behind the sheet and reply on release.
    onFire?.();
    onLongPress?.(start);
  }
}
