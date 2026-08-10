"use client";

import {
  OPEN_OVERLAY_SELECTOR,
  isBareKey,
  isCommandKey,
  isDormant,
  isLetterKey,
} from "@/shared/lib";
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
  /** `Escape`, and `Enter` off any control — the way back to the composer from anywhere in the conversation. */
  onReturnToComposer: () => void;
  /** `⌘↓` — REQUIREMENTS.md § 6.7.'s pill, as a key. */
  onGoToNewest: () => void;
  /** `⌘/` — the sheet that says what the other keys are. */
  onShowShortcuts: () => void;
  /** `⌘E` with focus on neither the composer nor the picker, both of which answer it themselves. */
  onOpenEmoticonSearch: () => void;
};

/**
 * REQUIREMENTS.md § 8.14. The shortcuts that belong to the room rather than to one
 * control inside it, so they answer wherever focus happens to be — including nowhere,
 * which is where a click on a bubble leaves it.
 *
 * WARN: `⌘E` is here **last**, behind both of the handlers that mean something more
 * specific by it: the composer seeds the search with the word it has underlined, and
 * the picker asks for its own 검색 tab. Answered here first, from the panel's own
 * field, it would wipe whatever the user had typed into it — so this is the fallback
 * for the case neither of them is focused, and it depends on both calling
 * `preventDefault`.
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

      if (event.key === "Escape" || event.key === "Enter") {
        // WARN: § 8.14. Prevented for `Enter` alone, and it is not belt-and-braces. The focus lands a microtask later, and the default action of this keydown is still pending — unprevented it puts a newline into the field the moment it arrives.
        if (event.key === "Enter") {
          event.preventDefault();
        }

        handlers.current.onReturnToComposer();

        return;
      }

      event.preventDefault();

      if (event.key === "ArrowDown") {
        handlers.current.onGoToNewest();
      } else if (event.key === "/") {
        handlers.current.onShowShortcuts();
      } else {
        // WARN: § 8.14. Only reached where neither the composer nor the picker answered `⌘E` first. Both `preventDefault` when they do, and both are React handlers on the root container — which is inside `document`, so they have already run by the time this listener sees the event.
        handlers.current.onOpenEmoticonSearch();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}

/**
 * INFO: `Escape` and `Enter` are the two bindings a text field has no use for from
 * *outside* one, which is why they are the two that take no modifier — and `isBareKey`
 * is what holds them to that. `⌥Esc` and `Ctrl+Esc` are OS chords, and answering one
 * closes the panel on the way out of the app, which is the class of thing § 8.4.1.'s
 * `isTypingKey` filters modifiers for.
 *
 * WARN: § 8.14. `Enter` is claimed **only where nothing has focus**. A focused control
 * spends it activating itself — a cell stages an emoticon (§ 13.6.), a tab opens, the
 * send disc sends — and a field that already has the caret has no use for a shortcut
 * that would fetch it. What is left is a conversation the reader clicked into, which
 * is exactly the case this answers.
 *
 * WARN: § 8.14. `⌘↓` is claimed **inside** the composer too, where WebKit spends it
 * moving the caret to the end of the draft. That is a near-nothing in a field capped
 * at five lines, and the composer is the one place this shortcut has to work from.
 */
function isOwnedKey(event: KeyboardEvent): boolean {
  if (event.key === "Escape") {
    return isBareKey(event);
  }

  if (event.key === "Enter") {
    return isBareKey(event) && !hasFocusedControl();
  }

  return (
    isCommandKey(event) &&
    (event.key === "ArrowDown" || event.key === "/" || isLetterKey(event, "e"))
  );
}

// INFO: § 8.14. `<body>` is where focus sits after a click on a bubble, on the wallpaper, or on anything else the conversation is made of.
function hasFocusedControl(): boolean {
  const active = document.activeElement;

  return active !== null && active !== document.body && active !== document.documentElement;
}
