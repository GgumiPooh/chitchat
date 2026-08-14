import { isBrowser } from "../dom";
import type { Optional } from "../nullish";

/** The app's shortcut modifier, as it is written in the § 8.14. sheet. */
export type CommandKeyLabel = "⌘" | "Ctrl";

let usesMeta: Optional<boolean>;

/**
 * Whether this platform's shortcut modifier is `⌘` rather than `Ctrl`.
 *
 * WARN: User-agent sniffing, for `useIsIos`' reason — nothing exposes which key an
 * OS spells its shortcuts with. Cached because it is read from `keydown`, and
 * deliberately not cached on the server, where the answer is only a placeholder.
 */
function usesMetaKey(): boolean {
  if (!isBrowser()) {
    return false;
  }

  usesMeta ??= /Mac|iPhone|iPad|iPod/.test(window.navigator.userAgent);

  return usesMeta;
}

/** Every modifier a `KeyboardEvent` reports, which is what an exact match has to test. */
type Modifiers = Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">;

/**
 * Whether this event carries the platform's shortcut modifier and **no other**.
 *
 * WARN: REQUIREMENTS.md § 8.14. One modifier per platform, never `metaKey || ctrlKey`.
 * WebKit honours Cocoa's emacs bindings inside a text field, so a `Ctrl` accepted on
 * a Mac takes `Ctrl+E` (line end) and `Ctrl+A` (line start) away from the composer.
 *
 * WARN: § 8.14. `Shift` and `Alt` are refused for the same reason rather than ignored.
 * `⌘⇧↓` is macOS's select-to-end-of-document and `⌥⌘↓` is its own chord — matched
 * loosely, the shortcut answers both and the field loses a selection it was extending.
 */
export function isCommandKey(event: Modifiers): boolean {
  return hasCommandModifier(event) && !event.altKey && !event.shiftKey;
}

/**
 * Whether this event carries the platform's shortcut modifier **and `Shift`**, which is
 * how a binding spells the more specific form of the one beside it.
 *
 * INFO: REQUIREMENTS.md § 8.14. `⌘E` opens the emoticon panel and `⌘⇧E` opens its
 * search, on the idiom `⌘F`/`⌘⇧F` and `⌘Z`/`⌘⇧Z` already use.
 */
export function isCommandShiftKey(event: Modifiers): boolean {
  return hasCommandModifier(event) && event.shiftKey && !event.altKey;
}

function hasCommandModifier(event: Modifiers): boolean {
  return usesMetaKey() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

/** Whether this event carries no modifier at all, which is what an unmodified binding means. */
export function isBareKey(event: Modifiers): boolean {
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

/**
 * Whether this event carries `Shift` and nothing else.
 *
 * INFO: REQUIREMENTS.md § 8.14. `⇧←/→` turns the emoticon panel's pack, which is the
 * one binding on this modifier alone — every arrow chord carrying the platform
 * modifier is spoken for by the OS or the browser.
 * WARN: A caller has to keep it out of text fields itself. `Shift` plus an arrow is
 * how every field on every platform extends a selection, and no flag on the event
 * says whether the target is one.
 */
export function isShiftKey(event: Modifiers): boolean {
  return event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
}

/**
 * Whether this event carries `⌥`/`Alt` and nothing else.
 *
 * INFO: REQUIREMENTS.md § 8.14. The one modifier that needs no platform branch — `⌥`
 * and `Alt` are the same physical key and the same `altKey` flag, so a binding on it
 * is one binding rather than a pair.
 */
export function isAltKey(event: Modifiers): boolean {
  return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

/**
 * Whether this is the given Latin letter, by the character it produced **or** by the
 * key it sits on.
 *
 * WARN: § 8.14. Both, and neither alone will do. `key` is what the active input source
 * produced, and a Hangul source is what this app's users type in — some engines report
 * its own character for a ⌘ chord rather than the Latin fallback, which would leave the
 * shortcut dead for the primary audience. `code` is the physical key, which answers
 * that and is in turn wrong for Dvorak and AZERTY, where the letter is somewhere else.
 */
export function isLetterKey(event: Pick<KeyboardEvent, "code" | "key">, letter: string): boolean {
  return event.key.toLowerCase() === letter || event.code === `Key${letter.toUpperCase()}`;
}

/** How this platform's shortcut modifier is written. */
export function toCommandKeyLabel(): CommandKeyLabel {
  return usesMetaKey() ? "⌘" : "Ctrl";
}

/** How this platform writes the key `isAltKey` reads — one key, two names. */
export function toAltKeyLabel(): "⌥" | "Alt" {
  return usesMetaKey() ? "⌥" : "Alt";
}

/** How this platform writes `Shift`, which only `⌘⇧E` spells out (`REQUIREMENTS.md § 8.14.`). */
export function toShiftKeyLabel(): "⇧" | "Shift" {
  return usesMetaKey() ? "⇧" : "Shift";
}
