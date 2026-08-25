import type { MediaId, MessageId, Nullable, UserId } from "@/shared/lib";

/**
 * A media object as it crosses the API. It carries no URL — REQUIREMENTS.md § 9.
 * mints a presigned one per request behind `GET /api/media/{id}`, so a URL on the
 * wire would be expired by the time anything reused it.
 */
export type ChatMedia = {
  mime: string;
  // INFO: REQUIREMENTS.md § 8.3. What the virtualizer reserves the row's box from — null wherever there is no box (a file attachment, § 9.1., or a voice message, § 9.3.), both drawn at a fixed height. Null rather than `0`, so it's a branch the compiler asks for instead of a convention every reader has to remember.
  width: Nullable<number>;
  height: Nullable<number>;
  /** REQUIREMENTS.md § 9.3. The running time a voice player draws its progress against, and a video cell its badge. */
  durationMs: Nullable<number>;
  blurhash: Nullable<string>;
  /**
   * REQUIREMENTS.md § 9.1. The name a file attachment was sent under, and the
   * discriminator that says it is one — `null` for every photo and video.
   */
  filename: Nullable<string>;
  /**
   * REQUIREMENTS.md § 9.3. Set on a voice message and the flag that says it is
   * one — the same job `filename` does for a file attachment. `null` on
   * everything else, never `{ peaks: [] }`, since every reader tests it for
   * truthiness. Peaks are `0`–`1` here, `0`–`VOICE_PEAK_SCALE` integers in the
   * column; `toChatMedia` is the one place that converts.
   */
  voice: Nullable<{ peaks: number[] }>;
  // INFO: § 9.1. The file card names its own size, which is the only thing it can say about a document it cannot draw.
  size: number;
  /**
   * Whether the uploader has deleted the object outright, making the cell a
   * tombstone rather than a picture. § 4.3.: the row survives the delete —
   * `message_media`'s FK and § 8.13.'s resume reconciliation both need it — and
   * the geometry fields above stay populated on purpose, so the § 8.3. virtualized
   * list re-measures nothing when a row is deleted out from under it.
   */
  isDeleted: boolean;
  id: MediaId;
};

/**
 * One slide of the chat viewer's track (REQUIREMENTS.md § 8.1.) — the conversation's
 * photos and videos in send order. `messageId` is not nullable here, unlike
 * `ArchiveMedia`'s — a row reaches this track only by being carried by a message
 * that is still visible, so a library-only upload has no slide.
 *
 * INFO: `senderId` rather than a server-resolved `isMine` — the room already holds `currentUserId` and decides every other bubble's side with it (§ 6.).
 * INFO: No `createdAt` — DESIGN.md § 7.10.'s caption reads `idToDate(id)`, which is the instant the id already carries.
 */
export type ChatTrackMedia = ChatMedia & {
  messageId: MessageId;
  senderId: UserId;
};

/**
 * A library tile (REQUIREMENTS.md § 10.). No `createdAt` here either, for the
 * reason on `ChatTrackMedia` — the month section header and the keyset cursor
 * are both the id now.
 */
export type ArchiveMedia = ChatMedia & {
  /**
   * REQUIREMENTS.md § 10. The message this tile was sent in, which 대화에서 보기
   * jumps to (§ 8.6.1.). `null` is ordinary, not an error — a row uploaded straight
   * into the library, or one whose message has since been deleted, has none; the
   * control is withheld there rather than jumping to nothing.
   */
  messageId: Nullable<MessageId>;
  /**
   * DESIGN.md § 7.10. Who sent the tile, for the viewer's top bar. Resolved from
   * `users` on every read, never projected onto the row (§ 8.7.), so a rename is
   * retroactive across history. `null` wherever `messageId` is, for the same reason.
   */
  senderName: Nullable<string>;
};

/**
 * AGENTS.md § 4.1. One month's true tile count on a shelf — the `lg` panel's
 * own aggregate, separate from `ArchiveMedia` since it counts rows `listArchiveMedia`
 * has not paged in yet as readily as ones it has.
 */
export type ArchiveMonthCount = {
  monthKey: string;
  count: number;
};
