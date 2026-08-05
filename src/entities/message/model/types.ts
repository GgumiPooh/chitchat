import type { Emoticon } from "@/entities/emoticon/@x/message";
import type { ChatMedia } from "@/entities/media/@x/message";
import type { MessageType, SystemAction } from "@/shared/db";
import type { Nullable } from "@/shared/lib";

/**
 * The message a reply quotes, as the quote renders it (REQUIREMENTS.md § 8.9.).
 *
 * INFO: Resolved from the parent row at read time rather than snapshotted onto the
 * reply, exactly as § 8.7. resolves the sender — so a nickname change or an
 * emoticon edit reaches every quote of it.
 *
 * WARN: Carries no `replyTo` of its own. A quote shows one level (DESIGN.md § 6.9.),
 * and nesting `ChatMessage` here would grow a long reply chain's payload with it.
 */
export type ReplyPreview = {
  /** Resolved against the participant set on the client, never carried as a name (§ 8.7.). */
  senderId: string;
  kind: MessageType;
  /** Already sliced to `REPLY_PREVIEW_MAX_LENGTH` — the quote clamps to one line. */
  text: Nullable<string>;
  /** The first attachment, for the quote's thumbnail; null for every other kind. */
  thumbnailMediaId: Nullable<string>;
  // INFO: Names the bubble the way the § 16.1. push body does — 사진 covers a mixed send, since listing both kinds would read as a manifest in a line that has room for neither.
  isVideoOnly: boolean;
  // INFO: § 6. is append-only and a delete is a soft one, so the parent row outlives its content and the quote says 삭제된 메시지예요 instead of going blank.
  isDeleted: boolean;
  id: number;
};

/**
 * A message as it crosses `/api/messages`. Timestamps are ISO strings because the
 * wire format is JSON; the client parses them where it needs a `Date`.
 */
export type ChatMessage = {
  type: MessageType;
  senderId: string;
  clientMsgId: string;
  text: Nullable<string>;
  // INFO: REQUIREMENTS.md § 6. One bubble is one row however many attachments it carries, so this is an array rather than a `mediaId` on the message.
  media: ChatMedia[];
  // INFO: REQUIREMENTS.md § 13.6. Resolved at read time from `emoticon_item_id`, never copied onto the row — an emoticon renamed in Settings updates every bubble that used it, the same way § 8.7. treats a sender's name.
  emoticon: Nullable<Emoticon>;
  eventId: Nullable<string>;
  systemAction: Nullable<SystemAction>;
  eventTitle: Nullable<string>;
  eventStartsAt: Nullable<string>;
  // INFO: REQUIREMENTS.md § 8.9. Orthogonal to `type` — a reply may be text, attachments or an emoticon, so this rides beside the payload rather than inside it.
  replyTo: Nullable<ReplyPreview>;
  createdAt: string;
  id: number;
};
