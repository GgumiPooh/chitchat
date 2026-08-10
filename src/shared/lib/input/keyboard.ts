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
  const command = usesMetaKey() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;

  return command && !event.altKey && !event.shiftKey;
}

/** Whether this event carries no modifier at all, which is what an unmodified binding means. */
export function isBareKey(event: Modifiers): boolean {
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
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
