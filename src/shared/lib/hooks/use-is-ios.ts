"use client";

import { useSyncExternalStore } from "react";
import { isBrowser } from "../dom/environment";

/**
 * Whether this is an iOS/iPadOS engine.
 *
 * INFO: REQUIREMENTS.md § 10. The one platform where a `Content-Disposition`
 * download cannot reach the photo library, so it is the one that has to be told
 * apart. Named for the exception rather than for everything else, or every future
 * platform would default into the branch built for this one.
 *
 * WARN: User-agent sniffing, deliberately. Nothing exposes "does a download land
 * somewhere the user can find it", so there is no feature to detect — and the
 * consequence of guessing wrong is a save the user cannot locate.
 *
 * WARN: iPadOS 13+ reports a Macintosh user agent, so touch points are what
 * separate it from a desktop Mac.
 */
export function isIos(): boolean {
  if (!isBrowser()) {
    return false;
  }

  const { maxTouchPoints, userAgent } = window.navigator;

  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

// INFO: The value never changes for the life of the document, so there is nothing to subscribe to.
const subscribe = () => () => {};

/**
 * `isIos` as a hook.
 *
 * WARN: Read through `useSyncExternalStore` rather than an effect, because this
 * one gates which controls render (`REQUIREMENTS.md § 10.`). An effect-backed
 * media query reports its default for one painted frame, which would flash the
 * withheld control in and then take it away.
 */
export function useIsIos(): boolean {
  return useSyncExternalStore(subscribe, isIos, () => false);
}
