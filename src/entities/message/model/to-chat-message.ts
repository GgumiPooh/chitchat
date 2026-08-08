import type { Emoticon } from "@/entities/emoticon/@x/message";
import type { ChatMedia } from "@/entities/media/@x/message";
import type { Message } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import type { ChatMessage, ReplyPreview } from "./types";

export function toChatMessage(
  row: Message,
  media: ChatMedia[] = [],
  emoticon: Nullable<Emoticon> = null,
  replyTo: Nullable<ReplyPreview> = null,
): ChatMessage {
  const isDeleted = row.deletedAt !== null;

  return {
    type: row.type,
    senderId: row.senderId,
    clientMsgId: row.clientMsgId,
    // WARN: REQUIREMENTS.md § 8.13. A deleted row surrenders its text **here**, on the way out. The tombstone renders a fixed line and never this, so shipping it would put the withdrawn message in every payload for anyone reading the network tab — which is the one thing deleting it was meant to take back. The row keeps it (§ 6. is append-only); the wire does not.
    text: isDeleted ? null : row.text,
    media,
    emoticon,
    eventId: row.eventId,
    systemAction: row.systemAction,
    eventTitle: row.eventTitle,
    eventStartsAt: row.eventStartsAt?.toISOString() ?? null,
    replyTo,
    createdAt: row.createdAt.toISOString(),
    // INFO: § 8.13. Kept on a deleted row, and harmless — it dates a correction that no longer has anything to correct, and the tombstone reads neither it nor 수정됨.
    editedAt: row.editedAt?.toISOString() ?? null,
    // INFO: REQUIREMENTS.md § 8.13. The flag, never the timestamp — nothing renders *when* a message was deleted, and shipping it would date a withdrawal the reader is not owed.
    isDeleted,
    id: row.id,
  };
}
