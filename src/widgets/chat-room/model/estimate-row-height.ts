import type { Emoticon } from "@/entities/emoticon";
import type { LinkPreview } from "@/entities/link-preview";
import type { ChatMessage, ReplyPreview } from "@/entities/message";
import {
  countTextLines,
  findFirstUrl,
  measureLineHeight,
  type Maybe,
  type Nullable,
  type Optional,
} from "@/shared/lib";
import { toEmoticonBox } from "./to-emoticon-box";
import { MEDIA_EDGE, toMediaBoxHeight } from "./to-media-box";
import type { ChatRow } from "./types";

// WARN: Mirrors `theme.css`, which cannot be read from here without a layout read per row. These move together; a spacing change that skips this file shows up as REQUIREMENTS.md § 8.3. drift rather than as a visual bug.
const SPACING_2XS = 4;
const SPACING_XS = 8;
const SPACING_SM = 12;
const SPACING_MD = 16;

/**
 * WARN: Line heights are measured off the page, never mirrored from `theme.css` the way the spacing above is. The stylesheet says `15px` at `1.45`; Chrome lays that out at 21.75 and Safari at **21**, so the arithmetic is a pixel out per line on one of the two — every line of every row, which § 8.3. turns into drift. The literals here are only the server's answer, where there is nothing to measure.
 */
const LINE = {
  body: () => measureLineHeight("text-chat-body", 15 * 1.45),
  name: () => measureLineHeight("text-chat-name", 12 * 1.3),
  time: () => measureLineHeight("text-chat-time", 11 * 1.2),
  caption: () => measureLineHeight("text-caption", 12 * 1.4),
  cardTitle: () => measureLineHeight("text-title-sm", 14 * 1.45),
  cardBody: () => measureLineHeight("text-body-sm", 13 * 1.55),
  // INFO: DESIGN.md § 6.10. The quote's summary line, which is `chat-name` at `leading-snug` rather than at its own.
  quoteSummary: () => measureLineHeight("text-chat-name leading-snug", 12 * 1.375),
};

/** Every class `LINE` reads, for the room to hand `warmLineHeights` from a layout effect. */
export const ROW_LINE_CLASSES = [
  "text-chat-body",
  "text-chat-name",
  "text-chat-time",
  "text-caption",
  "text-title-sm",
  "text-body-sm",
  "text-chat-name leading-snug",
] as const;

// INFO: DESIGN.md § 6.5. `max-w-[72%]` on the bubble column.
const COLUMN_RATIO = 0.72;

// INFO: DESIGN.md § 6.3. The timestamp's `w-14` slot plus the `gap-2xs` before it. Fixed there precisely so it is a constant here — the alternative is re-deriving the width of a formatted string this cannot see.
const TIME_SLOT = 56 + SPACING_2XS;

// INFO: DESIGN.md § 6.2. `border` on the other participant's bubble only, and `box-sizing: border-box` puts it inside the width.
const BUBBLE_BORDER = 2;

// INFO: DESIGN.md § 6.3. `size-9` on the avatar, and on the spacer that keeps the rest of a group indented to it. A sibling of the bubble column, so the row cannot be shorter than this.
const AVATAR_SIZE = 36;

// INFO: DESIGN.md § 6.5. Retry over cancel, two `size-9` controls, standing where the timestamp would be. Taller than any one-line bubble, so this is what the row measures.
const FAILED_CONTROLS = AVATAR_SIZE * 2;
const FAILED_SLOT = AVATAR_SIZE + SPACING_2XS;

// INFO: DESIGN.md § 6.4., § 6.5. The pill's own `px-sm py-2xs`, and `caption` at 500.
const PILL = { size: 12, weight: 500 };
const PILL_PADDING = SPACING_2XS * 2;

// INFO: `size-8` on the quote's thumbnail, and the two lines beside it — whichever is taller is the quote's content (`items-center`).
const QUOTE_THUMBNAIL = 32;

// INFO: DESIGN.md § 3.3. `--container-app`. Only a fallback: the room passes the scroller's real width once it has one, and this is what the very first render estimates against.
const DEFAULT_CONTENT_WIDTH = 576;

// WARN: The type scale of `theme.css`, weights included — a variable font advances differently at 400 and 600, and this is measured against the real one.
const CHAT_BODY = { size: 15, weight: 400 };

// INFO: DESIGN.md § 6.2. `border` on the card too, and `box-sizing: border-box` takes it out of the width rather than adding it around.
const CARD_BORDER = 2;

// INFO: DESIGN.md § 6.9. `title-sm` and `body-sm` clamp to two lines, the site line to one.
const CARD_TITLE = { size: 14, weight: 600, line: LINE.cardTitle, maxLines: 2 };
const CARD_BODY = { size: 13, weight: 400, line: LINE.cardBody, maxLines: 2 };

/** Reads an already-scraped § 8.9. preview out of the cache. `undefined` for a link nothing has answered for yet, and for a page that described itself with nothing. */
export type PreviewReader = (url: Maybe<string>) => Optional<LinkPreview>;

export type RowEstimateContext = {
  /** The scroller's own width, which the § 6.5. column is a percentage of. Absent until the scroller mounts. */
  contentWidth?: number;
  /** As `getComputedStyle` reports it on the chat surface, so a wrap is counted in the font the bubble is drawn in. Blank on the server, where the width falls back to a ratio per glyph class. */
  fontFamily: string;
  readPreview: PreviewReader;
  /** REQUIREMENTS.md § 11.5. The notice a system row renders, which is composed from the live nickname and so cannot be derived from the message alone. */
  readNotice: NoticeReader;
  /** REQUIREMENTS.md § 8.8. Whether this is the one message carrying 읽음, which is resolved against the other participant's cursor rather than stored on the row. */
  isRead: (message: ChatMessage) => boolean;
};

/** @see RowEstimateContext.readNotice */
export type NoticeReader = (message: ChatMessage) => string;

const DEFAULT_CONTEXT: RowEstimateContext = {
  fontFamily: "",
  readPreview: () => undefined,
  readNotice: () => "",
  isRead: () => false,
};

// INFO: The half of a message a height follows from — `ChatMessage` and `PendingMessage` differ elsewhere, and an optimistic bubble is drawn at exactly the size the sent one will be.
type Payload = {
  text: Nullable<string>;
  // INFO: REQUIREMENTS.md § 9.1. `filename` is what tells the box arithmetic a stack of file cards from a grid of photos; a bubble never mixes the two (§ 6.).
  media: { width: number; height: number; filename: Nullable<string> }[];
  emoticon: Nullable<Emoticon>;
  replyTo: Nullable<ReplyPreview>;
  // INFO: DESIGN.md § 6.5. Only an optimistic bubble carries one; a message that landed is always sent.
  status?: "sending" | "failed";
};

type RowFlags = {
  isFirstOfGroup: boolean;
  /** DESIGN.md § 6.3. How many lines stand in the column beside the bubble: the timestamp, § 8.8.'s 읽음, or both stacked. Zero when neither is there. */
  besideLines: number;
};

/**
 * REQUIREMENTS.md § 8.3. What a row will measure, before it renders.
 *
 * WARN: The point is not tidiness — it is that a wrong estimate *moves the list*. Every row measured above the fold corrects the scroll by its own error, and WebKit drops that correction mid-gesture, so a room read back through with one flat estimate drifts by the accumulated error and snaps back when the finger stops. An attachment and an emoticon resolve exactly here; only text is approximated.
 */
export function estimateRowHeight(row: ChatRow, context = DEFAULT_CONTEXT): number {
  // WARN: Rounded because the measurement it is compared against is. `measureElement` stores `Math.round(borderBoxSize)`, so a fractional estimate can never equal it — a row estimated *perfectly* at 41.75 still measures 42 and corrects the scroll by the 0.25, once per row, in the same direction every time. Rounding here is what makes a right answer produce no correction at all, and it swallows sub-pixel error in the bargain.
  return Math.round(toRowHeight(row, context));
}

function toRowHeight(row: ChatRow, context: RowEstimateContext): number {
  switch (row.kind) {
    // INFO: DESIGN.md § 6.4. One line always — the label is `오늘`, `어제` or a full date, and none of them wrap.
    case "date":
      return SPACING_MD * 2 + PILL_PADDING + LINE.caption();
    // INFO: DESIGN.md § 6.5. Unlike the divider this one is a sentence, and § 11.5.'s notices are long enough to wrap on a phone.
    case "system":
      return SPACING_SM * 2 + PILL_PADDING + toNoticeHeight(row.message, context);
    case "message":
      return estimateMessageRow(row.message, row.isMine, context, {
        isFirstOfGroup: row.isFirstOfGroup,
        // INFO: REQUIREMENTS.md § 8.8. 읽음 and the timestamp stack in one `flex-col`, so the newest read message of mine is two lines rather than one — and 읽음 alone puts the column beside a bubble that is not its group's last.
        besideLines: Number(row.isLastOfGroup) + Number(context.isRead(row.message)),
      });
    case "pending":
      // INFO: An optimistic bubble is always mine, so it never carries the avatar column or a sender name — nor 읽음, since it has not been sent.
      return estimateMessageRow(row.pending, true, context, {
        isFirstOfGroup: row.isFirstOfGroup,
        besideLines: Number(row.isLastOfGroup),
      });
  }
}

function estimateMessageRow(
  payload: Payload,
  isMine: boolean,
  context: RowEstimateContext,
  flags: RowFlags,
): number {
  const hasMedia = payload.media.length > 0;
  const isBubbleless = hasMedia || payload.emoticon !== null;
  let column = 0;

  // INFO: REQUIREMENTS.md § 8.7. The sender's name, on the first bubble of the other participant's group only.
  if (!isMine && flags.isFirstOfGroup) {
    column += LINE.name() + SPACING_2XS;
  }

  // INFO: DESIGN.md § 6.10. A bubble-less message quotes in a card above itself; a text one quotes inside its bubble, and that one is counted with the bubble's contents.
  if (payload.replyTo && isBubbleless) {
    column += toQuoteHeight(payload.replyTo, "card") + SPACING_2XS;
  }

  // INFO: DESIGN.md § 6.9. The card is a row of its own above the bubble, and § 8.9.'s scrape has normally already answered by the time this is asked — `useLinkPreviewPrefetch` sees to that, and it is the only reason a height is knowable here at all.
  const preview = isBubbleless ? undefined : context.readPreview(findFirstUrl(payload.text));

  if (preview) {
    column += toLinkCardHeight(preview, context) + SPACING_2XS;
  }

  column += toPayloadHeight(payload, isMine, isBubbleless, context, flags);

  // INFO: DESIGN.md § 6.1. The gap between rows is this padding, so it belongs to the row below it.
  const top = flags.isFirstOfGroup ? SPACING_SM : SPACING_2XS;

  // INFO: DESIGN.md § 6.3. The avatar, and the spacer standing in for it through the rest of a group, are siblings of this column — so a bubble shorter than one cannot make the row shorter than one.
  return top + (isMine ? column : Math.max(column, AVATAR_SIZE));
}

function toPayloadHeight(
  payload: Payload,
  isMine: boolean,
  isBubbleless: boolean,
  context: RowEstimateContext,
  flags: RowFlags,
): number {
  // INFO: DESIGN.md § 6.3., § 6.5. Whatever stands beside the bubble in the same `items-end` row: the retry/cancel pair on a failed send, otherwise the timestamp. The row is whichever is taller — text always wins over a timestamp, but not over the controls, and not necessarily over a wide-and-short attachment.
  const beside = toBesideHeight(payload, flags);

  if (payload.emoticon) {
    return Math.max(toEmoticonBox(payload.emoticon).height, beside);
  }

  if (payload.media.length > 0) {
    return Math.max(toMediaBoxHeight(payload.media), beside);
  }

  // INFO: `px-sm py-xs` on the bubble, and the hairline the other participant's bubble is bordered with (DESIGN.md § 6.2.).
  let height = SPACING_XS * 2 + (isMine ? 0 : BUBBLE_BORDER);

  if (payload.replyTo && !isBubbleless) {
    height += toQuoteHeight(payload.replyTo, "rule") + SPACING_2XS;
  }

  return Math.max(
    height + toTextHeight(payload.text, isMine, context, flags, payload.status),
    beside,
  );
}

function toBesideHeight(payload: Payload, { besideLines }: RowFlags): number {
  if (payload.status === "failed") {
    return FAILED_CONTROLS;
  }

  return besideLines * LINE.time();
}

function toTextHeight(
  text: Nullable<string>,
  isMine: boolean,
  context: RowEstimateContext,
  { besideLines }: RowFlags,
  status?: Payload["status"],
): number {
  if (!text) {
    return 0;
  }

  const { fontFamily } = context;
  const column = toColumnWidth(context);
  // INFO: DESIGN.md § 6.3., § 6.5. Whatever stands beside the bubble takes its width off the text: the retry/cancel column on a failed send, the timestamp otherwise.
  // WARN: `box-sizing: border-box`, so the other participant's hairline is width taken from the text and not added around it.
  const beside = status === "failed" ? FAILED_SLOT : besideLines > 0 ? TIME_SLOT : 0;
  const available = Math.max(
    column - beside - SPACING_SM * 2 - (isMine ? 0 : BUBBLE_BORDER),
    CHAT_BODY.size,
  );
  // INFO: `whitespace-pre-wrap` on the bubble, so a newline is a hard break and runs of spaces are kept rather than collapsed.
  return (
    countTextLines(text, { ...CHAT_BODY, family: fontFamily }, available, "pre-wrap") * LINE.body()
  );
}

/**
 * DESIGN.md § 6.9. The card's own height, which is knowable because
 * `useLinkPreviewPrefetch` has already answered the scrape (REQUIREMENTS.md § 8.3.).
 *
 * WARN: The one part of a row that was left at zero after the estimate went per-row, and it is the largest miss of the lot — a card with a thumbnail is ~250px, so a link bubble estimated without it lands a whole card short and corrects by that much the moment it is measured.
 */
function toLinkCardHeight(
  { title, description, siteName, imageUrl }: LinkPreview,
  context: RowEstimateContext,
): number {
  const { fontFamily } = context;
  // WARN: The card is `w-full max-w-55`, so it is the § 6.5. attachment width only while the column can spare it — below a shell of about 340px the column is narrower and the card shrinks with it.
  const card = Math.min(MEDIA_EDGE, toColumnWidth(context));
  const textWidth = Math.max(card - SPACING_SM * 2 - CARD_BORDER, CARD_BODY.size);
  // INFO: Only what the page actually published is rendered, so each block is counted only if it is there.
  const blocks = [
    title ? toClampedHeight(title, CARD_TITLE, fontFamily, textWidth) : 0,
    description ? toClampedHeight(description, CARD_BODY, fontFamily, textWidth) : 0,
    siteName ? LINE.caption() : 0,
  ].filter((height) => height > 0);
  // INFO: The card's `py-xs`, its hairline, and the `gap-2xs` between whichever blocks survived above.
  const text =
    SPACING_XS * 2 +
    CARD_BORDER +
    blocks.reduce((total, height) => total + height, 0) +
    Math.max(0, blocks.length - 1) * SPACING_2XS;

  // INFO: `aspect-video` (DESIGN.md § 6.9.), reserved whether or not the asset ever arrives — which is what keeps this true after a refusal.
  // WARN: The ratio is of the card's *content* box. `box-sizing: border-box` puts the hairline inside the card's width, so the image is that much narrower and a whole 9/16 of that much shorter.
  return imageUrl ? text + ((card - CARD_BORDER) * 9) / 16 : text;
}

// INFO: DESIGN.md § 6.9. `line-clamp` caps what renders, so the count is capped with it rather than paid for in full.
function toClampedHeight(
  text: string,
  { size, weight, line, maxLines }: typeof CARD_TITLE,
  family: string,
  maxWidth: number,
): number {
  return Math.min(maxLines, countTextLines(text, { size, weight, family }, maxWidth)) * line();
}

// INFO: DESIGN.md § 6.5. `max-w-[72%]` is a percentage, so it resolves against the flex container's content box — the row less its `px-md`.
// WARN: The avatar is a sibling item and does not narrow that base; it can only narrow the *free* space, and at 44px it would have to be a shell under 160px wide before it beat the 72%.
function toColumnWidth({ contentWidth = DEFAULT_CONTENT_WIDTH }: RowEstimateContext): number {
  return (contentWidth - SPACING_MD * 2) * COLUMN_RATIO;
}

// INFO: DESIGN.md § 6.5. The pill is centred in the row's `px-md` and wraps inside its own `px-sm`.
function toNoticeHeight(
  message: ChatMessage,
  { contentWidth = DEFAULT_CONTENT_WIDTH, fontFamily, readNotice }: RowEstimateContext,
): number {
  const available = Math.max(contentWidth - SPACING_MD * 2 - SPACING_SM * 2, PILL.size);

  return (
    countTextLines(readNotice(message), { ...PILL, family: fontFamily }, available) * LINE.caption()
  );
}

function toQuoteHeight(replyTo: ReplyPreview, variant: "rule" | "card"): number {
  const content = Math.max(
    replyTo.thumbnailMediaId ? QUOTE_THUMBNAIL : 0,
    LINE.time() + LINE.quoteSummary(),
  );

  // INFO: DESIGN.md § 6.10. `card` adds its own padding and border; `rule` marks itself with a hairline and a `py-px` indent alone.
  return variant === "card" ? content + SPACING_2XS * 2 + 2 : content + 2;
}
