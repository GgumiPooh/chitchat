"use client";

import { useEffect } from "react";

const HEIGHT_PROPERTY = "--viewport-height";
const TOP_PROPERTY = "--viewport-top";

/**
 * Mirrors the visual viewport onto the root element so the app shell can size
 * itself to what is actually visible while the on-screen keyboard is up
 * (DESIGN.md § 3.4.). `--viewport-width` and the left/right offsets are not
 * synced: zooming is off (`maximumScale: 1`), so they never leave their resting
 * values.
 */
export function VisualViewportSync() {
  useEffect(() => {
    const viewport = window.visualViewport;

    if (!viewport) {
      return;
    }

    const root = document.documentElement;
    let frame = 0;

    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);

    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      root.style.removeProperty(HEIGHT_PROPERTY);
      root.style.removeProperty(TOP_PROPERTY);
    };

    // INFO: The keyboard animates open over several frames, and each one fires both events — coalescing keeps the shell to one resize per frame.
    function sync() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(write);
    }

    function write() {
      const { height, offsetTop } = viewport as VisualViewport;

      root.style.setProperty(HEIGHT_PROPERTY, `${height}px`);
      root.style.setProperty(TOP_PROPERTY, `${offsetTop}px`);

      // WARN: WebKit pans the document to reveal the focused field before the shell has resized; left in place that pan carries the header out of the visual viewport, which is the bug this component exists to fix.
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    }
  }, []);

  return null;
}
