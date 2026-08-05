import { A_MEGABYTE } from "@/shared/lib";

/** REQUIREMENTS.md § 13.3. Presigned PUT then registration, exactly as § 9. does — but no `_thumb` sibling and no `media` row. */
export const EMOTICON_UPLOAD_URL_PATH = "/api/emoticons/upload-url";

export const EMOTICON_PACKS_PATH = "/api/emoticons/packs";

export const EMOTICON_ITEMS_PATH = "/api/emoticons/items";

export const EMOTICON_PREFS_PATH = "/api/emoticons/prefs";

/** REQUIREMENTS.md § 13.2. One required image, one optional audio companion, each its own object. */
export const EMOTICON_SLOTS = ["image", "audio"] as const;

export type EmoticonSlot = (typeof EMOTICON_SLOTS)[number];

/**
 * WARN: REQUIREMENTS.md § 13.2. One slot for both kinds of image. A still arrives
 * re-encoded to PNG, which is why `image/jpeg` is absent — an emoticon is rendered
 * directly, without a bubble (DESIGN.md § 6.5.), so JPEG would replace its
 * transparency with an opaque box and a `heic` would be unreadable to whichever
 * participant is not on iOS.
 */
export const ALLOWED_EMOTICON_IMAGE_MIMES = ["image/png", "image/webp", "image/gif"] as const;

// INFO: REQUIREMENTS.md § 13.4. Uploaded as it arrives — a canvas re-encode decodes one frame and would silently turn an animation into a picture, so a file that may animate never enters the editor.
export const ANIMATABLE_EMOTICON_MIMES = ["image/webp", "image/gif", "image/apng"] as const;

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

// INFO: Sized for the animated case, the one nothing downscales — a re-encoded still lands far under it, and an animation is 140px art (DESIGN.md § 6.5.) rather than footage.
export const MAX_EMOTICON_IMAGE_SIZE = 8 * A_MEGABYTE;

export const MAX_EMOTICON_AUDIO_SIZE = 2 * A_MEGABYTE;

/**
 * The long edge a re-encoded still is downscaled to.
 *
 * INFO: DESIGN.md § 6.5. caps the bubble at 140×140, so this is roughly 3× density
 * with room for the picker's own cell. Larger only costs bytes — nothing renders it bigger.
 */
export const EMOTICON_MAX_EDGE = 420;

export const MAX_EMOTICON_PACK_NAME_LENGTH = 40;

export type AllowedEmoticonImageMime = (typeof ALLOWED_EMOTICON_IMAGE_MIMES)[number];

export type AllowedEmoticonAudioMime = (typeof ALLOWED_EMOTICON_AUDIO_MIMES)[number];

const SLOT_RULES: Record<EmoticonSlot, { mimes: readonly string[]; maxSize: number }> = {
  image: { mimes: ALLOWED_EMOTICON_IMAGE_MIMES, maxSize: MAX_EMOTICON_IMAGE_SIZE },
  audio: { mimes: ALLOWED_EMOTICON_AUDIO_MIMES, maxSize: MAX_EMOTICON_AUDIO_SIZE },
};

/**
 * REQUIREMENTS.md § 13.4. Whether a picked file may be animated, and therefore must
 * be uploaded byte-for-byte instead of re-encoded.
 *
 * WARN: `image/apng` never comes off a `File` — the OS extension map answers
 * `image/png` for `.png` however it was encoded. It is the type `readEmoticonMime`
 * assigns after sniffing the `acTL` chunk, and nothing else may produce it: an APNG
 * is stored as the `image/png` R2 was sent, which is why it is absent from
 * `ALLOWED_EMOTICON_IMAGE_MIMES`.
 */
export function isAnimatableEmoticonMime(mime: string): boolean {
  return ANIMATABLE_EMOTICON_MIMES.includes(mime as (typeof ANIMATABLE_EMOTICON_MIMES)[number]);
}

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
 *
 * WARN: `version` is `Emoticon.version` and callers that hold the item MUST pass
 * it. Editing an item (§ 13.4.) swaps the object behind an unchanged id, and this
 * redirect is cached (§ 9.) — without it the browser keeps serving the old asset.
 */
export function toEmoticonAssetUrl(
  itemId: string,
  slot: EmoticonSlot = "image",
  version?: number,
): string {
  const versionParam = version === undefined ? "" : `&v=${version}`;

  return `${EMOTICON_ITEMS_PATH}/${itemId}/asset?slot=${slot}${versionParam}`;
}
