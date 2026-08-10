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

/**
 * Whether this event carries the platform's shortcut modifier and only that one.
 *
 * WARN: REQUIREMENTS.md § 8.14. One modifier per platform, never `metaKey || ctrlKey`.
 * WebKit honours Cocoa's emacs bindings inside a text field, so a `Ctrl` accepted on
 * a Mac takes `Ctrl+E` (line end) and `Ctrl+A` (line start) away from the composer.
 */
export function isCommandKey(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey">): boolean {
  return usesMetaKey() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

/** How this platform's shortcut modifier is written. */
export function toCommandKeyLabel(): CommandKeyLabel {
  return usesMetaKey() ? "⌘" : "Ctrl";
}
