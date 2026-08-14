import type { MediaId, MessageId, Nullable, UserId } from "@/shared/lib";

/**
 * A media object as it crosses the API. It carries no URL — REQUIREMENTS.md § 9.
 * mints a presigned one per request behind `GET /api/media/{id}`, so a URL on the
 * wire would be expired by the time anything reused it.
 */
export type ChatMedia = {
  mime: string;
  // INFO: REQUIREMENTS.md § 8.3. What the virtualizer reserves the row's box from, before the asset loads.
  // INFO: The finished restructure. Null wherever there is no box — a file attachment (§ 9.1.) and a voice message (§ 9.3.), both drawn at a fixed height. It used to be `0`, and the sentinel is what made "read `filename` and `voice` first" a rule every reader had to remember; a null is a branch the compiler asks for.
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
   * one — the same job `filename` does for a file attachment.
   *
   * WARN: `null` on everything else, never `{ peaks: [] }`. Every reader tests it
   * for truthiness, so an empty track renders a photo bubble as a voice card.
   *
   * WARN: The peaks are `0`–`1` here and `0`–`VOICE_PEAK_SCALE` integers in the
   * column. `toChatMedia` is the one place that converts, so nothing downstream
   * has to know the storage scale.
   */
  voice: Nullable<{ peaks: number[] }>;
  // INFO: § 9.1. The file card names its own size, which is the only thing it can say about a document it cannot draw.
  size: number;
  /**
   * The finished restructure. Whether the uploader has deleted the object outright, which
   * is what makes the cell a tombstone rather than a picture.
   *
   * INFO: § 4.3. The row survives the delete — `message_media`'s FK and § 8.13.'s
   * resume reconciliation both need it — so the bubble keeps its place and the tile
   * keeps its box, exactly as a withdrawn message does. Only the R2 objects go.
   *
   * WARN: § 4.3. The geometry above stays populated on a deleted row **on purpose**.
   * It is what lets the tombstone occupy the space the photo did, so the § 8.3.
   * virtualized list re-measures nothing when one is deleted out from under it.
   */
  isDeleted: boolean;
  id: MediaId;
};

/**
 * One slide of the chat viewer's track (REQUIREMENTS.md § 8.1.) — the conversation's
 * photos and videos in send order.
 *
 * WARN: `messageId` is **not** nullable here, unlike `ArchiveMedia`'s. This track is
 * defined by the conversation rather than by the library, so a row reaches it only
 * by being carried by a message that is still visible — a library-only upload is not
 * in the conversation and has no slide.
 *
 * INFO: `senderId` rather than an `isMine` the server resolved. The room already holds `currentUserId` and decides every other bubble's side with it (§ 6.), and a second answer to the same question is a second thing to keep true.
 *
 * INFO: The finished restructure. No `createdAt`. DESIGN.md § 7.10.'s caption reads `idToDate(id)`, which is the instant the id already carries — sending a derived copy beside it is one fact twice, and two things that can disagree.
 */
export type ChatTrackMedia = ChatMedia & {
  messageId: MessageId;
  senderId: UserId;
};

/**
 * A library tile (REQUIREMENTS.md § 10.).
 *
 * INFO: The finished restructure. No `createdAt` here either, for the reason on `ChatTrackMedia` — the month section header and the keyset cursor are both the id now.
 */
export type ArchiveMedia = ChatMedia & {
  /**
   * REQUIREMENTS.md § 10. The message this tile was sent in, which 대화에서 보기
   * jumps to (§ 8.6.1.).
   *
   * WARN: `null` is ordinary, not an error — a row uploaded straight into the
   * library hangs off no message at all, and so does one whose message has since
   * been deleted. The control is withheld there rather than jumping to nothing.
   */
  messageId: Nullable<MessageId>;
  /**
   * DESIGN.md § 7.10. Who sent the tile, for the viewer's top bar.
   *
   * WARN: Resolved from `users` on every read, never projected onto the row
   * (REQUIREMENTS.md § 8.7.) — a copied name goes stale the moment either person
   * renames, and § 8.7. makes a rename retroactive across the whole history.
   *
   * WARN: `null` wherever `messageId` is, and for the same reason: a row uploaded
   * straight into the library was never sent, so there is nobody to name.
   */
  senderName: Nullable<string>;
};
