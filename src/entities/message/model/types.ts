import type { MessageType, SystemAction } from "@/shared/db";
import type { Nullable } from "@/shared/lib";

/**
 * A message as it crosses `/api/messages`. Timestamps are ISO strings because the
 * wire format is JSON; the client parses them where it needs a `Date`.
 */
export type ChatMessage = {
  type: MessageType;
  senderId: string;
  clientMsgId: string;
  text: Nullable<string>;
  eventId: Nullable<string>;
  systemAction: Nullable<SystemAction>;
  eventTitle: Nullable<string>;
  eventStartsAt: Nullable<string>;
  createdAt: string;
  id: number;
};
