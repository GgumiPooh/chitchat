import type { EmoticonItemId, EmoticonPackId, Nullable } from "@/shared/lib";

/**
 * An emoticon as it crosses the API. It carries no URL — REQUIREMENTS.md § 13.3.
 * mints a presigned one per request behind `GET /api/emoticons/items/{id}/asset`.
 */
export type Emoticon = {
  packId: EmoticonPackId;
  // INFO: REQUIREMENTS.md § 8.3. What the row reserves its box from, before the asset loads. The image's own size (§ 13.2.), animated or not.
  width: number;
  height: number;
  hasAudio: boolean;
  // INFO: REQUIREMENTS.md § 13.8. The words the composer matches a typed draft against. Empty for an item nobody has described.
  keywords: string[];
  // INFO: REQUIREMENTS.md § 13.4. `updated_at` in milliseconds, appended to the asset URL — an edited item keeps its id, so nothing else would tell the cached redirect apart from the new one.
  version: number;
  id: EmoticonItemId;
};

export type EmoticonPackSummary = {
  name: string;
  // INFO: REQUIREMENTS.md § 13.2. The item the pack is **drawn with** — its chosen tab icon, or its first item where nothing was chosen — resolved by `listEmoticonPacks`, since § 13.6.'s picker holds no items to fall back through. Null only for a pack that holds none.
  thumbnailItemId: Nullable<EmoticonItemId>;
  // INFO: REQUIREMENTS.md § 13.2. That item's own `Emoticon.version`, carried so a row holding no items can still build a versioned asset URL — without it the cached redirect outlives the edit that replaced the object, and points at one that is gone (§ 13.4.).
  thumbnailVersion: Nullable<number>;
  itemCount: number;
  // INFO: REQUIREMENTS.md § 13.1. This user's own view of the pack. An absent `user_emoticon_prefs` row reads as enabled.
  isEnabled: boolean;
  id: EmoticonPackId;
};

/**
 * One page of § 13.5.'s pack list, and where the next one starts.
 *
 * INFO: `nextCursor` is opaque and null at the end of the list — it is the only thing
 * a caller may say about a page it has read, and never an index into one.
 */
export type EmoticonPackPage = {
  packs: EmoticonPackSummary[];
  nextCursor: Nullable<string>;
};

/**
 * A pack with its items, as § 13.4.'s pack screen reads it.
 *
 * WARN: `thumbnailItemId` is the pack's **stored** choice in this shape and the
 * resolved one in the summary above — `getEmoticonPack` says why. § 13.6.'s picker no
 * longer takes this shape at all; it asks for one pack's items at a time.
 */
export type EmoticonPackWithItems = EmoticonPackSummary & {
  items: Emoticon[];
};
