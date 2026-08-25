export { areInlineEmoticonsKnown } from "./api/check-inline-emoticons";
export { collapseMessage } from "./api/collapse-message";
export { countUnreadMessages } from "./api/count-unread";
export {
  createAssistantReplyMessage,
  type CreateAssistantReplyMessageParams,
} from "./api/create-assistant-reply-message";
export {
  createEmoticonMessage,
  type CreateEmoticonMessageParams,
} from "./api/create-emoticon-message";
export {
  createMediaMessage,
  type CreateMediaMessageParams,
  type CreateMediaMessageResult,
} from "./api/create-media-message";
export { createSystemMessage, type CreateSystemMessageParams } from "./api/create-system-message";
export { createTextMessage, type CreateTextMessageParams } from "./api/create-text-message";
export { deleteMessage } from "./api/delete-message";
export { editMessage } from "./api/edit-message";
export { getMessage } from "./api/get-message";
export { getMessageIdByClientMsgId } from "./api/get-message-id-by-client-msg-id";
export { isQuotable } from "./api/is-quotable";
export { listAssistantRepliesAfter } from "./api/list-assistant-replies-after";
export { listChangedMessages } from "./api/list-changed-messages";
export { listMessages, type ListMessagesParams } from "./api/list-messages";
export { listMessagesByIds } from "./api/list-messages-by-ids";
export { listRecentAssistantExchanges } from "./api/list-recent-assistant-exchanges";
export {
  countMatchingMessages,
  searchMessages,
  type SearchMessagesParams,
} from "./api/search-messages";
export {
  listMessageInlineEmoticons,
  toMessagePayload,
  toSingleMessagePayload,
  type MessagePayload,
  type SingleMessagePayload,
} from "./api/to-message-payload";
// WARN: Everything above touches the database. A client module may import from this barrel with `import type` only — a value import drags `server-only` into its bundle.
export type { ChatMessage, MessageSearchResult, ReplyPreview } from "./model/types";
