"use client";

import { useEffect } from "react";

/**
 * Runs `onRestore` when the browser serves this document back out of its
 * back/forward cache, rather than loading it again.
 *
 * A restore replays no render and refetches nothing — the page comes back frozen
 * exactly as it was left, server data and all. Any screen whose content can be
 * changed by somewhere the user went needs this, and § 13.7.'s zone crossing is
 * the case in the app: 이모티콘 관리 leaves for another app entirely and comes
 * back to a pack list written before the import it just performed.
 *
 * WARN: `persisted` is the whole signal, and it is not the same question as
 * `visibilitychange` or `focus`. A tab returning from the background fires those
 * and never this; a `pageshow` without `persisted` is an ordinary load, which
 * rendered fresh data on its own and must not be refreshed a second time.
 *
 * WARN: `onRestore` is a dependency, so pass a stable reference — `router.refresh`
 * or a `useCallback`. An inline arrow re-subscribes on every render.
 */
export function useBfcacheRestore(onRestore: () => void): void {
  useEffect(() => {
    window.addEventListener("pageshow", handlePageShow);

    return () => window.removeEventListener("pageshow", handlePageShow);

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        onRestore();
      }
    }
  }, [onRestore]);
}
