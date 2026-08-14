export { copyMediaIntoScope, type CopyMediaIntoScopeParams } from "./api/copy-media-into-scope";
export { discardScopedMedia, discardUnwornScopedMedia } from "./api/discard-scoped-media";
export { canReadMedia, getMediaRow, ownsAllMedia, toVariantKey } from "./api/get-media-object";
export {
  listArchiveMedia,
  type ArchiveCursor,
  type ListArchiveMediaParams,
} from "./api/list-archive-media";
export {
  listConversationMedia,
  type ListConversationMediaParams,
} from "./api/list-conversation-media";
export { registerMedia, type RegisterMediaParams } from "./api/register-media";
export {
  deleteOwnMedia,
  removeArchiveMedia,
  type ArchiveRemoval,
} from "./api/remove-archive-media";
// WARN: Everything above touches the database. A client module may import from this barrel with `import type` only — a value import drags `server-only` into its bundle, which is why `toMediaUrl` lives in `@/shared/config` instead.
export type { MediaDraft } from "./model/draft";
export type { ArchiveMedia, ChatMedia, ChatTrackMedia } from "./model/types";
