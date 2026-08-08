export { countUnreadMessages } from "./api/count-unread";
export {
  createEmoticonMessage,
  type CreateEmoticonMessageParams,
} from "./api/create-emoticon-message";
export { createMediaMessage, type CreateMediaMessageParams } from "./api/create-media-message";
export { createSystemMessage, type CreateSystemMessageParams } from "./api/create-system-message";
export { createTextMessage, type CreateTextMessageParams } from "./api/create-text-message";
export { deleteMessage } from "./api/delete-message";
export { editMessage } from "./api/edit-message";
export { getMessage } from "./api/get-message";
export { isQuotable } from "./api/is-quotable";
export { listChangedMessages, type MessageChanges } from "./api/list-changed-messages";
export { listMessages, type ListMessagesParams } from "./api/list-messages";
export {
  countMatchingMessages,
  searchMessages,
  type SearchMessagesParams,
} from "./api/search-messages";
// WARN: Everything above touches the database. A client module may import from this barrel with `import type` only — a value import drags `server-only` into its bundle.
export type { ChatMessage, MessageSearchResult, ReplyPreview } from "./model/types";
