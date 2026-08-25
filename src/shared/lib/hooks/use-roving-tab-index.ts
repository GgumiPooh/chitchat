"use client";

import { useCallback, type KeyboardEvent } from "react";

export type RovingTabIndexOptions = {
  orientation: "horizontal" | "vertical";
  /** Matched against the composite's own root — `data-*` rather than a ref list, since `Link` forwards none. */
  selector: string;
};

/**
 * REQUIREMENTS.md § 8.14. Roving tabindex for a composite of buttons or links —
 * Arrow keys step through `selector`'s matches in DOM order and wrap, Home/End jump
 * to the ends, and a Hangul syllable still settling owns the keystroke instead.
 */
export function useRovingTabIndex({ orientation, selector }: RovingTabIndexOptions) {
  const forwardKey = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
  const backwardKey = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";

  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.nativeEvent.isComposing) {
        return;
      }

      const items = [...event.currentTarget.querySelectorAll<HTMLElement>(selector)];
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);

      let nextIndex: number;

      switch (event.key) {
        case forwardKey:
          nextIndex =
            currentIndex === -1 || currentIndex === items.length - 1 ? 0 : currentIndex + 1;
          break;
        case backwardKey:
          nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = items.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      items[nextIndex]?.focus();
    },
    [forwardKey, backwardKey, selector],
  );
}
