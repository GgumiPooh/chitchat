"use client";

import { useEffect } from "react";

const HEIGHT_PROPERTY = "--viewport-height";
const TOP_PROPERTY = "--viewport-top";
const BOTTOM_PROPERTY = "--viewport-bottom";
const LAYOUT_HEIGHT_PROPERTY = "--layout-viewport-height";

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
      root.style.removeProperty(BOTTOM_PROPERTY);
      root.style.removeProperty(LAYOUT_HEIGHT_PROPERTY);
    };

    // INFO: The keyboard animates open over several frames, and each one fires both events — coalescing keeps the shell to one resize per frame.
    function sync() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(write);
    }

    function write() {
      const { height, offsetTop } = viewport as VisualViewport;
      const layoutHeight = root.clientHeight;

      root.style.setProperty(HEIGHT_PROPERTY, `${height}px`);
      root.style.setProperty(TOP_PROPERTY, `${offsetTop}px`);
      // INFO: DESIGN.md § 3.4. What a portalled overlay needs: a `fixed` box outside the shell resolves `bottom` against the layout viewport, which the keyboard never shrinks.
      root.style.setProperty(
        BOTTOM_PROPERTY,
        `${Math.max(layoutHeight - offsetTop - height, 0)}px`,
      );
      // INFO: DESIGN.md § 3.4. The same layout viewport, published for what must *not* follow the keyboard — a full-bleed photo behind the shell's content, which would otherwise re-crop itself every frame the keyboard slides (REQUIREMENTS.md § 12.2.).
      root.style.setProperty(LAYOUT_HEIGHT_PROPERTY, `${layoutHeight}px`);

      // WARN: WebKit pans the document to reveal the focused field before the shell has resized; left in place that pan carries the header out of the visual viewport, which is the bug this component exists to fix.
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    }
  }, []);

  return null;
}
