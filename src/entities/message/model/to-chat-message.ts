import type { ChatMedia } from "@/entities/media/@x/message";
import type { Message } from "@/shared/db";
import type { ChatMessage } from "./types";

export function toChatMessage(row: Message, media: ChatMedia[] = []): ChatMessage {
  return {
    type: row.type,
    senderId: row.senderId,
    clientMsgId: row.clientMsgId,
    text: row.text,
    media,
    eventId: row.eventId,
    systemAction: row.systemAction,
    eventTitle: row.eventTitle,
    eventStartsAt: row.eventStartsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
  };
}
