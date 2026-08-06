import type { Emoticon } from "@/entities/emoticon";
import type { ReplyPreview } from "@/entities/message";
import type { Nullable } from "@/shared/lib";
import { toEmoticonBox } from "./to-emoticon-box";
import { toMediaBoxHeight } from "./to-media-box";
import type { ChatRow } from "./types";

// WARN: Mirrors `theme.css`, which cannot be read from here without a layout read per row. These move together; a spacing or type-scale change that skips this file shows up as REQUIREMENTS.md § 8.3. drift rather than as a visual bug.
const SPACING_2XS = 4;
const SPACING_XS = 8;
const SPACING_SM = 12;
const SPACING_MD = 16;
const CHAT_BODY_LINE = 15 * 1.45;
const CHAT_NAME_LINE = 12 * 1.3;
const CHAT_TIME_LINE = 11 * 1.2;
const CAPTION_LINE = 12 * 1.4;

// INFO: `size-9` on the avatar plus the row's own `gap-xs`, which the whole group stays indented to (DESIGN.md § 6.3.).
const AVATAR_COLUMN = 36 + SPACING_XS;

// INFO: DESIGN.md § 6.3. The 읽음 / timestamp column beside the bubble, which the § 6.5. column width is shared with.
const TIME_COLUMN = 48 + SPACING_2XS;

// INFO: DESIGN.md § 6.5. `max-w-[72%]` on the bubble column.
const COLUMN_RATIO = 0.72;

// INFO: `size-8` on the quote's thumbnail, and the two lines beside it — whichever is taller is the quote's content (`items-center`).
const QUOTE_THUMBNAIL = 32;
const QUOTE_LINES = CHAT_TIME_LINE + 12 * 1.375;

// INFO: DESIGN.md § 3.3. `--container-app`. Only a fallback: the room passes the scroller's real width once it has one, and this is what the very first render estimates against.
const DEFAULT_CONTENT_WIDTH = 576;

// INFO: A Hangul or CJK glyph advances a full em at this size; Latin, digits and punctuation land near half of one. Enough to count lines, which is all the estimate needs.
const WIDE_GLYPH = 15;
const NARROW_GLYPH = 15 * 0.55;

// INFO: The half of a message a height follows from — `ChatMessage` and `PendingMessage` differ elsewhere, and an optimistic bubble is drawn at exactly the size the sent one will be.
type Payload = {
  text: Nullable<string>;
  media: { width: number; height: number }[];
  emoticon: Nullable<Emoticon>;
  replyTo: Nullable<ReplyPreview>;
};

/**
 * REQUIREMENTS.md § 8.3. What a row will measure, before it renders.
 *
 * WARN: The point is not tidiness — it is that a wrong estimate *moves the list*. Every row measured above the fold corrects the scroll by its own error, and WebKit drops that correction mid-gesture, so a room read back through with one flat estimate drifts by the accumulated error and snaps back when the finger stops. An attachment and an emoticon resolve exactly here; only text is approximated.
 */
export function estimateRowHeight(row: ChatRow, contentWidth = DEFAULT_CONTENT_WIDTH): number {
  switch (row.kind) {
    case "date":
      return SPACING_MD * 2 + SPACING_2XS * 2 + CAPTION_LINE;
    case "system":
      return SPACING_SM * 2 + SPACING_2XS * 2 + CAPTION_LINE;
    case "message":
      return estimateMessageRow(row.message, row.isMine, row, contentWidth);
    case "pending":
      // INFO: An optimistic bubble is always mine, so it never carries the avatar column or a sender name.
      return estimateMessageRow(row.pending, true, row, contentWidth);
  }
}

function estimateMessageRow(
  payload: Payload,
  isMine: boolean,
  row: { isFirstOfGroup: boolean; isLastOfGroup: boolean },
  contentWidth: number,
): number {
  const { isFirstOfGroup, isLastOfGroup } = row;
  const hasMedia = payload.media.length > 0;
  const isBubbleless = hasMedia || payload.emoticon !== null;
  // INFO: DESIGN.md § 6.1. The gap between rows is this padding, so it belongs to the row below it.
  let height = isFirstOfGroup ? SPACING_SM : SPACING_2XS;

  // INFO: REQUIREMENTS.md § 8.7. The sender's name, on the first bubble of the other participant's group only.
  if (!isMine && isFirstOfGroup) {
    height += CHAT_NAME_LINE + SPACING_2XS;
  }

  // INFO: DESIGN.md § 6.10. A bubble-less message quotes in a card above itself; a text one quotes inside its bubble, and that one is counted with the bubble's contents.
  if (payload.replyTo && isBubbleless) {
    height += toQuoteHeight(payload.replyTo, "card") + SPACING_2XS;
  }

  // INFO: REQUIREMENTS.md § 8.9. The § 6.9. card is deliberately not counted, even though it is a row of its own — nothing renders until the scrape answers and most links describe themselves with nothing, so counting it would be wrong more often than right. `useLinkPreviewPrefetch` is what keeps that from mattering: the card is there before the row is ever measured.

  return height + toPayloadHeight(payload, isMine, isLastOfGroup, isBubbleless, contentWidth);
}

function toPayloadHeight(
  payload: Payload,
  isMine: boolean,
  isLastOfGroup: boolean,
  isBubbleless: boolean,
  contentWidth: number,
): number {
  if (payload.emoticon) {
    return toEmoticonBox(payload.emoticon).height;
  }

  if (payload.media.length > 0) {
    return toMediaBoxHeight(payload.media);
  }

  // INFO: `px-sm py-xs` on the bubble, and the hairline the other participant's bubble is bordered with (DESIGN.md § 6.2.).
  let height = SPACING_XS * 2 + (isMine ? 0 : 2);

  if (payload.replyTo && !isBubbleless) {
    height += toQuoteHeight(payload.replyTo, "rule") + SPACING_2XS;
  }

  return height + toTextHeight(payload.text, isMine, isLastOfGroup, contentWidth);
}

function toTextHeight(
  text: Nullable<string>,
  isMine: boolean,
  isLastOfGroup: boolean,
  contentWidth: number,
): number {
  if (!text) {
    return 0;
  }

  const row = contentWidth - SPACING_MD * 2 - (isMine ? 0 : AVATAR_COLUMN);
  const column = row * COLUMN_RATIO - (isLastOfGroup ? TIME_COLUMN : 0);
  const available = Math.max(column - SPACING_SM * 2, WIDE_GLYPH);

  // INFO: `whitespace-pre-wrap` on the bubble, so a newline is a break the wrap estimate must not swallow.
  const lines = text
    .split("\n")
    .reduce((total, line) => total + Math.max(1, Math.ceil(toTextWidth(line) / available)), 0);

  return lines * CHAT_BODY_LINE;
}

// INFO: ASCII is the narrow half and everything else the wide one — for Korean copy (CLAUDE.md § 0.2.) that splits the two classes almost exactly, and an emoji counting as wide is the right answer anyway.
function toTextWidth(line: string): number {
  let width = 0;

  for (const character of line) {
    width += character.codePointAt(0)! < 0x80 ? NARROW_GLYPH : WIDE_GLYPH;
  }

  return width;
}

function toQuoteHeight(replyTo: ReplyPreview, variant: "rule" | "card"): number {
  const content = Math.max(replyTo.thumbnailMediaId ? QUOTE_THUMBNAIL : 0, QUOTE_LINES);

  // INFO: DESIGN.md § 6.10. `card` adds its own padding and border; `rule` marks itself with a hairline and a `py-px` indent alone.
  return variant === "card" ? content + SPACING_2XS * 2 + 2 : content + 2;
}
