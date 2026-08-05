export { canReadMedia, getMediaRow, ownsAllMedia, toVariantKey } from "./api/get-media-object";
export { registerMedia, type RegisterMediaParams } from "./api/register-media";
// WARN: Everything above touches the database. A client module may import from this barrel with `import type` only — a value import drags `server-only` into its bundle, which is why `toMediaUrl` lives in `@/shared/config` instead.
export type { MediaDraft } from "./model/draft";
export type { ChatMedia } from "./model/types";
