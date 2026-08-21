"use client";

import { useIsomorphicLayoutEffect } from "./use-isomorphic-layout-effect";

/**
 * DESIGN.md § 3.3. Paints `body` — the colour iOS 26 Safari tints its chrome from — for
 * as long as the caller is mounted, and hands it back to the stylesheet on unmount.
 */
export function useDocumentBackground(color: string): void {
  useIsomorphicLayoutEffect(() => {
    document.body.style.backgroundColor = color;

    return () => {
      document.body.style.removeProperty("background-color");
    };
  }, [color]);
}
