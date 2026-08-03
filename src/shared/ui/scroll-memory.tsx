"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// INFO: Module scope, not `sessionStorage` — a tab switch is a client navigation, so the map outlives it and a reload is meant to start at the top.
const scrollPositions = new Map<string, number>();

/**
 * Restores the document scroll position per route (`REQUIREMENTS.md § 7.`).
 * The chat screen scrolls inside the virtualizer rather than the document, so it
 * restores through Virtuoso's `restoreStateFrom` instead (`REQUIREMENTS.md § 8.3.`).
 */
export function ScrollMemory() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) {
      return;
    }

    let isRestored = false;

    // WARN: The App Router scrolls to top on navigation, so restoring has to wait a frame or it is immediately overwritten.
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, scrollPositions.get(pathname) ?? 0);
      isRestored = true;
    });

    // WARN: That scroll-to-top dispatches a `scroll` event of its own, so recording before the restore would overwrite the saved position with 0.
    const remember = () => {
      if (isRestored) {
        scrollPositions.set(pathname, window.scrollY);
      }
    };

    window.addEventListener("scroll", remember, { passive: true });

    // WARN: Never record on cleanup — it runs in the passive phase, after the App Router has already scrolled the document to top.
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", remember);
    };
  }, [pathname]);

  return null;
}
