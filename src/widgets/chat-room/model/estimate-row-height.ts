import type { Emoticon } from "@/entities/emoticon";
import type { LinkPreview } from "@/entities/link-preview";
import type { ChatMessage, MessageReaction, ReplyPreview } from "@/entities/message";
import {
  DELETED_MESSAGE_TEXT,
  type InlineEmoticonInfo,
  type MessageSegment,
} from "@/shared/config";
import {
  countInlineLines,
  countTextLines,
  findFirstUrl,
  measureLineHeight,
  type EmoticonItemId,
  type InlineRun,
  type Maybe,
  type MessageId,
  type Nullable,
  type Optional,
} from "@/shared/lib";
import { toEmoticonBox, toSoloEmoticonBox } from "./to-emoticon-box";
import { toInlineContent, type InlineContent } from "./to-inline-content";
import { toInlineEmoticonBox } from "./to-inline-emoticon-box";
import { toLinkCardRatio } from "./to-link-card-box";
import { toLinkOnlyUrl } from "./to-link-only";
import { MARKDOWN_LINE_CLASSES, toMarkdownHeight } from "./to-markdown-height";
import { MEDIA_EDGE, toMediaBoxHeight } from "./to-media-box";
import {
  isExpandableBody,
  toBodyLine,
  toTruncatedBodyHeight,
  TRUNCATED_LINES,
} from "./to-truncated-body";
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
  body: toBodyLine,
  name: () => measureLineHeight("text-chat-name", 12 * 1.3),
  time: () => measureLineHeight("text-chat-time", 11 * 1.2),
  caption: () => measureLineHeight("text-caption", 12 * 1.4),
  cardTitle: () => measureLineHeight("text-title-sm", 14 * 1.45),
  cardBody: () => measureLineHeight("text-body-sm", 13 * 1.55),
  // INFO: DESIGN.md § 6.10. The quote's summary line, which is `chat-name` at `leading-snug` rather than at its own.
  quoteSummary: () => measureLineHeight("text-chat-name leading-snug", 12 * 1.375),
};

/** Every class `LINE` reads, for the room to hand `warmLineHeights` as it takes its scroller. */
export const ROW_LINE_CLASSES = [
  "text-chat-body",
  "text-chat-name",
  "text-chat-time",
  "text-caption",
  "text-title-sm",
  "text-body-sm",
  "text-chat-name leading-snug",
  ...MARKDOWN_LINE_CLASSES,
] as const;

// INFO: DESIGN.md § 6.5. `max-w-[72%]` on the bubble column.
const COLUMN_RATIO = 0.72;

// INFO: DESIGN.md § 6.3., § 8.10. Two `size-7` hover-pill buttons, `gap-0.5` between them, `px-1` pill padding and a 1px border each side — the pointer's 답장/공유 pill's own rendered width, which sets the floor for the column below it.
const HOVER_PILL_WIDTH = 68;

// INFO: DESIGN.md § 6.3. The wider of the timestamp's own `w-14` (56) and the hover pill above — raised past 56 the moment the pill needed more, or a bubble at its wide cap left the pill nowhere to sit without covering it.
const TIME_COLUMN_WIDTH = Math.max(56, HOVER_PILL_WIDTH);

// INFO: DESIGN.md § 6.3. The column above plus the `gap-2xs` before it. Fixed there precisely so it is a constant here — the alternative is re-deriving the width of a formatted string this cannot see.
const TIME_SLOT = TIME_COLUMN_WIDTH + SPACING_2XS;

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

// INFO: `size-8` on the quote's thumbnail — one box for an attachment and an emoticon alike (DESIGN.md § 6.10.) — and the two lines beside it; whichever is taller is the quote's content (`items-center`).
const QUOTE_THUMBNAIL = 32;
// INFO: DESIGN.md § 6.10. `size-8` on the badge an emoticon reply wears in place of the card.
const REPLY_BADGE = 32;

// INFO: The old shell width. Only a fallback: the room passes the scroller's real width once it has one, and this is what the very first render estimates against.
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

/**
 * REQUIREMENTS.md § 13. Reads one inline emoticon's box out of the map the page came
 * down with. `undefined` for an id that page did not carry.
 *
 * WARN: § 8.3. Synchronous and never a fetch, exactly as `readPreview` is. The estimate
 * runs inside `getItemKey`'s memoized measurement pass for every row in the window; an
 * answer that arrives later is a re-measure of a row the reader is already looking at.
 * That is what § 2.4. sends the map down with the messages for.
 */
export type InlineEmoticonReader = (itemId: EmoticonItemId) => Optional<InlineEmoticonInfo>;

export type RowEstimateContext = {
  /** The scroller's own width, which the § 6.5. column is a percentage of. Absent until the scroller mounts. */
  contentWidth?: number;
  /**
   * REQUIREMENTS.md § 8.3., § 8.5. Whether AI 질문 모드's selection sweep is on —
   * read by `toTranslatedWidthContext`, never by a width formula directly, so a
   * `mine` row (never translated, DESIGN.md § 6.11.) can opt out of the gutter
   * `theirs`/assistant/system rows give back for it.
   */
  isSelecting?: boolean;
  /** As `getComputedStyle` reports it on the chat surface, so a wrap is counted in the font the bubble is drawn in. Blank on the server, where the width falls back to a ratio per glyph class. */
  fontFamily: string;
  readPreview: PreviewReader;
  /**
   * @see InlineEmoticonReader
   *
   * WARN: Required, and it MUST read the same map `MessageRow` draws from. Fed from two
   * sources the estimate and the bubble disagree about the box by construction, which is
   * the miss REQUIREMENTS.md § 8.3. exists to avoid.
   */
  readInlineEmoticon: InlineEmoticonReader;
  /** REQUIREMENTS.md § 11.5. The notice a system row renders, which is composed from the live nickname and so cannot be derived from the message alone. */
  readNotice: NoticeReader;
  /**
   * REQUIREMENTS.md § 8.8. How many participants have yet to read this message, which
   * is resolved against their cursors rather than stored on the row.
   *
   * WARN: Only whether it is **zero** reaches the height — the marker is one line in the
   * § 6.3. stack whatever the digit is, and `TIME_SLOT`'s 56px is sized for `오후 12:34`,
   * which no count this app can produce comes near. A marker that ever wrapped, or that
   * grew wide enough to move the width the text wraps in, would break that.
   */
  countUnreadReaders: (message: ChatMessage) => number;
  /** REQUIREMENTS.md § 8.19. The same test `renderRow` uses to pass `MessageRow`/`AssistantMessageRow` their own `isBookmarked` — a bookmarked row's marker line is priced exactly as the unread count's is. */
  isBookmarked: (id: MessageId) => boolean;
};

/** @see RowEstimateContext.readNotice */
export type NoticeReader = (message: ChatMessage) => string;

const DEFAULT_CONTEXT: RowEstimateContext = {
  fontFamily: "",
  readPreview: () => undefined,
  readInlineEmoticon: () => undefined,
  readNotice: () => "",
  countUnreadReaders: () => 0,
  isBookmarked: () => false,
};

// INFO: The half of a message a height follows from — `ChatMessage` and `PendingMessage` differ elsewhere, and an optimistic bubble is drawn at exactly the size the sent one will be.
type Payload = {
  text: Nullable<string>;
  /** REQUIREMENTS.md § 8.17. Folded to one line behind 펼치기 — the row's answer, not the message's, since this reader may have unfolded it in place. */
  isCollapsed?: boolean;
  // INFO: REQUIREMENTS.md § 13. Optional, because the tombstone payload below carries none and an optimistic bubble may predate the field — `toInlineContent` reads an absent list as "no emoticon in this text", which is the pre-format path.
  inlineEmoticonItemIds?: EmoticonItemId[];
  emoticon: Nullable<Emoticon>;
  replyTo: Nullable<ReplyPreview>;
  // INFO: DESIGN.md § 6.5. Only an optimistic bubble carries one; a message that landed is always sent.
  status?: "sending" | "queued" | "failed";
  reactions?: MessageReaction[];
  // INFO: REQUIREMENTS.md § 9.1. `filename` is what tells the box arithmetic a stack of file cards from a grid of photos; a bubble never mixes the two (§ 6.).
  // INFO: REQUIREMENTS.md § 9.3. A voice bubble is one fixed-height row rather than a box with a ratio, and `toMediaBoxHeight` reads that before either of the others.
  // WARN: Both voice fields, because a pending row is `MediaDraft[]` and a sent one is `ChatMedia[]` — the draft carries `waveformPeaks` and no `voice`, so dropping it here estimates an optimistic recording from its `0 / 0` box.
  media: {
    width: Nullable<number>;
    height: Nullable<number>;
    filename: Nullable<string>;
    voice?: Nullable<unknown>;
    waveformPeaks?: Nullable<number[]>;
  }[];
};

/**
 * REQUIREMENTS.md § 8.13. A tombstone measures as the one-line text bubble it is —
 * same padding, same hairline, same avatar floor — so it goes through the ordinary
 * arithmetic rather than a constant of its own.
 *
 * WARN: The copy is `DELETED_MESSAGE_TEXT` itself, never a literal repeated here.
 * `MessageRow` renders that same constant, and two spellings would be drift the
 * § 8.3. estimate has no way to notice.
 */
const TOMBSTONE_PAYLOAD: Payload = {
  text: DELETED_MESSAGE_TEXT,
  emoticon: null,
  replyTo: null,
  media: [],
  reactions: [],
};

type RowFlags = {
  isFirstOfGroup: boolean;
  /** DESIGN.md § 6.3. How many lines stand in the column beside the bubble: the timestamp, § 8.8.'s unread count, § 8.13.'s 수정됨, or any of them stacked. Zero when none is there. */
  besideLines: number;
};

// INFO: The height of the `ReactionBadges` row below the bubble.
// Parent `gap-2xs` (4px) + `mt-0.5` (2px) + `h-7` (28px) = 34px.
const REACTION_BADGES_HEIGHT = 34;

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
    // WARN: § 6.11. A system row is always translated (`isTranslatedRow`), so it always gives back the selection gutter — never conditioned on `isMine`, which it has none of.
    case "system":
      return (
        SPACING_SM * 2 +
        PILL_PADDING +
        toNoticeHeight(row.message, toTranslatedWidthContext(context))
      );
    // INFO: DESIGN.md § 6.2., § 7.7. The finished AI answer — avatar, name, then a wide `MarkdownBody` bubble, never grouped with a neighbor (`buildChatRows`).
    // WARN: § 6.11. An assistant row is always translated, exactly as a system row is — it always gives back the selection gutter.
    case "assistant":
      return (
        SPACING_SM +
        Math.max(
          toAssistantColumnHeight(row.message, row.isCollapsed, toTranslatedWidthContext(context)),
          AVATAR_SIZE,
        )
      );
    case "message":
      /**
       * WARN: REQUIREMENTS.md § 8.13. Ahead of everything the payload could say. A
       * withdrawn photo message keeps none of its box and a withdrawn emoticon none
       * of its art, so falling through would price a grid the tombstone does not
       * draw — the largest miss this file can make, and one that only surfaces when
       * the reader scrolls back onto it.
       */
      if (row.message.isDeleted) {
        return estimateMessageRow(
          { ...TOMBSTONE_PAYLOAD, reactions: row.message.reactions },
          row.isMine,
          context,
          {
            isFirstOfGroup: row.isFirstOfGroup,
            // INFO: § 8.13. The timestamp, and § 16.1.'s mark which survives the delete as `only_me` does — a tombstone carries neither the unread count nor 수정됨.
            // INFO: REQUIREMENTS.md § 8.19. A bookmark is per-user state on the id and survives the delete the same way.
            besideLines:
              Number(row.isLastOfGroup || row.message.silent) +
              Number(context.isBookmarked(row.message.id)),
          },
        );
      }

      return estimateMessageRow(
        { ...row.message, isCollapsed: row.isCollapsed },
        row.isMine,
        context,
        {
          isFirstOfGroup: row.isFirstOfGroup,
          // INFO: REQUIREMENTS.md § 8.8. The unread count and the timestamp stack in one `flex-col`, so an unread message of mine is two lines rather than one — and the count alone puts the column beside a bubble that is not its group's last.
          // WARN: § 8.8. The count is **one line or none**, never a line per reader, so this stays a `Number()` of a predicate. It is also why the marker moved from 읽음 — which sat on one bubble — to a mark on every unread one: the rows that carry the column changed, and the arithmetic did not.
          // INFO: REQUIREMENTS.md § 8.13. 수정됨 is a third line in the same stack, which is the whole reason it was put there: `LINE.time()` already prices it, and `수정됨` clears `TIME_SLOT`'s 56px with room to spare so the width the text wraps in does not move.
          // INFO: REQUIREMENTS.md § 16.1. The `BellOff` mark shares the unread marker's `h-[1lh]` line, so the two together are one predicate line rather than two.
          besideLines:
            Number(row.isLastOfGroup || row.message.silent) +
            Number(
              context.countUnreadReaders(row.message) > 0 ||
                context.isBookmarked(row.message.id) ||
                row.message.editedAt !== null,
            ),
        },
      );
    case "pending":
      // INFO: An optimistic bubble is always mine, so it never carries the avatar column or a sender name — nor the unread count, since it has not been sent and nobody could have read it.
      // INFO: REQUIREMENTS.md § 16.1. The payload's own mode, the same source the render reads — the § 16.1. mark is a line here exactly as on a landed row.
      // WARN: § 8.3. The ids are derived here because a pending row holds the emoticons *whole* and the sent one holds their ids — dropped, an optimistic bubble prices as though its emoticons were not in it and corrects the scroll the moment it renders.
      return estimateMessageRow(
        {
          ...row.pending,
          inlineEmoticonItemIds: row.pending.inlineEmoticons.map(({ id }) => id),
          reactions: [],
        },
        true,
        context,
        {
          isFirstOfGroup: row.isFirstOfGroup,
          besideLines: Number(row.isLastOfGroup || row.pending.notifyMode === "silent"),
        },
      );
  }
}

function estimateMessageRow(
  payload: Payload,
  isMine: boolean,
  context: RowEstimateContext,
  flags: RowFlags,
): number {
  // WARN: § 6.11. `mine` is never translated (`isTranslatedRow`) — its own cap reduction already frees the check circle's room on its right-aligned column — so every width this function reads below must skip the selection gutter for it, while `theirs` gives it back exactly as an assistant/system row does.
  context = isMine ? context : toTranslatedWidthContext(context);

  const hasMedia = payload.media.length > 0;
  // WARN: § 8.3. The same call `MessageRow` makes, and the reason it lives in one function — a lone inline emoticon draws bubble-less like an emoticon message, so it changes the quote's variant and withholds the § 8.9. card exactly as an attachment does.
  const inline = toInlineContent(payload.text, payload.inlineEmoticonItemIds);
  // WARN: § 8.3. The box decides this and not the kind, exactly as `MessageRow`'s does: an id the page's map does not carry has no picture to draw large, so that row is an ordinary bubble holding a one-line tombstone.
  const solo = inline.kind === "solo" ? context.readInlineEmoticon?.(inline.itemId) : undefined;
  const hasArt = hasMedia || payload.emoticon !== null || solo !== undefined;
  // INFO: DESIGN.md § 6.9. The card is a row of its own above the bubble, and § 8.9.'s scrape has normally already answered by the time this is asked — `useLinkPreviewPrefetch` sees to that, and it is the only reason a height is knowable here at all.
  const preview = hasArt ? undefined : context.readPreview(findFirstUrl(payload.text));
  // WARN: § 8.3. `MessageRow`'s own test, answered off the same cache: a link-only message is bubble-less once its card is there, so the card counts below in the bubble's row and nowhere above it.
  const linkOnlyCard =
    preview && toLinkOnlyUrl(payload.text, inline) !== null ? preview : undefined;
  // WARN: REQUIREMENTS.md § 8.17. A folded row is always the ordinary text bubble, whatever its content would otherwise draw. `messages_collapsed_is_prose_check` makes that nearly unreachable, but a `text` row *can* be a lone inline emoticon or a bare link — and a fold that kept those would price a picture where the row draws one clamped line.
  const isBubbleless = !payload.isCollapsed && (hasArt || linkOnlyCard !== undefined);
  let column = 0;

  // INFO: REQUIREMENTS.md § 8.7. The sender's name, on the first bubble of the other participant's group only.
  if (!isMine && flags.isFirstOfGroup) {
    column += LINE.name() + SPACING_2XS;
  }

  // INFO: DESIGN.md § 6.10. A bubble-less message quotes in a card above itself; a text one quotes inside its bubble, and that one is counted with the bubble's contents.
  if (payload.replyTo && isBubbleless) {
    column += toQuoteHeight(payload.replyTo, "card", isMine) + SPACING_2XS;
  }

  if (preview && !linkOnlyCard) {
    column += toLinkCardHeight(preview, toColumnWidth(context), context) + SPACING_2XS;
  }

  column += toPayloadHeight(
    payload,
    isMine,
    isBubbleless,
    inline,
    solo,
    linkOnlyCard,
    context,
    flags,
  );

  if (payload.reactions && payload.reactions.length > 0) {
    const uniqueGroups = new Set(
      payload.reactions.map((r) =>
        r.reactionType === "emoji" ? `emoji:${r.emoji}` : `emoticon:${r.emoticonItemId}`,
      ),
    ).size;

    // INFO: A badge with padding and gap is ~48px wide. `toWideColumnWidth` is the available column width.
    const badgesPerLine = Math.max(1, Math.floor(toWideColumnWidth(context) / 48));
    const lines = Math.ceil(uniqueGroups / badgesPerLine);

    // INFO: The first line is REACTION_BADGES_HEIGHT (34px). Each wrapped line adds `gap-1` (4px) + `h-7` (28px) = 32px.
    column += REACTION_BADGES_HEIGHT + (lines - 1) * 32;
  }

  // INFO: DESIGN.md § 6.1. The gap between rows is this padding, so it belongs to the row below it.
  const top = flags.isFirstOfGroup ? SPACING_SM : SPACING_2XS;

  // INFO: DESIGN.md § 6.3. The avatar, and the spacer standing in for it through the rest of a group, are siblings of this column — so a bubble shorter than one cannot make the row shorter than one.
  return top + (isMine ? column : Math.max(column, AVATAR_SIZE));
}

function toPayloadHeight(
  payload: Payload,
  isMine: boolean,
  isBubbleless: boolean,
  inline: InlineContent,
  solo: Optional<InlineEmoticonInfo>,
  linkOnlyCard: Optional<LinkPreview>,
  context: RowEstimateContext,
  flags: RowFlags,
): number {
  // INFO: DESIGN.md § 6.3., § 6.5. Whatever stands beside the bubble in the same `items-end` row: the retry/cancel pair on a failed send, otherwise the timestamp. The row is whichever is taller — text always wins over a timestamp, but not over the controls, and not necessarily over a wide-and-short attachment.
  const beside = toBesideHeight(payload, flags);

  if (payload.isCollapsed) {
    // INFO: § 8.17. Straight to the bubble — every branch below draws something a folded row does not.
    return Math.max(
      SPACING_XS * 2 +
        (isMine ? 0 : BUBBLE_BORDER) +
        toQuoteBlockHeight(payload, isBubbleless, isMine) +
        toTextHeight(payload.text, isMine, inline, context, payload.status, true),
      beside,
    );
  }

  // INFO: DESIGN.md § 6.10. The reply badge stands in the same row, so it floors the row exactly as the timestamp does.
  const besideArt = payload.replyTo ? Math.max(beside, REPLY_BADGE) : beside;
  if (payload.emoticon) {
    return Math.max(toEmoticonBox(payload.emoticon).height, besideArt);
  }

  // INFO: § 13. `toSoloEmoticonBox`, not `toEmoticonBox` — a solo mini draws smaller than an emoticon message. A deleted item keeps its stored box, so the tombstone standing in its place measures identically.
  if (solo) {
    return Math.max(toSoloEmoticonBox(solo).height, besideArt);
  }

  if (payload.media.length > 0) {
    return Math.max(toMediaBoxHeight(payload.media), beside);
  }

  // WARN: DESIGN.md § 6.9. The column less what stands beside it, where the top card has the column to itself — on a narrow shell the card is what shrinks, and with it the title's wrap and the thumbnail's 9/16.
  if (linkOnlyCard) {
    const width = toColumnWidth(context) - toBesideWidth(payload.status);

    return Math.max(toLinkCardHeight(linkOnlyCard, width, context), beside);
  }

  // INFO: `px-sm py-xs` on the bubble, and the hairline the other participant's bubble is bordered with (DESIGN.md § 6.2.).
  const height =
    SPACING_XS * 2 +
    (isMine ? 0 : BUBBLE_BORDER) +
    toQuoteBlockHeight(payload, isBubbleless, isMine);

  return Math.max(
    height + toTextHeight(payload.text, isMine, inline, context, payload.status),
    beside,
  );
}

// INFO: DESIGN.md § 6.10. `pb-2xs` and the 1px divider under an in-bubble quote, then `mb-2xs` between that and the text.
function toQuoteBlockHeight(payload: Payload, isBubbleless: boolean, isMine: boolean): number {
  if (!payload.replyTo || isBubbleless) {
    return 0;
  }

  return toQuoteHeight(payload.replyTo, "rule", isMine) + SPACING_2XS * 2 + 1;
}

function toBesideHeight(payload: Payload, { besideLines }: RowFlags): number {
  // WARN: `queued` reserves the same box as `failed`, and must. REQUIREMENTS.md § 8.5.'s outbox draws the identical two-slot column for one — a clock over 전송 취소 — so estimating it as a timestamp is a row the virtualizer has to correct on measure.
  if (hasControlColumn(payload.status)) {
    return FAILED_CONTROLS;
  }

  return besideLines * LINE.time();
}

// INFO: DESIGN.md § 6.3., § 6.5., § 8.10. Whatever stands beside the bubble takes its width off it: the retry/cancel column on a failed send, the timestamp/hover-pill slot otherwise — unconditionally now, since the hover pill can appear whether or not this particular row shows a visible timestamp.
function toBesideWidth(status: Payload["status"]): number {
  return hasControlColumn(status) ? FAILED_SLOT : TIME_SLOT;
}

function toTextHeight(
  text: Nullable<string>,
  isMine: boolean,
  inline: InlineContent,
  context: RowEstimateContext,
  status?: Payload["status"],
  isCollapsed = false,
): number {
  if (!text) {
    return 0;
  }

  // INFO: REQUIREMENTS.md § 8.17. One clamped line and the 펼치기 row under it — no measurement at all, which is what makes a folded row the cheapest one in the list.
  if (isCollapsed) {
    return LINE.body() + toExpandRowHeight();
  }

  const { fontFamily } = context;
  // INFO: DESIGN.md § 6.2., § 6.11. The bubble's own wide cap, not the § 6.5. 72% column — REQUIREMENTS.md § 8.15.'s AI answer bubble and an ordinary one share one formula, `toWideColumnWidth`, and one avatar gutter regardless of side.
  const column = toWideColumnWidth(context);
  // WARN: `box-sizing: border-box`, so the other participant's hairline is width taken from the text and not added around it.
  const available = Math.max(
    column - toBesideWidth(status) - SPACING_SM * 2 - (isMine ? 0 : BUBBLE_BORDER),
    CHAT_BODY.size,
  );
  const font = { ...CHAT_BODY, family: fontFamily };
  const line = LINE.body();

  // WARN: § 8.3. `MessageText`'s own split. A `solo` reaches this bubble only when its box was missing, and the walk it draws through prints no placeholder glyph — measured as raw text it would cost a line the row does not have.
  // WARN: § 8.3. The inline path is entered **only** for text that actually holds an emoticon, so every message written before this format keeps `countTextLines` byte for byte. The two measurers agree on `word-break: normal` but not on whitespace or on `keep-all`, so routing plain text through the new one would re-price the whole history for nothing.
  const lines =
    inline.kind !== "none"
      ? countInlineLines(toInlineRuns(inline.segments, context, line), font, available)
      : // INFO: `whitespace-pre-wrap` on the bubble, so a newline is a hard break and runs of spaces are kept rather than collapsed.
        // INFO: DESIGN.md § 4.2.3. The bubble is the one place that opts out of `keep-all`, so it is measured broken between syllables too.
        countTextLines(text, font, available, "pre-wrap", "normal");

  if (!isExpandableBody(text)) {
    return lines * line;
  }

  // INFO: REQUIREMENTS.md § 8.16. `line-clamp` draws exactly that many line boxes, so the cut bubble is knowable to the line rather than approximated.
  return Math.min(lines, TRUNCATED_LINES) * line + toExpandRowHeight();
}

// INFO: DESIGN.md § 6.2.2. The 전체보기 row's `mt-2xs`, the hairline over it, its `pt-2xs`, and the one `chat-body` line it holds.
function toExpandRowHeight(): number {
  return SPACING_2XS * 2 + 1 + LINE.body();
}

/**
 * REQUIREMENTS.md § 13. The bubble's own runs, with each emoticon standing as the box it
 * will draw at.
 *
 * WARN: `InlineEmoticon` is `1lh` tall with the ratio doing the width, so the box is
 * `lineHeight × ratio` — and it is that **before** the asset loads, which is the whole
 * reason this is knowable here at all. A box derived from the loaded image would re-wrap
 * the text under the reader.
 *
 * WARN: Every segment answers with a run, an id the page never sized included.
 * `MessageText` draws that one as a square tombstone through the same
 * `toInlineEmoticonBox`, and skipping it here would price a line the bubble does not have.
 */
function toInlineRuns(
  segments: readonly MessageSegment[],
  { readInlineEmoticon }: RowEstimateContext,
  lineHeight: number,
): InlineRun[] {
  return segments.map<InlineRun>((segment) =>
    segment.kind === "text"
      ? { text: segment.text }
      : { boxWidth: lineHeight * toInlineEmoticonBox(readInlineEmoticon?.(segment.itemId)).ratio },
  );
}

/**
 * DESIGN.md § 6.9. The card's own height, which is knowable because
 * `useLinkPreviewPrefetch` has already answered the scrape (REQUIREMENTS.md § 8.3.).
 *
 * WARN: The one part of a row that was left at zero after the estimate went per-row, and it is the largest miss of the lot — a card with a thumbnail is ~250px, so a link bubble estimated without it lands a whole card short and corrects by that much the moment it is measured.
 */
function toLinkCardHeight(
  preview: LinkPreview,
  columnWidth: number,
  { fontFamily }: RowEstimateContext,
): number {
  // WARN: The card is the § 6.5. attachment width only while the column can spare it — below a shell of about 340px the column is narrower and the card shrinks with it.
  const { title, description, siteName, imageUrl } = preview;
  const card = Math.min(MEDIA_EDGE, columnWidth);
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

  // INFO: `toLinkCardRatio` (DESIGN.md § 6.9.), reserved whether or not the asset ever arrives — which is what keeps this true after a refusal.
  // WARN: The ratio is of the card's *content* box. `box-sizing: border-box` puts the hairline inside the card's width, so the image is that much narrower and shorter by the same ratio.
  return imageUrl ? text + (card - CARD_BORDER) / toLinkCardRatio(preview) : text;
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

// INFO: DESIGN.md § 6.9. Still a percentage of the row's content box (less its `px-md`) — only the link card and quote widths read this now, and both clamp to § 6.5.'s 220px attachment width regardless of what this returns.
function toColumnWidth({ contentWidth = DEFAULT_CONTENT_WIDTH }: RowEstimateContext): number {
  return (contentWidth - SPACING_MD * 2) * COLUMN_RATIO;
}

// INFO: DESIGN.md § 6.11. The row's content box less the avatar and its `gap-xs` — one gutter, shared by `mine`, `theirs` and the assistant row alike, regardless of what each row's own DOM actually spends on the avatar column (a `mine` row renders no avatar at all and still caps here). This is the cap `max-w-[calc(100%-44px)]` renders on all three, before each subtracts the § 6.3. `TIME_SLOT` its own beside content shares the line with.
const AVATAR_GUTTER = AVATAR_SIZE + SPACING_XS;

function toWideColumnWidth({ contentWidth = DEFAULT_CONTENT_WIDTH }: RowEstimateContext): number {
  return Math.max(contentWidth - SPACING_MD * 2 - AVATAR_GUTTER, CHAT_BODY.size);
}

// INFO: DESIGN.md § 6.11., REQUIREMENTS.md § 8.5. `SelectableRow`'s own 40px gutter — given back only by a row whose content actually translates for it. A `mine` row is never translated (its cap reduction alone already frees the room the check circle needs on its right-aligned column), so it keeps this width unchanged; every other row (`theirs`, assistant, system, date) gives back the same 40px every width it computes reads here, matching what `SelectableRow`'s translate actually does to it.
const SELECTION_GUTTER_WIDTH = 40;

function toTranslatedWidthContext(context: RowEstimateContext): RowEstimateContext {
  if (!context.isSelecting) {
    return context;
  }

  return {
    ...context,
    contentWidth: (context.contentWidth ?? DEFAULT_CONTENT_WIDTH) - SELECTION_GUTTER_WIDTH,
  };
}

/**
 * DESIGN.md § 6.2., § 7.7. The finished assistant row's own column: the provider
 * name above the bubble, then the taller of the bubble's markdown text and the
 * timestamp beside it — the same `max(content, beside)` shape `estimateMessageRow`
 * uses, but against the row's own wide column rather than the § 6.5. 72% one.
 *
 * WARN: The bubble's own height comes from `toMarkdownHeight`, which lays the answer's
 * blocks out rather than counting its source lines. Counted, a blank line between two
 * paragraphs was priced as a line where the browser draws a 4px gap — 17px per paragraph,
 * the largest error this file had — and every heading, rule and fenced block was priced as
 * the body text it is not.
 */
function toAssistantColumnHeight(
  message: ChatMessage,
  isCollapsed: boolean,
  context: RowEstimateContext,
): number {
  const width = toAssistantBubbleWidth(context);
  // INFO: REQUIREMENTS.md § 8.13. A withdrawn answer gives its markdown up for the one-line tombstone `AssistantMessageRow` draws in its place — plain text in the bubble, so it takes neither `MarkdownBody`'s blocks nor its `word-break`.
  // INFO: REQUIREMENTS.md § 8.17. One clamped line of the answer's own source, drawn as plain body text rather than as markdown — a `max-height` of one line would cut an `h1` through the middle of its glyphs.
  const content = isCollapsed
    ? LINE.body() + toExpandRowHeight()
    : message.isDeleted
      ? Math.max(
          1,
          countTextLines(DELETED_MESSAGE_TEXT, { ...CHAT_BODY, family: context.fontFamily }, width),
        ) * LINE.body()
      : toAnswerHeight(message.text ?? "", width, context.fontFamily);
  // INFO: REQUIREMENTS.md § 8.15. The question the answer quotes, priced where `toPayloadHeight` prices a reply's own — the same `pb-2xs`, 1px divider and `mb-2xs` the bubble draws it with.
  const quote =
    message.replyTo && !message.isDeleted
      ? toQuoteHeight(message.replyTo, "rule", false) + SPACING_2XS * 2 + 1
      : 0;

  // INFO: REQUIREMENTS.md § 8.19. An AI answer carries no unread/수정됨 stack — a bookmark is the one extra line its own meta column can hold, above the timestamp.
  const timeSlot = context.isBookmarked(message.id) ? LINE.time() * 2 : LINE.time();

  return (
    LINE.name() + SPACING_2XS + Math.max(SPACING_XS * 2 + BUBBLE_BORDER + quote + content, timeSlot)
  );
}

/**
 * REQUIREMENTS.md § 8.16. The answer's markdown, cut where § 6.2.2. cuts it.
 *
 * WARN: `min` and not the clamp outright — the cut is decided by the source's length, so an
 * answer long enough to earn the 전체보기 row can still lay out shorter than the clamp, and
 * pricing it at the clamp would reserve blocks the bubble never draws.
 */
function toAnswerHeight(text: string, width: number, fontFamily: string): number {
  const height = toMarkdownHeight(text, width, fontFamily);

  if (!isExpandableBody(text)) {
    return height;
  }

  return Math.min(height, toTruncatedBodyHeight()) + toExpandRowHeight();
}

// INFO: DESIGN.md § 6.2., § 6.11. The assistant bubble's own `px-sm` padding and `border` come off the wide column the same way `toTextHeight` takes them off a `theirs` bubble's — an AI answer is always `theirs`-shaped, so this is that formula with no `status` control-column and no unread/수정됨 stack to vary the `TIME_SLOT` beside it.
function toAssistantBubbleWidth(context: RowEstimateContext): number {
  return Math.max(
    toWideColumnWidth(context) - TIME_SLOT - SPACING_SM * 2 - BUBBLE_BORDER,
    CHAT_BODY.size,
  );
}

// INFO: DESIGN.md § 6.5. The pill is centred in the row's `px-md` and wraps inside its own `px-md`.
function toNoticeHeight(
  message: ChatMessage,
  { contentWidth = DEFAULT_CONTENT_WIDTH, fontFamily, readNotice }: RowEstimateContext,
): number {
  const available = Math.max(contentWidth - SPACING_MD * 4, PILL.size);

  // WARN: `pre-wrap`, because REQUIREMENTS.md § 11.5.'s notice puts the event title on a line of its own — measured under `normal` the break collapses and every notice row is priced one line short.
  return (
    countTextLines(readNotice(message), { ...PILL, family: fontFamily }, available, "pre-wrap") *
    LINE.caption()
  );
}

function toQuoteHeight(replyTo: ReplyPreview, variant: "rule" | "card", isMine: boolean): number {
  const content = Math.max(
    replyTo.thumbnail ? QUOTE_THUMBNAIL : 0,
    LINE.time() + LINE.quoteSummary(),
  );

  if (variant === "rule") {
    // INFO: DESIGN.md § 6.10. It draws nothing of its own, and the divider under the in-bubble one is priced where it is applied.
    return content;
  }

  // INFO: DESIGN.md § 6.2. The bubble's own `py-xs` and the hairline only the other participant's fill carries — the card follows the bubble it stands in for.
  return content + SPACING_XS * 2 + (isMine ? 0 : BUBBLE_BORDER);
}

// INFO: DESIGN.md § 6.5. The two states that stand a control column beside the bubble in place of a clock.
function hasControlColumn(status: Payload["status"]): boolean {
  return status === "failed" || status === "queued";
}
