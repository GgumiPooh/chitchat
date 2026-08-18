"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { A_SECOND } from "../date/time";
import type { Optional } from "../nullish";

/**
 * WARN: A GIF's own Netscape loop extension, or an animated WebP/APNG's own loop
 * count, is what an `<img>` actually loops by — there is no runtime API to make one
 * play forever, and not every authored asset is encoded to. A picker grid that wants
 * a mini playing for as long as it is on screen has to fake it by remounting on a
 * timer, which is what `useViewportReplay`'s `loopIntervalMs` does. Picked short
 * enough that a finite-loop asset never visibly freezes, and long enough that an
 * infinite one is never cut mid-loop often enough to read as a stutter.
 */
export const MINI_ANIMATION_LOOP_INTERVAL = 6 * A_SECOND;

/**
 * A token that bumps whenever the observed element re-enters the viewport, plus
 * a `replay` a caller can call by hand (a tap). A consumer keys a GIF/APNG/
 * animated-WebP `<img>` by it to restart the loop — reassigning `src` is a cache
 * no-op, and only a fresh element replays.
 *
 * INFO: The first inView never bumps — the browser is already mid-first-loop from
 * load, and bumping on mount would only remount the element a frame later for nothing.
 *
 * @param loopIntervalMs While the element is in view, also bump on this fixed
 * interval — for a grid that wants a mini playing continuously rather than only
 * restarting on tap or on re-entry. Omitted, this is view-entry (and tap) only.
 */
export function useViewportReplay(loopIntervalMs?: number) {
  const [replayToken, setReplayToken] = useState(0);
  const { ref, inView } = useInView();
  const wasInView = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    if (wasInView.current !== undefined && inView && !wasInView.current) {
      setReplayToken((token) => token + 1);
    }
    wasInView.current = inView;
  }, [inView]);

  useEffect(() => {
    if (!loopIntervalMs || !inView) {
      return;
    }

    const id = setInterval(() => setReplayToken((token) => token + 1), loopIntervalMs);

    return () => clearInterval(id);
  }, [inView, loopIntervalMs]);

  return { ref, replayToken, replay: () => setReplayToken((token) => token + 1) };
}

/**
 * Folds a replay token into an emoticon asset URL, for a consumer to pass as `src`
 * alongside keying its `<img>` by the same token.
 *
 * WARN: iOS Safari — including an installed PWA — ties an animated GIF/WebP/APNG's
 * decode and its running loop to the **request URL**, not to the `<img>` element: a
 * fresh element pointed at the identical `src` picks up whatever frame that shared
 * timeline already sits on rather than restarting, so the remount alone (which is
 * all other browsers need) is silently a no-op there. Folding the token into the
 * URL gives Safari a genuinely different resource to load. It costs nothing extra
 * downstream — REQUIREMENTS.md § 13.3.'s presigned redirect is quantised to a
 * signing window, so the same immutable R2 URL comes back and the browser's own
 * cache answers it; only the asset route's redirect (a session check and a row
 * read) is repeated.
 */
export function toReplaySrc(src: string, replayToken: number): string {
  if (replayToken === 0) {
    return src;
  }

  return `${src}${src.includes("?") ? "&" : "?"}replay=${replayToken}`;
}

/**
 * The previous replay's URL, for a caller to pass as `PreloadImage`'s `previewSrc`
 * so the frame it already decoded stands in for the one a replay remount is
 * decoding, instead of the skeleton.
 *
 * WARN: That previous URL is what the browser just finished painting as the
 * element this replaced — its own cache answers this one at once, which is the
 * whole reason it stands in cleanly rather than triggering a load of its own.
 */
export function toPreviousReplaySrc(src: string, replayToken: number): Optional<string> {
  return replayToken > 0 ? toReplaySrc(src, replayToken - 1) : undefined;
}
