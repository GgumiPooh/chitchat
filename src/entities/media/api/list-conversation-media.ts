import "server-only";

import { CHAT_MEDIA_TRACK_SPAN, VISUAL_KINDS } from "@/shared/config";
import { getDb, media, messageMedia, messages } from "@/shared/db";
import type { MediaId, MessageId, Optional } from "@/shared/lib";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { toChatMedia } from "../model/to-chat-media";
import type { ChatTrackMedia } from "../model/types";

/**
 * Where a row sits in the conversation. REQUIREMENTS.md § 8.1.
 *
 * WARN: `(message_id, sort_order)` and never `media.created_at`. Every attachment of
 * one multi-photo send shares the transaction timestamp (§ 6.), so a timestamp
 * cursor cannot separate them — and `sort_order` is the order the **sender** picked,
 * which is the order the bubble draws them in. Ordering the track any other way
 * makes a swipe through one bubble disagree with the bubble it came from.
 */
type TrackPosition = { messageId: MessageId; sortOrder: number };

export type ListConversationMediaParams = {
  /** The slide the reader tapped — the window comes back centred on it (REQUIREMENTS.md § 8.1.). */
  around?: MediaId;
  /** The track's **oldest** loaded slide; the answer is the page of the conversation before it, which extends the front of the track. */
  before?: MediaId;
  /** The track's **newest** loaded slide; the answer is the page after it, which extends the back. */
  after?: MediaId;
};

/**
 * One page of the conversation's photos and videos in send order
 * (REQUIREMENTS.md § 8.1.) — the § 7.10. viewer's track in 채팅.
 *
 * INFO: `around` is the window the viewer opens on and `before` / `after` are the stretches it grows by as the reader nears either edge. All three name a **media id** rather than a cursor pair, because the position is a join row's `(message_id, sort_order)` and resolving it is this module's own business (see `findPosition`).
 * INFO: `around` wins over the other two rather than combining with them, exactly as `listMessages` and `listArchiveMedia` resolve the same set — they name different windows.
 *
 * WARN: 파일 and 음성 are excluded, and they have to be named separately. § 6. keeps
 * one bubble to one kind, so a bubble's own cells are never mixed — but this track
 * crosses bubbles, and neither a file nor a recording has a `_thumb` object or a box
 * (§ 9.1., § 9.3.), so either one reaching a slide is a swipe into nothing.
 *
 * WARN: A row hidden from 보관함 is still here. § 10.'s delete takes a photo out of
 * the library and deliberately leaves the bubble that carries it, so the track reads
 * the conversation rather than `isInLibrary`.
 */
export async function listConversationMedia({
  around,
  before,
  after,
}: ListConversationMediaParams): Promise<ChatTrackMedia[]> {
  const anchor = await findPosition(around ?? before ?? after);

  if (!anchor) {
    return [];
  }

  if (!around) {
    // INFO: The front page is read away from the anchor and reversed back into send order, exactly as the window's older half is.
    return before
      ? (await selectPage(comparedToAnchor("<", anchor), "desc")).reverse()
      : selectPage(comparedToAnchor(">", anchor), "asc");
  }

  const [older, atOrNewer] = await Promise.all([
    // INFO: Descending so the limit takes the `CHAT_MEDIA_TRACK_SPAN` rows *nearest* the anchor rather than the conversation's oldest, then reversed back into send order.
    selectPage(comparedToAnchor("<", anchor), "desc"),
    // WARN: Inclusive of the anchor, and one row wider for it. `useViewerTrack` reads "there may be more beyond this edge" off each half having filled `CHAT_MEDIA_TRACK_SPAN`, and a half that spent one of its rows on the anchor would report the newer edge exhausted one row early on every open.
    selectPage(comparedToAnchor(">=", anchor), "asc", CHAT_MEDIA_TRACK_SPAN + 1),
  ]);

  return [...older.reverse(), ...atOrNewer];
}

/**
 * INFO: The anchor is named by media id because that is what the viewer holds, and resolved to a position because that is what the conversation is ordered by.
 *
 * WARN: A withdrawn message's attachments are gone from the track, so an anchor inside one resolves to nothing and the caller is handed an empty track rather than a window around a hole. The § 8.13. stream withdraws the viewer in that case anyway; this is the race where the tap and the withdrawal cross.
 */
async function findPosition(anchorId: Optional<MediaId>): Promise<Optional<TrackPosition>> {
  if (!anchorId) {
    return undefined;
  }

  const [position] = await getDb()
    .select({ messageId: messageMedia.messageId, sortOrder: messageMedia.sortOrder })
    .from(messageMedia)
    .innerJoin(messages, eq(messages.id, messageMedia.messageId))
    .where(and(eq(messageMedia.mediaId, anchorId), isNull(messages.deletedAt)))
    .orderBy(asc(messageMedia.messageId))
    .limit(1);

  return position;
}

/**
 * WARN: Joined from `message_media` rather than selected from `media` with an
 * `exists`, which is the shape `listArchiveMedia` needs and this one must not copy —
 * the ordering columns live on the join row.
 *
 * WARN: The join can in principle emit one media id twice, and **every consumer downstream assumes it does not.** `MediaViewer` keys its slides by `cell.id`, `toTrackOwners` maps one owner per id, and the viewer resolves the held slide by `findIndex` on that id — so a repeat would duplicate a React key, attribute both positions to one sender, and snap a swipe onto the second copy back to the first. Nothing produces one today: a `media` row reaches exactly one message, because the only writer is the send that registered it and the app has no forward. **Adding a forward means deduping here, or keying the track by `(message_id, sort_order)` instead** — not leaving this comment as licence.
 */
async function selectPage(
  within: SQL,
  direction: "asc" | "desc",
  limit: number = CHAT_MEDIA_TRACK_SPAN,
) {
  const order = direction === "asc" ? asc : desc;
  const rows = await getDb()
    .select({ row: media, messageId: messageMedia.messageId, senderId: messages.senderId })
    .from(messageMedia)
    .innerJoin(messages, eq(messages.id, messageMedia.messageId))
    .innerJoin(media, eq(media.id, messageMedia.mediaId))
    // INFO: RESTRUCTURE.md § 1.2. `VISUAL_KINDS` — the set with a box to draw, which is what the § 7.10. viewer can open at all. It was `filename IS NULL AND waveform_peaks IS NULL` before the kind column, and the two answer the same rows.
    // INFO: RESTRUCTURE.md § 4.3. A destroyed object has nothing to open, so it is not a slide. The bubble's own grid still draws a tombstone where it was.
    .where(
      and(
        isNull(messages.deletedAt),
        isNull(media.deletedAt),
        inArray(media.kind, [...VISUAL_KINDS]),
        within,
      ),
    )
    .orderBy(order(messageMedia.messageId), order(messageMedia.sortOrder))
    .limit(limit);

  return rows.map(({ row, messageId, senderId }) => ({
    ...toChatMedia(row),
    messageId,
    senderId,
  }));
}

/**
 * WARN: The operator is interpolated raw because a row-constructor comparison has no
 * drizzle helper to express it. It is a literal of `PairOperator` at every call site
 * and must never become a value read off a request.
 *
 * WARN: Both halves are cast. Without them Postgres infers the parameter types from
 * the row constructor, where an `unknown` resolves to `text` — and `10` then sorts
 * after `9` (`listArchiveMedia` carries the same warning for its own pair).
 *
 * WARN: `>=` is the one that includes the row the anchor names, and only the window
 * wants it — a page reaching past an edge must exclude the slide it was measured
 * from, or every page repeats it.
 */
function comparedToAnchor(operator: PairOperator, anchor: TrackPosition): SQL {
  return sql`(${messageMedia.messageId}, ${messageMedia.sortOrder}) ${sql.raw(operator)} (${anchor.messageId}::bigint, ${anchor.sortOrder}::smallint)`;
}

type PairOperator = "<" | ">" | ">=";
