"use client";

import { EMOTICON_MENUS, type EmoticonMenu } from "@/features/send-message";
import { toTransferFiles } from "@/features/upload-media";
import {
  OPEN_OVERLAY_SELECTOR,
  isAltKey,
  isBareKey,
  isCommandKey,
  isDigitKey,
  isDormantVisible,
  isLetterKey,
  isMenuKey,
  type Optional,
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
   * with the caret in the field. `Escape` **discards** something on the way — a staged
   * emoticon, then an open panel — and `Enter` must never do that: it is pressed by
   * someone who wants to start typing, not to throw away what they staged.
   */
  onEscape: () => void;
  /** `Enter` off any control — the caret to the composer, and nothing else. */
  onFocusComposer: () => void;
  /** `⌘↓` — REQUIREMENTS.md § 6.7.'s pill, as a key. */
  onGoToNewest: () => void;
  /** `⌘/` — the sheet that says what the other keys are. */
  onShowShortcuts: () => void;
  /** `⌃E` — REQUIREMENTS.md § 13.6.'s panel, opened on the tab it was last left on, or closed. */
  onToggleEmoticonPanel: () => void;
  /**
   * REQUIREMENTS.md § 8.14. `⌃1` / `⌃2` / `⌃3`, and `Alt` for the `⌃` off an Apple
   * platform — § 13.6.'s three menus, in the order the bar draws them, opening the panel
   * where it is shut.
   *
   * WARN: These **never close it**. `⌃E` is the one key that does, which is the whole
   * division: one key for whether the panel is on screen, three for which menu it holds.
   * The digit of the menu already open therefore changes no menu — the panel is already
   * there and already on it.
   *
   * WARN: The 검색 digit reaches here only where the composer did not claim it first —
   * it seeds 검색 with the word it has underlined (§ 13.8.), which is the one thing this
   * room cannot do from a keystroke, having no draft.
   */
  onSelectEmoticonMenu: (menu: EmoticonMenu) => void;
  /** `⌥↑` / `⌥↓` — the conversation, a step at a time. `-1` is towards older messages. */
  onScrollHistory: (direction: -1 | 1) => void;
  /**
   * REQUIREMENTS.md § 8.14. A character typed with nothing focused — the caret to the
   * composer, **synchronously**, so the keystroke that asked lands in it.
   *
   * WARN: The one handler here whose event is deliberately *not* prevented. Everything
   * else on this hook answers a chord that has no meaning in a field; this one answers
   * the reader typing a message, and the character is put there by the default action
   * of the same `keydown`. Prevented, the caret would arrive and the letter would not.
   *
   * INFO: Absent where there is no keyboard to type on, which is what keeps this off
   * the phone: a coarse pointer has no keys to strike until something is focused, and
   * a hardware one there reaches the composer through `Enter` as it always did.
   */
  onTypeAhead?: () => void;
  /**
   * REQUIREMENTS.md § 8.14. The clipboard's plain text, pasted with nothing focused.
   *
   * WARN: Text only, and § 9.2.'s file paste is answered ahead of it — a clipboard
   * carrying both is an attachment, and inserting its text half beside the staged file
   * is what `useFilePaste` prevents the default for.
   *
   * WARN: Answers whether it took the text, and the default action is spent on that
   * answer alone. The room refuses a paste it has nowhere to put — no keyboard behind
   * the pointer, or § 13.6. holding the composer away — and a `void` here would leave
   * those refusals looking exactly like a ⌘V the app had swallowed.
   */
  onPasteText?: (text: string) => boolean;
};

/**
 * REQUIREMENTS.md § 8.14. The shortcuts that belong to the room rather than to one
 * control inside it, so they answer wherever focus happens to be — including nowhere,
 * which is where a click on a bubble leaves it.
 *
 * WARN: The 검색 digit is here **last**, behind the one handler that means something more
 * specific by it: the composer seeds 검색 with the word it has underlined and
 * `preventDefault`s, being a React handler on the root container, which is inside
 * `document`. Answered here first it would ignore that word — so this is the fallback
 * for every press the composer does not claim.
 *
 * INFO: `EmoticonPicker` answers none of these, having answered `⌃E` at first. Whether
 * the panel is open is this room's state, so a copy in the panel could only ever open
 * and never close.
 */
export function useChatShortcuts(shortcuts: ChatShortcuts) {
  const handlers = useRef(shortcuts);

  // INFO: Held in a ref so the listener binds once. Every caller passes fresh arrows, and re-binding on them would re-subscribe on every message that arrives.
  useEffect(() => {
    handlers.current = shortcuts;
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }

      const isOwned = isOwnedKey(event);
      // WARN: § 8.14. `hasFocusedControl` before anything else this branch could ask, and that ordering is the point. Every keystroke typed into the composer is a typing key, so this is the read that turns them all away — one `activeElement` lookup, where `isDormantVisible` and the `querySelector` below are what the original ordering was written to keep off the typing path.
      const isTypeAhead = !isOwned && isTypingKey(event) && !hasFocusedControl();

      // WARN: The cheapest test first, and that ordering is the point — this runs on every keystroke typed into the composer, and the two reads below must not.
      if (!isOwned && !isTypeAhead) {
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

      // WARN: § 8.14. Ahead of the `preventDefault` below and returning past it. The default action of this keydown is the character itself, and the whole behaviour is that it lands in the field the handler has just focused.
      if (isTypeAhead) {
        handlers.current.onTypeAhead?.();

        return;
      }

      if (event.key === "Escape") {
        handlers.current.onEscape();

        return;
      }

      // WARN: § 8.14. Prevented, and it is not belt-and-braces. The focus lands a microtask later, and the default action of this keydown is still pending — unprevented it puts a newline into the field the moment it arrives.
      event.preventDefault();

      const menu = toEmoticonMenu(event);

      // WARN: § 8.14. Both `isMenuKey` branches run ahead of `isAltKey`, which off an Apple platform is the very same modifier they carry — that branch reads every key but `ArrowDown` as a step towards older messages, so `Alt+1` and `Alt+E` walk the conversation backwards instead of reaching the panel.
      // WARN: § 8.14. macOS spells them with `⌃` and never reaches that branch, so this ordering is broken only where nobody developing on a Mac will see it — which makes it more load-bearing than when it was broken everywhere, not less.
      if (menu !== undefined) {
        handlers.current.onSelectEmoticonMenu(menu);
      } else if ((isMenuKey(event) || isCommandKey(event)) && isLetterKey(event, "e")) {
        handlers.current.onToggleEmoticonPanel();
      } else if (isAltKey(event)) {
        handlers.current.onScrollHistory(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Enter") {
        handlers.current.onFocusComposer();
      } else if (event.key === "ArrowDown") {
        handlers.current.onGoToNewest();
      } else {
        // INFO: § 8.14. What is left is `⌘/` — `isOwnedKey` admits no other key this far, so a new binding needs a test of its own above rather than a share of this one.
        handlers.current.onShowShortcuts();
      }
    }

    /**
     * REQUIREMENTS.md § 8.14. A paste with nothing focused, which the engine dispatches
     * at `body` — the same case the typing above answers, arriving as a clipboard
     * rather than a character.
     *
     * WARN: The insertion is the caller's, not the default action's. Unlike a keystroke
     * a paste cannot be redirected by focusing inside it: this event was already
     * dispatched at `body`, so its default would insert into `body` however the focus
     * moves, which is nowhere.
     *
     * WARN: § 9.2. Whether the clipboard carries files is the test, and
     * `defaultPrevented` cannot stand in for it. `useFilePaste` prevents such a paste
     * for the express purpose of keeping its text half out of the composer — but it
     * listens on `window` and this listens on `document`, which the paste reaches
     * first, so this would insert that text and only then watch the file be staged
     * beside it.
     *
     * WARN: § 9.2. Asked with `toTransferFiles` and never `clipboardData.files`,
     * because the two disagree and the one that stages is the one that decides. A
     * folder copied in Finder is a `File` in that list and no file at all to
     * `toTransferFiles`, so a clipboard carrying a folder and its name as text would be
     * refused here, staged by nothing there, and read as ⌘V having done nothing.
     *
     * WARN: The default is spent only once the room says it took the text. Prevented
     * ahead of that, a room that answers no paste — the pointer is coarse, or § 13.6.
     * has the composer put away — would have a ⌘V that is dead rather than merely
     * unanswered.
     */
    function handlePaste(event: ClipboardEvent) {
      if (event.defaultPrevented || hasFocusedControl()) {
        return;
      }

      if (handlers.current.isCovered || isDormantVisible()) {
        return;
      }

      if (document.querySelector(OPEN_OVERLAY_SELECTOR)) {
        return;
      }

      const clipboard = event.clipboardData;
      const text =
        clipboard && toTransferFiles(clipboard).length === 0 ? clipboard.getData("text/plain") : "";

      if (text && handlers.current.onPasteText?.(text)) {
        event.preventDefault();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    // WARN: Not `passive`. A passive listener may not `preventDefault`, and the insertion here replaces a default that would go nowhere.
    document.addEventListener("paste", handlePaste);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("paste", handlePaste);
    };
  }, []);
}

/**
 * REQUIREMENTS.md § 8.14. Whether this keystroke would have put a character on
 * screen, which is what the composer is fetched for.
 *
 * WARN: The modifiers are refused rather than ignored — `⌘S`, `Ctrl+R` and `⌥F` are
 * the browser's and the OS's, and a room that swallowed them into a draft would eat
 * every shortcut this app does not define. `Shift` is the exception it has to be: it
 * is how a capital letter is typed.
 *
 * INFO: A one-character `key` is nearly the whole test. Every named key — `Tab`, `F5`,
 * `ArrowLeft`, the modifiers themselves — spells itself out, and none of them types
 * anything.
 *
 * WARN: `Process` is the exception, and it is the one this app's readers type in. An
 * input source that composes reports it in place of the character while it is still
 * deciding what that character is, and `isComposing` cannot stand in for it — there is
 * no composition yet with nothing focused. Turned away here, a room entered in 한글
 * would swallow the first jamo of every message and answer only the Latin ones.
 */
function isTypingKey(event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }

  return event.key.length === 1 || event.key === "Process";
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

  // INFO: § 8.14. `⌃E` opens § 13.6.'s panel and closes it, and it is the only key that closes it — which menu is on screen is the digits' business below.
  // WARN: § 8.14. On `isMenuKey` rather than the platform modifier, and macOS pays for it: `⌃E` is Cocoa's `moveToEndOfParagraph`, so the composer loses line-end. That is the deliberate price of one modifier for the whole panel; `⌃A` is untouched.
  if (isLetterKey(event, "e")) {
    return isMenuKey(event) || isCommandKey(event);
  }

  // INFO: § 8.14. § 13.6.'s menu bar, on the one modifier that can be pressed inside a text field on both platforms — which is not the one `⌥↑`/`⌥↓` scrolls with, and so costs the sheet a second label.
  if (toEmoticonMenu(event) !== undefined) {
    return true;
  }

  // INFO: § 8.14. `⌥`/`Alt` is the one modifier that needs no platform branch — the same physical key and the same flag on both — so the scroll is one binding rather than a pair.
  if (event.key === "ArrowUp") {
    return isAltKey(event);
  }

  if (event.key === "ArrowDown") {
    return isAltKey(event) || isCommandKey(event);
  }

  // INFO: § 8.14. `Ctrl + /` or `Cmd + /` opens the shortcut help modal.
  return (
    (isCommandKey(event) ||
      (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey)) &&
    event.key === "/"
  );
}

/**
 * REQUIREMENTS.md § 8.14. Which of § 13.6.'s menus this chord names, or `undefined` for
 * every other key.
 *
 * INFO: Read off `EMOTICON_MENUS` rather than from a table of its own, so the bar's order and the digits' cannot come apart.
 * WARN: § 8.14. Two modifiers spelled these before `isMenuKey` did and neither may have them back. `⌘1`/`⌘2`/`⌘3` is the browser's own tab switch, so where it reserves them the page is never sent the keystroke at all. `⌥1` is `¡` on macOS — a character, and therefore unpressable in the composer, in § 13.8.'s search field and in a correction, which are the three places this shortcut is most wanted.
 */
function toEmoticonMenu(event: KeyboardEvent): Optional<EmoticonMenu> {
  if (!isMenuKey(event)) {
    return undefined;
  }

  return EMOTICON_MENUS.find((_, index) => isDigitKey(event, index + 1));
}

// INFO: § 8.14. `<body>` is where focus sits after a click on a bubble, on the wallpaper, or on anything else the conversation is made of.
function hasFocusedControl(): boolean {
  const active = document.activeElement;

  return active !== null && active !== document.body && active !== document.documentElement;
}
