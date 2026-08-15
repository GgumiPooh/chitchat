"use client";

import {
  OPEN_OVERLAY_SELECTOR,
  isAltKey,
  isBareKey,
  isCommandKey,
  isCommandShiftKey,
  isDormantVisible,
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
  /**
   * `Escape` — one layer off the composer's stack, and the caret back in it.
   *
   * WARN: REQUIREMENTS.md § 8.14. Held apart from `onFocusComposer` although both end
   * with the caret in the field. `Escape` **discards** something on the way — an open
   * panel, then a staged emoticon — and `Enter` must never do that: it is pressed by
   * someone who wants to start typing, not to throw away what they staged.
   */
  onEscape: () => void;
  /** `Enter` off any control — the caret to the composer, and nothing else. */
  onFocusComposer: () => void;
  /** `⌘↓` — REQUIREMENTS.md § 6.7.'s pill, as a key. */
  onGoToNewest: () => void;
  /** `⌘/` — the sheet that says what the other keys are. */
  onShowShortcuts: () => void;
  /** `⌘E` — REQUIREMENTS.md § 13.6.'s panel, opened on the tab it was last left on, or closed. */
  onToggleEmoticonPanel: () => void;
  /** `⌘⇧E` with focus on neither the composer nor the picker, both of which answer it themselves. */
  onOpenEmoticonSearch: () => void;
  /** `⌥↑` / `⌥↓` — the conversation, a step at a time. `-1` is towards older messages. */
  onScrollHistory: (direction: -1 | 1) => void;
};

/**
 * REQUIREMENTS.md § 8.14. The shortcuts that belong to the room rather than to one
 * control inside it, so they answer wherever focus happens to be — including nowhere,
 * which is where a click on a bubble leaves it.
 *
 * WARN: `⌘⇧E` is here **last**, behind the one handler that means something more
 * specific by it: the composer seeds the search with the word it has underlined and
 * `preventDefault`s, being a React handler on the root container, which is inside
 * `document`. Answered here first it would ignore that word — so this is the fallback
 * for every press the composer does not claim.
 *
 * INFO: `EmoticonPicker` answers neither key, having answered both at first. Both
 * **toggle**, and what each toggles — whether the panel is open, and whether 검색 is
 * the tab on screen — is this room's state, so a copy in the panel could only ever
 * open and never close.
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
      if (handlers.current.isCovered || isDormantVisible()) {
        return;
      }

      // WARN: § 8.4.1. An overlay above the room owns the keyboard while it is up — a sheet, a dialog, or one of the two screens `useModalOverlay` marks. `Escape` there is its own dismissal, and answering it here would take the room's panel down underneath it.
      if (document.querySelector(OPEN_OVERLAY_SELECTOR)) {
        return;
      }

      if (event.key === "Escape") {
        handlers.current.onEscape();

        return;
      }

      // WARN: § 8.14. Prevented, and it is not belt-and-braces. The focus lands a microtask later, and the default action of this keydown is still pending — unprevented it puts a newline into the field the moment it arrives.
      event.preventDefault();

      if (isAltKey(event)) {
        handlers.current.onScrollHistory(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Enter") {
        handlers.current.onFocusComposer();
      } else if (event.key === "ArrowDown") {
        handlers.current.onGoToNewest();
      } else if (event.key === "/") {
        handlers.current.onShowShortcuts();
      } else if (isCommandKey(event)) {
        handlers.current.onToggleEmoticonPanel();
      } else {
        // WARN: § 8.14. Only reached where neither the composer nor the picker answered `⌘⇧E` first. Both `preventDefault` when they do, and both are React handlers on the root container — which is inside `document`, so they have already run by the time this listener sees the event.
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

  // INFO: § 8.14. `⌘E` opens the panel and `⌘⇧E` opens its search — the `⌘F`/`⌘⇧F` idiom, where `Shift` spells the more specific of the pair.
  if (isLetterKey(event, "e")) {
    return isCommandKey(event) || isCommandShiftKey(event);
  }

  // INFO: § 8.14. `⌥`/`Alt` is the one modifier that needs no platform branch — the same physical key and the same flag on both — so the scroll is one binding rather than a pair.
  if (event.key === "ArrowUp") {
    return isAltKey(event);
  }

  if (event.key === "ArrowDown") {
    return isAltKey(event) || isCommandKey(event);
  }

  return isCommandKey(event) && event.key === "/";
}

// INFO: § 8.14. `<body>` is where focus sits after a click on a bubble, on the wallpaper, or on anything else the conversation is made of.
function hasFocusedControl(): boolean {
  const active = document.activeElement;

  return active !== null && active !== document.body && active !== document.documentElement;
}
