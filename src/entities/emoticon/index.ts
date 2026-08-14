export {
  deleteEmoticonItem,
  getEmoticonItem,
  listUnregisteredEmoticonKeys,
  toSlotAsset,
  type DeleteEmoticonResult,
  type ResolvedSlotAsset,
} from "./api/get-emoticon-asset";
export {
  findKnownPackIds,
  getEmoticonPack,
  listEmoticonPackItems,
  listEmoticonPacks,
  listEmoticonPacksPage,
  parseEmoticonPackCursor,
  type EmoticonPackFilter,
  type EmoticonPackPageQuery,
} from "./api/get-emoticon-packs";
export { listEmoticonKeywords } from "./api/list-emoticon-keywords";
export { listEmoticonsByIds } from "./api/list-emoticons-by-ids";
export { searchEmoticons } from "./api/search-emoticons";
export {
  registerEmoticon,
  updateEmoticonItem,
  type RegisterEmoticonParams,
  type UpdateEmoticonParams,
  type UpdateEmoticonResult,
} from "./api/write-emoticon-item";
export { setEmoticonItemOrder } from "./api/write-emoticon-order";
export {
  createEmoticonPack,
  deleteEmoticonPack,
  renameEmoticonPack,
  setEmoticonPackThumbnail,
  type DeleteEmoticonPackResult,
} from "./api/write-emoticon-pack";
export {
  getEmoticonPackPref,
  setEmoticonPackEnabled,
  setEmoticonPackOrder,
} from "./api/write-emoticon-prefs";
// WARN: Everything above touches the database. A client module may import from this barrel with `import type` only — a value import drags `server-only` into its bundle, which is why `toEmoticonAssetUrl` lives in `@/shared/config` instead.
export type {
  Emoticon,
  EmoticonPackPage,
  EmoticonPackSummary,
  EmoticonPackWithItems,
} from "./model/types";
