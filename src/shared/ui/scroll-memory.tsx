"use client";

import { APP_SCROLL_ID } from "@/shared/config";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// INFO: Module scope, not `sessionStorage` — a tab switch is a client navigation, so the map outlives it and a reload is meant to start at the top.
const scrollPositions = new Map<string, number>();

/**
 * Restores the scroll position of the shell's scroll container per route
 * (`REQUIREMENTS.md § 7.`). It is not the document: the document cannot scroll
 * (DESIGN.md § 3.4.). The chat screen scrolls inside the virtualizer instead and
 * restores through Virtuoso's `restoreStateFrom` (`REQUIREMENTS.md § 8.3.`).
 */
export function ScrollMemory() {
  const pathname = usePathname();

  useEffect(() => {
    const scroller = document.getElementById(APP_SCROLL_ID);

    if (!pathname || !scroller) {
      return;
    }

    let isRestored = false;

    // WARN: The App Router scrolls to top on navigation, so restoring has to wait a frame or it is immediately overwritten.
    const frame = requestAnimationFrame(() => {
      scroller.scrollTop = scrollPositions.get(pathname) ?? 0;
      isRestored = true;
    });

    // WARN: That scroll-to-top dispatches a `scroll` event of its own, so recording before the restore would overwrite the saved position with 0.
    const remember = () => {
      if (isRestored) {
        scrollPositions.set(pathname, scroller.scrollTop);
      }
    };

    scroller.addEventListener("scroll", remember, { passive: true });

    // WARN: Never record on cleanup — it runs in the passive phase, after the App Router has already scrolled the container to top.
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", remember);
    };
  }, [pathname]);

  return null;
}
