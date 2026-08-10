"use client";

import { SSE_SYNC_COALESCE_WINDOW } from "@/shared/config";
import { useEffect, useRef } from "react";
import { dismissDeliveredNotifications } from "./push-registration";

/**
 * REQUIREMENTS.md § 16.1. Clears Notification Center whenever the user enters the
 * app, so the banners they were alerted with do not outlive the reading of them.
 *
 * WARN: Not the mount alone. An installed iOS PWA is resumed rather than reloaded
 * (§ 15.1.), so the launch every banner accumulated for is one a mount effect runs
 * on exactly once and never again for the life of the process.
 *
 * WARN: Deliberately **not** gated on § 8.4.1.'s dormancy, where `calendar-page`
 * gates the same shape. A departure enters dormancy, so nearly every return is a
 * dormant one — and the wake that would re-arm the sweep is a context this slice
 * cannot reach without a cross-import, which would leave the sweep skipped on the
 * exact resume it exists for. Returning into 절전 모드 is still entering the app: the
 * badge and the room carry the unread state the banners were standing in for.
 */
export function useNotificationSweep() {
  const lastSweptAt = useRef(0);

  useEffect(() => {
    sweepWhenVisible();

    // INFO: § 8.4. One iOS resume produces some subset of these and the codebase does not rely on which; `focus` is the only one a desktop window raised from behind another fires at all, since it never stopped being `visible`.
    document.addEventListener("visibilitychange", sweepWhenVisible);
    window.addEventListener("focus", sweepWhenVisible);
    window.addEventListener("pageshow", sweepWhenVisible);

    return () => {
      document.removeEventListener("visibilitychange", sweepWhenVisible);
      window.removeEventListener("focus", sweepWhenVisible);
      window.removeEventListener("pageshow", sweepWhenVisible);
    };

    function sweepWhenVisible() {
      // WARN: The mount call goes through this too. A tab restored in the background starts `hidden` and fires no `visibilitychange` until it is first viewed (§ 8.4.1.), so sweeping on mount unguarded would clear the banners of a user who has not arrived — and both events below fire on the way out as well, which is the one moment the banners must stay.
      if (document.visibilityState !== "visible") {
        return;
      }

      const now = Date.now();

      // WARN: § 8.4. Coalesced for the reason the stream's catch-up is: one return fires several of the three listeners above, and two sweeps racing the same list is two `close()` calls per banner.
      if (now - lastSweptAt.current < SSE_SYNC_COALESCE_WINDOW) {
        return;
      }

      lastSweptAt.current = now;
      void dismissDeliveredNotifications();
    }
  }, []);
}
