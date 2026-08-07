"use client";

import { useEffect } from "react";

// INFO: REQUIREMENTS.md § 8.4.1. What an open sheet, dialog or full-screen viewer looks like from outside the component that raised it — the same selector `MediaViewer` and § 12.3.'s profile screen already dismiss against.
const OPEN_OVERLAY_SELECTOR = '[role="dialog"][data-state="open"], [data-media-viewer]';

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
