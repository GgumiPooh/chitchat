export {
  deleteEmoticonItem,
  getEmoticonItem,
  listUnregisteredEmoticonKeys,
  toSlotKey,
  type DeleteEmoticonResult,
} from "./api/get-emoticon-asset";
export {
  getEmoticonPack,
  listEmoticonPacks,
  listEmoticonPacksWithItems,
} from "./api/get-emoticon-packs";
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
export type { Emoticon, EmoticonPackSummary, EmoticonPackWithItems } from "./model/types";
