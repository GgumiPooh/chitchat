import { A_MEGABYTE } from "@/shared/lib";

/** REQUIREMENTS.md § 13.3. Presigned PUT then registration, exactly as § 9. does — but no `_thumb` sibling and no `media` row. */
export const EMOTICON_UPLOAD_URL_PATH = "/api/emoticons/upload-url";

export const EMOTICON_PACKS_PATH = "/api/emoticons/packs";

export const EMOTICON_ITEMS_PATH = "/api/emoticons/items";

export const EMOTICON_PREFS_PATH = "/api/emoticons/prefs";

/** REQUIREMENTS.md § 13.2. One required still, two optional companions, each its own object. */
export const EMOTICON_SLOTS = ["still", "animated", "audio"] as const;

export type EmoticonSlot = (typeof EMOTICON_SLOTS)[number];

/**
 * WARN: The still is **always** re-encoded to PNG in the browser before upload,
 * so this list has exactly one entry on purpose. An emoticon has no derivative to
 * fall back on — it is rendered directly, without a bubble (DESIGN.md § 6.5.) —
 * so a `heic` still would be unreadable to whichever participant is not on iOS,
 * and a JPEG one would replace its transparency with an opaque box.
 */
export const ALLOWED_EMOTICON_STILL_MIMES = ["image/png"] as const;

// INFO: REQUIREMENTS.md § 13.4. Uploaded as it arrives — a canvas re-encode decodes one frame and would silently turn the animation into a picture.
export const ALLOWED_EMOTICON_ANIMATED_MIMES = ["image/webp", "image/gif", "image/apng"] as const;

// INFO: `audio/mp4` and `audio/x-m4a` are what iOS hands over for the same `.m4a` file, depending on how it was picked.
export const ALLOWED_EMOTICON_AUDIO_MIMES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
] as const;

// INFO: A PNG downscaled to EMOTICON_MAX_EDGE. Generous against that, so the cap only ever catches something that should not have reached it.
export const MAX_EMOTICON_STILL_SIZE = 2 * A_MEGABYTE;

// INFO: Animations are the large slot and the one nothing downscales, but they are still 140px art (DESIGN.md § 6.5.) rather than footage.
export const MAX_EMOTICON_ANIMATED_SIZE = 8 * A_MEGABYTE;

export const MAX_EMOTICON_AUDIO_SIZE = 2 * A_MEGABYTE;

/**
 * The long edge the still is downscaled to before it is encoded.
 *
 * INFO: DESIGN.md § 6.5. caps the bubble at 140×140, so this is roughly 3× density
 * with room for the picker's own cell. Larger only costs bytes — nothing renders it bigger.
 */
export const EMOTICON_MAX_EDGE = 420;

export const MAX_EMOTICON_PACK_NAME_LENGTH = 40;

export type AllowedEmoticonStillMime = (typeof ALLOWED_EMOTICON_STILL_MIMES)[number];

export type AllowedEmoticonAnimatedMime = (typeof ALLOWED_EMOTICON_ANIMATED_MIMES)[number];

export type AllowedEmoticonAudioMime = (typeof ALLOWED_EMOTICON_AUDIO_MIMES)[number];

const SLOT_RULES: Record<EmoticonSlot, { mimes: readonly string[]; maxSize: number }> = {
  still: { mimes: ALLOWED_EMOTICON_STILL_MIMES, maxSize: MAX_EMOTICON_STILL_SIZE },
  animated: { mimes: ALLOWED_EMOTICON_ANIMATED_MIMES, maxSize: MAX_EMOTICON_ANIMATED_SIZE },
  audio: { mimes: ALLOWED_EMOTICON_AUDIO_MIMES, maxSize: MAX_EMOTICON_AUDIO_SIZE },
};

/** REQUIREMENTS.md § 14. What the slot's object must be, checked against what R2 actually stored. */
export function isAllowedEmoticonAsset(slot: EmoticonSlot, mime: string, size: number): boolean {
  const rule = SLOT_RULES[slot];

  return rule.mimes.includes(mime) && size <= rule.maxSize;
}

export function maxSizeForEmoticonSlot(slot: EmoticonSlot): number {
  return SLOT_RULES[slot].maxSize;
}

export function allowedMimesForEmoticonSlot(slot: EmoticonSlot): readonly string[] {
  return SLOT_RULES[slot].mimes;
}

/**
 * The same-origin URL an `<img>` or `<audio>` points at.
 *
 * WARN: A route, not an R2 URL — the request carries the session cookie and the
 * handler redirects to a presigned GET (REQUIREMENTS.md § 13.3.). Lives in
 * `shared/config` for the reason `toMediaUrl` does: `entities/emoticon`'s barrel
 * also exports a `server-only` api segment.
 */
export function toEmoticonAssetUrl(itemId: string, slot: EmoticonSlot = "still"): string {
  return `${EMOTICON_ITEMS_PATH}/${itemId}/asset?slot=${slot}`;
}
