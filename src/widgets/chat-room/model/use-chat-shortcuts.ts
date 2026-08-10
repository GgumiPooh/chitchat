"use client";

import { OPEN_OVERLAY_SELECTOR, isBareKey, isCommandKey, isDormant } from "@/shared/lib";
import { useEffect, useRef } from "react";

export type ChatShortcuts = {
  /**
   * Whether something is covering the room that this listener cannot see.
   *
   * WARN: REQUIREMENTS.md § 8.14. `OPEN_OVERLAY_SELECTOR` answers for Radix, Vaul and
   * the two screens `useModalOverlay` marks, and for nothing else — `MediaEditor`,
   * `VideoTrimmer` and § 8.6.'s results list are all plain `ShellOverlay` children
   * with no marker of their own. Left unsaid, `Escape` pulls the caret into a composer
   * behind the crop editor and raises the keyboard into a field nobody can see.
   */
  isCovered: boolean;
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
      // WARN: The cheapest test first, and that ordering is the point — this runs on every keystroke typed into the composer, and the two reads below must not.
      if (!isOwnedKey(event) || event.defaultPrevented || event.isComposing) {
        return;
      }

      // WARN: § 8.4.1. 절전 모드 takes focus on mount precisely so keystrokes cannot reach the composer behind it, and answering `Escape` here would hand that focus straight back. Read at the keystroke rather than passed in, because the flag is module state that no render observes.
      if (handlers.current.isCovered || isDormant()) {
        return;
      }

      // WARN: § 8.4.1. An overlay above the room owns the keyboard while it is up — a sheet, a dialog, or one of the two screens `useModalOverlay` marks. `Escape` there is its own dismissal, and answering it here would take the room's panel down underneath it.
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
 * INFO: `Escape` is the one binding here a text field has no use for, which is why it
 * is the one that takes no modifier — and `isBareKey` is what holds it to that. `⌥Esc`
 * and `Ctrl+Esc` are OS chords, and answering one closes the panel on the way out of
 * the app, which is the class of thing § 8.4.1.'s `isTypingKey` filters modifiers for.
 *
 * WARN: § 8.14. `⌘↓` is claimed **inside** the composer too, where WebKit spends it
 * moving the caret to the end of the draft. That is a near-nothing in a field capped
 * at five lines, and the composer is the one place this shortcut has to work from.
 */
function isOwnedKey(event: KeyboardEvent): boolean {
  if (event.key === "Escape") {
    return isBareKey(event);
  }

  return isCommandKey(event) && (event.key === "ArrowDown" || event.key === "/");
}
