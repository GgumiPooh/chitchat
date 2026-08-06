export { copyMediaIntoScope, type CopyMediaIntoScopeParams } from "./api/copy-media-into-scope";
export { discardScopedMedia } from "./api/discard-scoped-media";
export { canReadMedia, getMediaRow, ownsAllMedia, toVariantKey } from "./api/get-media-object";
export {
  listGalleryMedia,
  type GalleryCursor,
  type ListGalleryMediaParams,
} from "./api/list-gallery-media";
export { registerMedia, type RegisterMediaParams } from "./api/register-media";
export { removeGalleryMedia, type GalleryRemoval } from "./api/remove-gallery-media";
// WARN: Everything above touches the database. A client module may import from this barrel with `import type` only — a value import drags `server-only` into its bundle, which is why `toMediaUrl` lives in `@/shared/config` instead.
export type { MediaDraft } from "./model/draft";
export type { ChatMedia, GalleryMedia } from "./model/types";
