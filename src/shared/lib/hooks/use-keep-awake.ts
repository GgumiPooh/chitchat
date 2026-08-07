"use client";

import { useEffect } from "react";
import { OPEN_OVERLAY_SELECTOR } from "./use-modal-overlay";

let holders = 0;

/**
 * REQUIREMENTS.md § 8.4.1. Holds the realtime stream awake for as long as the
 * caller is mounted with `isActive`, for work the idle timer cannot see: a task
 * that is entirely hands-off produces no `pointerdown` and no `keydown`, and would
 * otherwise be covered by the 절전 모드 overlay while it is still running.
 */
export function useKeepAwake(isActive: boolean): void {
  useEffect(() => {
    if (!isActive) {
      return;
    }

    holders += 1;

    return () => {
      holders -= 1;
    };
  }, [isActive]);
}

/**
 * REQUIREMENTS.md § 8.4.1. Holds the app awake for work that outlives the
 * component that started it, until the returned release is called. § 8.5.'s
 * delivery queue is the case: it survives routing away, and `useKeepAwake` drops
 * its hold at unmount.
 *
 * WARN: Release it from a `finally`. Dormancy also closes the request gate, so a
 * hold left standing does not merely keep the stream open — it is the only thing
 * between the user and an app that never sleeps again.
 */
export function holdAwake(): () => void {
  holders += 1;

  let isReleased = false;

  // WARN: Idempotent, because `holders` is a bare counter — a release called twice would let a later hold read as already free and drop the overlay onto a task still running.
  return () => {
    if (isReleased) {
      return;
    }

    isReleased = true;
    holders -= 1;
  };
}

/**
 * REQUIREMENTS.md § 8.4.1. Whether something on screen is mid-task and must not be
 * covered.
 *
 * INFO: Playback is read off the elements rather than registered by hand — every
 * `<video>` and `<audio>` in the app answers this without being wired to it, and a
 * new one cannot forget to.
 *
 * WARN: An open overlay counts. `Dialog` and `Drawer` portal to `body` at `z-50`,
 * so they paint over anything `ShellOverlay` puts inside the shell — a dormancy
 * raised underneath one would leave the sheet live over an app that believes it is
 * asleep, and the user's first click would only close the sheet.
 */
export function isBusy(): boolean {
  if (holders > 0 || document.querySelector(OPEN_OVERLAY_SELECTOR) !== null) {
    return true;
  }

  return [...document.querySelectorAll<HTMLMediaElement>("video, audio")].some(
    (element) => !element.paused && !element.ended,
  );
}
