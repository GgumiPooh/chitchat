import type { EmoticonItemId, Nullable } from "@/shared/lib";

/**
 * What one inline emoticon occupies in `messages.text` (REQUIREMENTS.md § 6.).
 *
 * WARN: U+FFFC, the character Unicode defines for an object embedded in text. It is
 * unreachable from a keyboard and from an IME, which is the whole reason for it — a
 * typeable marker (`%e`) is one a draft can contain by accident, and every count
 * below would then read a message's own words as an emoticon.
 */
export const OBJECT_PLACEHOLDER = "\uFFFC";

/**
 * A message's text and the emoticons standing inside it (REQUIREMENTS.md § 6.).
 *
 * WARN: The Nth `OBJECT_PLACEHOLDER` in `text` is the Nth id here, so the two are only
 * ever read as a pair — `isMessageContentPaired` is what a boundary owes them. A
 * repeated emoticon repeats its id; the array is positional, not a set.
 */
export type MessageContent = {
  text: string;
  inlineEmoticonItemIds: EmoticonItemId[];
};

/**
 * What the browser needs to draw one inline emoticon, and all it is given
 * (REQUIREMENTS.md § 13.).
 *
 * INFO: The box comes down with the page rather than being asked for per emoticon, because REQUIREMENTS.md § 8.3. has to reserve the row's height before any asset has loaded.
 */
export type InlineEmoticonInfo = {
  width: number;
  height: number;
  /** REQUIREMENTS.md § 13.4. The item's `updated_at` in milliseconds — an edit keeps the id, so nothing else tells the cached asset URL apart from the new one. */
  version: number;
  name: Nullable<string>;
  /** REQUIREMENTS.md § 13. The item's objects are gone and the box draws a replacement; the row survives so there is a box to draw it in. */
  isDeleted: boolean;
};

/**
 * The emoticons standing in a page of messages, keyed by item id.
 *
 * WARN: Keyed and deduplicated, never one entry per placeholder. A page repeats the
 * same emoticon freely, and the alternative is the same row shipped a dozen times.
 */
export type InlineEmoticonMap = Record<string, InlineEmoticonInfo>;

/** One run of a message, as everything that draws `MessageContent` walks it. */
export type MessageSegment =
  { kind: "text"; text: string } | { kind: "emoticon"; itemId: EmoticonItemId };

/**
 * The pair as a drawable sequence, in the order it reads.
 *
 * INFO: A message with no placeholders answers one text segment, so a caller needs no
 * branch of its own for the messages written before this format existed.
 */
export function toMessageSegments({
  text,
  inlineEmoticonItemIds,
}: MessageContent): MessageSegment[] {
  const segments: MessageSegment[] = [];
  // INFO: N placeholders split into N+1 runs, so the last run is the only one no emoticon follows.
  const runs = text.split(OBJECT_PLACEHOLDER);

  runs.forEach((run, index) => {
    if (run) {
      segments.push({ kind: "text", text: run });
    }

    const itemId = index < runs.length - 1 ? inlineEmoticonItemIds[index] : undefined;

    // WARN: An unpaired placeholder draws nothing rather than throwing — a row that lost its ids is still a sentence somebody wrote, and a bubble that renders none of it is the worse failure.
    if (itemId) {
      segments.push({ kind: "emoticon", itemId });
    }
  });

  return segments;
}

export function countObjectPlaceholders(text: string): number {
  let count = 0;

  for (const character of text) {
    if (character === OBJECT_PLACEHOLDER) {
      count += 1;
    }
  }

  return count;
}

/** How many placeholders `text` holds before `offset` — which emoticon a caret sits at. */
export function toPlaceholderIndex(text: string, offset: number): number {
  return countObjectPlaceholders(text.slice(0, offset));
}

/** Whether the pair can be read at all: one id per placeholder, and no id without one. */
export function isMessageContentPaired({ text, inlineEmoticonItemIds }: MessageContent): boolean {
  return countObjectPlaceholders(text) === inlineEmoticonItemIds.length;
}

/**
 * The sentence without its emoticons, for every line that has room for words only —
 * the § 16.1. push body, the § 8.10. quote, § 8.6.'s excerpt and the offline mirror.
 *
 * WARN: Removing a placeholder leaves the spaces that surrounded it against each
 * other, and one at either end of the line leaves the line starting or ending on a
 * space — which is why this collapses and trims rather than only deleting.
 *
 * INFO: Text carrying no placeholder is returned untouched — every message written
 * before this format is one, and none of them may be re-spaced on the way to a push.
 */
export function toPlainMessageText(text: string): string {
  if (!text.includes(OBJECT_PLACEHOLDER)) {
    return text;
  }

  return text
    .replaceAll(OBJECT_PLACEHOLDER, "")
    .replace(/[^\S\n]+/gu, " ")
    .replace(/^ | $/gmu, "")
    .trim();
}

/**
 * What a message reads as in one line — the § 16.1. push body and the § 8.10. quote
 * take this.
 *
 * INFO: Every emoticon reads as the same `(이모티콘)`, so a line made of nothing else still says what it is without any of them having to be looked up.
 */
export function toMessageSummary(text: string): string {
  return text.replaceAll(OBJECT_PLACEHOLDER, "(이모티콘)");
}
