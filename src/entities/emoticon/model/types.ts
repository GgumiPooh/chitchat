import type { Nullable } from "@/shared/lib";

/**
 * An emoticon as it crosses the API. It carries no URL — REQUIREMENTS.md § 13.3.
 * mints a presigned one per request behind `GET /api/emoticons/items/{id}/asset`.
 */
export type Emoticon = {
  packId: string;
  // INFO: REQUIREMENTS.md § 8.3. What the row reserves its box from, before the asset loads. The image's own size (§ 13.2.), animated or not.
  width: number;
  height: number;
  hasAudio: boolean;
  // INFO: REQUIREMENTS.md § 13.8. The words the composer matches a typed draft against. Empty for an item nobody has described.
  keywords: string[];
  // INFO: REQUIREMENTS.md § 13.4. `updated_at` in milliseconds, appended to the asset URL — an edited item keeps its id, so nothing else would tell the cached redirect apart from the new one.
  version: number;
  id: string;
};

export type EmoticonPackSummary = {
  name: string;
  // INFO: REQUIREMENTS.md § 13.2. Null until an item is chosen as the tab icon, and again if that item is deleted — the picker falls back to the first item.
  thumbnailItemId: Nullable<string>;
  // INFO: REQUIREMENTS.md § 13.2. The thumbnail item's own `Emoticon.version`, carried so a row that holds no items can still build a versioned asset URL — without it the management row's cached redirect outlives the edit that replaced the object, and points at one that is gone (§ 13.4.).
  thumbnailVersion: Nullable<number>;
  itemCount: number;
  // INFO: REQUIREMENTS.md § 13.1. This user's own view of the pack. An absent `user_emoticon_prefs` row reads as enabled.
  isEnabled: boolean;
  id: string;
};

/** A pack with its items, as the picker and the pack detail screen read it. */
export type EmoticonPackWithItems = EmoticonPackSummary & {
  items: Emoticon[];
};
