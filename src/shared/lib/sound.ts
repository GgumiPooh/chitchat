"use client";

import { useEffect } from "react";
import type { Nullable } from "./nullish";
import { safelyRun } from "./run/safely";

// INFO: One element for the whole page: a second sound cuts the first off instead of layering over it, and the gesture that approves this element approves every sound that follows.
let player: Nullable<HTMLAudioElement> = null;

let isUnlocked = false;

/**
 * Hands the shared player the user gesture a browser requires before code may
 * start it.
 *
 * WARN: Must run synchronously inside a real gesture handler — iOS approves the
 * element from that call stack alone, and what it approves is the element, not
 * the source, which is why there is exactly one of them.
 */
export function unlockSound(): void {
  if (isUnlocked) {
    return;
  }

  isUnlocked = true;
  // WARN: `load()` rather than `play()` — an element with no source rejects `play()`, and a rejected call approves nothing.
  safelyRun(() => getPlayer().load());
}

/** Plays `src`, cutting off whatever the shared player was playing. */
export function playSound(src: string): void {
  const audio = getPlayer();

  audio.src = src;
  // INFO: A rejection is the expected outcome on a page that has never seen a gesture, and a sound that does not play is not worth surfacing.
  void audio.play().catch(() => undefined);
}

/** Arms `unlockSound` on the first gesture anywhere in the page. */
export function useSoundUnlock(): void {
  useEffect(() => {
    // INFO: Capture phase, so a handler that stops propagation cannot swallow the one gesture this is waiting for.
    const options = { once: true, capture: true } as const;

    document.addEventListener("pointerdown", unlockSound, options);
    document.addEventListener("keydown", unlockSound, options);

    return () => {
      document.removeEventListener("pointerdown", unlockSound, options);
      document.removeEventListener("keydown", unlockSound, options);
    };
  }, []);
}

function getPlayer(): HTMLAudioElement {
  player ??= new Audio();

  return player;
}
