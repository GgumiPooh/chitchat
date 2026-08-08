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
  return {
    type: row.type,
    senderId: row.senderId,
    clientMsgId: row.clientMsgId,
    text: row.text,
    media,
    emoticon,
    eventId: row.eventId,
    systemAction: row.systemAction,
    eventTitle: row.eventTitle,
    eventStartsAt: row.eventStartsAt?.toISOString() ?? null,
    replyTo,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    id: row.id,
  };
}
