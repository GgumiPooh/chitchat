import type { Message } from "@/shared/db";
import type { ChatMessage } from "./types";

export function toChatMessage(row: Message): ChatMessage {
  return {
    type: row.type,
    senderId: row.senderId,
    clientMsgId: row.clientMsgId,
    text: row.text,
    eventId: row.eventId,
    systemAction: row.systemAction,
    eventTitle: row.eventTitle,
    eventStartsAt: row.eventStartsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
  };
}
