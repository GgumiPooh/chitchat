"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { A_SECOND } from "../date/time";

/**
 * WARN: A GIF's own Netscape loop extension, or an animated WebP/APNG's own loop
 * count, is what an `<img>` actually loops by — there is no runtime API to make one
 * play forever, and not every authored asset is encoded to. A picker grid that wants
 * a mini playing for as long as it is on screen has to fake it by remounting on a
 * timer, which is what `useViewportReplay`'s `loopIntervalMs` does. Picked short
 * enough that a finite-loop asset never visibly freezes, and long enough that an
 * infinite one is never cut mid-loop often enough to read as a stutter.
 */
export const MINI_ANIMATION_LOOP_INTERVAL = 3 * A_SECOND;

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
