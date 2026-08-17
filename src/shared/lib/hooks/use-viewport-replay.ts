"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";

/**
 * A token that bumps whenever the observed element re-enters the viewport, plus
 * a `replay` a caller can call by hand (a tap). A consumer keys a GIF/APNG/
 * animated-WebP `<img>` by it to restart the loop — reassigning `src` is a cache
 * no-op, and only a fresh element replays.
 *
 * INFO: The first inView never bumps — the browser is already mid-first-loop from
 * load, and bumping on mount would only remount the element a frame later for nothing.
 */
export function useViewportReplay() {
  const [replayToken, setReplayToken] = useState(0);
  const { ref, inView } = useInView();
  const wasInView = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    if (wasInView.current !== undefined && inView && !wasInView.current) {
      setReplayToken((token) => token + 1);
    }
    wasInView.current = inView;
  }, [inView]);

  return { ref, replayToken, replay: () => setReplayToken((token) => token + 1) };
}
