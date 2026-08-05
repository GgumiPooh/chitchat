import type { Nullable } from "@/shared/lib";

/**
 * An emoticon as it crosses the API. It carries no URL — REQUIREMENTS.md § 13.3.
 * mints a presigned one per request behind `GET /api/emoticons/items/{id}/asset`.
 */
export type Emoticon = {
  packId: string;
  // INFO: REQUIREMENTS.md § 8.3. What the row reserves its box from, before the asset loads. Always the still's size (§ 13.2.).
  width: number;
  height: number;
  hasAnimation: boolean;
  hasAudio: boolean;
  id: string;
};

export type EmoticonPackSummary = {
  name: string;
  // INFO: REQUIREMENTS.md § 13.2. Null until an item is chosen as the tab icon, and again if that item is deleted — the picker falls back to the first item.
  thumbnailItemId: Nullable<string>;
  itemCount: number;
  // INFO: REQUIREMENTS.md § 13.1. This user's own view of the pack. An absent `user_emoticon_prefs` row reads as enabled.
  isEnabled: boolean;
  id: string;
};

/** A pack with its items, as the picker and the pack detail screen read it. */
export type EmoticonPackWithItems = EmoticonPackSummary & {
  items: Emoticon[];
};
