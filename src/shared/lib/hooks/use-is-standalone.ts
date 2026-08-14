"use client";

import { useSyncExternalStore } from "react";
import { isBrowser } from "../dom/environment";

/**
 * Whether the app is running installed rather than in a browser tab.
 *
 * WARN: iOS below 16.4 answers `display-mode` nowhere, so `navigator.standalone`
 * is the only reading there — the two together, never either alone.
 */
export function isStandalone(): boolean {
  if (!isBrowser()) {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// INFO: An installed document is never handed back to a browser tab, so there is nothing to subscribe to.
const subscribe = () => () => {};

/**
 * `isStandalone` as a hook.
 *
 * WARN: Read through `useSyncExternalStore` for `useIsIos`'s reason — it gates what
 * is rendered (`REQUIREMENTS.md § 8.14.`), and an effect-backed read paints its
 * default for one frame and then takes the answer away.
 */
export function useIsStandalone(): boolean {
  return useSyncExternalStore(subscribe, isStandalone, () => false);
}
