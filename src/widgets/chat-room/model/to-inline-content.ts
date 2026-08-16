import { toMessageSegments, type MessageSegment } from "@/shared/config";
import type { EmoticonItemId, Nullable } from "@/shared/lib";

/**
 * REQUIREMENTS.md § 13. How a text message's own emoticons are drawn, which is a
 * property of the content rather than of the row: a mini never occupies
 * `messages.emoticon_item_id`, so a lone one is this shape and not an emoticon message.
 *
 * WARN: § 8.3. The bubble and the row estimate MUST both read the layout from here.
 * They are two answers to "how tall is this", and a rule spelled twice is a rule that
 * drifts — a bubble drawing large where the estimate priced a line is the largest miss
 * this file can produce.
 */
export type InlineContent =
  /** No emoticon in the text at all — the path every message written before this format takes, and the one that must stay exactly as it was. */
  | { kind: "none" }
  /** DESIGN.md § 6.5. One emoticon and no words, drawn bubble-less at its own box like an emoticon message. */
  | { kind: "solo"; itemId: EmoticonItemId; segments: MessageSegment[] }
  /** Mixed with words, or more than one — drawn at text size between the characters. */
  | { kind: "inline"; segments: MessageSegment[] };

const NO_INLINE: InlineContent = { kind: "none" };

/**
 * REQUIREMENTS.md § 13. Which of the three a message's text is.
 *
 * WARN: Classified off the **segments** and never off the raw pair. An id without a
 * placeholder to stand at draws nothing (`toMessageSegments` says so), so counting ids
 * would call a row solo that renders no emoticon at all — and the estimate would price
 * a 140px box for a bubble holding one empty line.
 *
 * INFO: Whitespace around a lone emoticon is dropped rather than making it inline. § 2.2. reads "one mini and no letters", and a space the sender typed either side of it is not a letter — nor anything the reader can see.
 */
export function toInlineContent(
  text: Nullable<string>,
  inlineEmoticonItemIds: readonly EmoticonItemId[] = [],
): InlineContent {
  if (inlineEmoticonItemIds.length === 0) {
    return NO_INLINE;
  }

  const segments = toMessageSegments({
    text: text ?? "",
    inlineEmoticonItemIds: [...inlineEmoticonItemIds],
  });
  const emoticons = segments.filter((segment) => segment.kind === "emoticon");

  if (emoticons.length === 0) {
    return NO_INLINE;
  }

  const hasWords = segments.some(
    (segment) => segment.kind === "text" && segment.text.trim() !== "",
  );

  // INFO: `segments` rides along on `solo` too, so a caller that draws in the bubble — `MessageText` — has them whichever kind it is handed and can never print a bare placeholder character.
  return emoticons.length === 1 && !hasWords
    ? { kind: "solo", itemId: emoticons[0].itemId, segments }
    : { kind: "inline", segments };
}
