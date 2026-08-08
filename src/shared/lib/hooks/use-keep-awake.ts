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
 * REQUIREMENTS.md § 8.4.1. Opens an OS file picker with the app held awake across
 * it, and releases the hold on the way back.
 *
 * The picker blurs the window exactly as a departure does, and `isBusy` cannot see
 * it: `ActionSheet` fires the row's action and closes in the same tick, so by the
 * time the OS panel is up there is no open dialog left in the DOM to find. The
 * 절전 모드 overlay was raised behind the picker, and was still standing when the
 * user came back with a photo.
 *
 * INFO: The three events are `useDormancy`'s own definition of a user who is here,
 * and borrowing that definition is the point — each of them re-arms the idle
 * countdown as it passes, so the hold is never dropped onto a deadline that expired
 * while the picker was up.
 *
 * WARN: Deliberately not `change` or `cancel`, which look like the obvious answers
 * and are the wrong ones. Neither tells the countdown anything, and `sleep` has been
 * re-arming at `SSE_BUSY_RECHECK_INTERVAL` against a deadline long past — so a pick
 * that outlasted `SSE_IDLE_TIMEOUT` released the hold into 절전 모드 seconds after
 * the user came back with a photo, which is the bug this exists to prevent.
 *
 * WARN: A hold therefore outlives a picker the user walked away from, until they
 * next touch the app. That is the safe direction of the two — an app awake longer
 * than it should be, rather than one that never sleeps again (`holdAwake`).
 */
export function openFilePicker(input: HTMLInputElement): void {
  const release = holdAwake();

  function finish() {
    window.removeEventListener("focus", finish);
    document.removeEventListener("pointerdown", finish);
    document.removeEventListener("keydown", finish);
    release();
  }

  window.addEventListener("focus", finish);
  document.addEventListener("pointerdown", finish);
  document.addEventListener("keydown", finish);
  input.click();
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
