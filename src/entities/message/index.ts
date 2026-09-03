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
export {
  listMessageBookmarks,
  type ListMessageBookmarksParams,
} from "./api/list-message-bookmarks";
export { listMessageReactions } from "./api/list-message-reactions";
export { listMessages, type ListMessagesParams } from "./api/list-messages";
export { listMessagesByIds } from "./api/list-messages-by-ids";
export { listRecentAssistantExchanges } from "./api/list-recent-assistant-exchanges";
export {
  countMatchingMessages,
  getSearchVisibility,
  searchMessages,
  type SearchMessagesParams,
} from "./api/search-messages";
export { addMessageBookmark, removeMessageBookmark } from "./api/set-message-bookmark";
export {
  listMessageInlineEmoticons,
  toMessagePayload,
  toSingleMessagePayload,
  type MessagePayload,
  type SingleMessagePayload,
} from "./api/to-message-payload";
export {
  toggleReaction,
  type ToggleReactionInput,
  type ToggleReactionResult,
} from "./api/toggle-reaction";
// WARN: Everything above touches the database. A client module may import from this barrel with `import type` only — a value import drags `server-only` into its bundle.
export type {
  ChatMessage,
  MessageBookmark,
  MessageReaction,
  MessageSearchResult,
  ReplyPreview,
} from "./model/types";
