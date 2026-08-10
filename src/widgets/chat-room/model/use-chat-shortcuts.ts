"use client";

import { OPEN_OVERLAY_SELECTOR, isCommandKey } from "@/shared/lib";
import { useEffect, useRef } from "react";

export type ChatShortcuts = {
  /** `Escape` — the way back to the composer from anywhere in the conversation. */
  onReturnToComposer: () => void;
  /** `⌘↓` — REQUIREMENTS.md § 6.7.'s pill, as a key. */
  onGoToNewest: () => void;
  /** `⌘/` — the sheet that says what the other keys are. */
  onShowShortcuts: () => void;
};

/**
 * REQUIREMENTS.md § 8.14. The three shortcuts that belong to the room rather than to
 * one control inside it, so they answer wherever focus happens to be — including
 * nowhere, which is where a tap on a bubble leaves it.
 *
 * WARN: `⌘E` is deliberately **not** here. It means "search these emoticons" inside
 * the picker and "search for the word I typed" in the composer, and a room-level
 * listener could only pick one — which, from the picker's own field, would wipe what
 * the user had typed into it.
 */
export function useChatShortcuts(shortcuts: ChatShortcuts) {
  const handlers = useRef(shortcuts);

  // INFO: Held in a ref so the listener binds once. Every caller passes fresh arrows, and re-binding on them would re-subscribe on every message that arrives.
  useEffect(() => {
    handlers.current = shortcuts;
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // WARN: The cheapest test first, and that ordering is the point — this runs on every keystroke typed into the composer, and the DOM query below must not.
      if (!isOwnedKey(event) || event.defaultPrevented || event.isComposing) {
        return;
      }

      // WARN: § 8.4.1. An overlay above the room owns the keyboard while it is up — a sheet, a dialog, or one of the hand-rolled screens `useModalOverlay` marks. `Escape` there is its own dismissal, and answering it here would take the room's panel down underneath it.
      if (document.querySelector(OPEN_OVERLAY_SELECTOR)) {
        return;
      }

      if (event.key === "Escape") {
        handlers.current.onReturnToComposer();

        return;
      }

      event.preventDefault();

      if (event.key === "ArrowDown") {
        handlers.current.onGoToNewest();
      } else {
        handlers.current.onShowShortcuts();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}

/**
 * INFO: `Escape` is unmodified, which is what makes it the one key here a text field
 * has no use for — every other binding takes the platform's shortcut modifier.
 *
 * WARN: § 8.14. `⌘↓` is claimed **inside** the composer too, where WebKit spends it
 * moving the caret to the end of the draft. That is a near-nothing in a field capped
 * at five lines, and the composer is the one place this shortcut has to work from.
 */
function isOwnedKey(event: KeyboardEvent): boolean {
  if (event.key === "Escape") {
    return true;
  }

  return isCommandKey(event) && (event.key === "ArrowDown" || event.key === "/");
}
