import type { Emoticon } from "@/entities/emoticon/@x/message";
import type { ChatMedia } from "@/entities/media/@x/message";
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
  // INFO: REQUIREMENTS.md § 6. One bubble is one row however many attachments it carries, so this is an array rather than a `mediaId` on the message.
  media: ChatMedia[];
  // INFO: REQUIREMENTS.md § 13.6. Resolved at read time from `emoticon_item_id`, never copied onto the row — an emoticon renamed in Settings updates every bubble that used it, the same way § 8.7. treats a sender's name.
  emoticon: Nullable<Emoticon>;
  eventId: Nullable<string>;
  systemAction: Nullable<SystemAction>;
  eventTitle: Nullable<string>;
  eventStartsAt: Nullable<string>;
  createdAt: string;
  id: number;
};
