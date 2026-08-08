import { A_DAY, A_MEGABYTE, A_SECOND, type Nullable } from "@/shared/lib";

/** REQUIREMENTS.md § 13.3. Presigned PUT then registration, exactly as § 9. does — but no `_thumb` sibling and no `media` row. */
export const EMOTICON_UPLOAD_URL_PATH = "/api/emoticons/upload-url";

export const EMOTICON_PACKS_PATH = "/api/emoticons/packs";

export const EMOTICON_ITEMS_PATH = "/api/emoticons/items";

export const EMOTICON_PREFS_PATH = "/api/emoticons/prefs";

// WARN: REQUIREMENTS.md § 13.7. The same value `next.config.ts` rewrites to, and the same trailing slash stripped off it — the two cannot import one another, since that file is loaded before the path aliases exist.
const EMOTICONS_ORIGIN = (
  process.env.NEXT_PUBLIC_EMOTICONS_ORIGIN ?? "http://localhost:3001"
).replace(/\/+$/, "");

/**
 * The keyword suggester, which is **jandh-emoticons' route rather than this app's**
 * (REQUIREMENTS.md § 13.8.1.).
 *
 * WARN: An absolute URL where everything else here is a path, and the only one: it
 * is called at jandh-emoticons' **own** origin rather than through § 13.7.'s zone,
 * so the rewrite and the Vercel proxy hop it costs are both out of the way. Callers
 * MUST send it `credentials: "include"` — `fetch` defaults to `same-origin` and
 * would otherwise carry no session at all.
 *
 * WARN: The `/emoticons` segment stays. It is that app's `basePath`, which is its
 * own setting rather than an artifact of the rewrite — dropping the rewrite does
 * not drop the prefix.
 *
 * WARN: `proxy.ts`'s `emoticons/api` exclusion is **not** this call's and must not
 * be removed with it. That zone's own import screen posts to the same handler at
 * this origin, where the path is relative (§ 13.7.).
 *
 * WARN: Do not move the route back. The model call is the expensive part of this
 * feature and it is deliberately hosted where the emoticon work already is, so
 * jandh's own function budget pays for the conversation rather than for tagging.
 */
export const EMOTICON_KEYWORDS_URL = `${EMOTICONS_ORIGIN}/emoticons/api/emoticons/keywords`;

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

/**
 * REQUIREMENTS.md § 13.8. How many search keywords one item may carry, and how
 * long each may be.
 *
 * INFO: The cap exists because the whole keyword set is shipped to the browser
 * with the pack list (§ 13.6.'s preload) and matched there — it is the composer's
 * per-keystroke working set, not a column somebody queries.
 */
export const MAX_EMOTICON_KEYWORDS = 12;

export const MAX_EMOTICON_KEYWORD_LENGTH = 20;

/**
 * How many emoticons one keyword-suggestion request may carry (REQUIREMENTS.md
 * § 13.8.1.).
 *
 * WARN: This is the route's cap **and** the caller's chunk size, deliberately the
 * same number so one request is provably one model call. A route that accepted a
 * whole pack would run several of those back to back and be killed by the platform
 * before it answered, which is the failure jandh-emoticons' § 6.3.1. already exists
 * to have removed.
 *
 * WARN: Four, down from sixteen, and the reason is **answer quality rather than
 * time** (§ 13.8.1.). Sixteen fitted the latency budget; what it did not fit was a
 * lite model's ability to keep sixteen inline images apart while reading the Korean
 * line off each one. The whole feature rests on `index` naming the right picture.
 *
 * WARN: Callers MUST chunk to this. It is also what makes the screen able to say how
 * far along it is — a single request can only ever report "not yet".
 *
 * WARN: jandh-emoticons declares this number too and owns the route. The two MUST
 * agree: chunking larger here is refused there.
 */
export const KEYWORD_SUGGESTION_BATCH = 4;

/**
 * How long an emoticon's presigned GET stays valid, and how long the 302 in front
 * of it may be cached.
 *
 * WARN: REQUIREMENTS.md § 13.3. Deliberately not § 9.'s `MEDIA_URL_EXPIRY`. An
 * emoticon's asset URL carries `v` (§ 13.4.), so it addresses one immutable version
 * and a long cache can never serve the wrong bytes — a `media` URL has no such
 * version and stays on the short window.
 *
 * WARN: Seven days is SigV4's ceiling; the cache MUST stay under it, or the browser
 * replays a cached redirect to a signature R2 has stopped honouring (§ 9.).
 */
export const EMOTICON_URL_EXPIRY = 7 * A_DAY;

export const EMOTICON_CACHE_MAX_AGE = 6 * A_DAY;

/**
 * The `Cache-Control` an emoticon's presigned GET answers with.
 *
 * WARN: Signed into the *download* URL, never sent on the upload (§ 13.3.). R2
 * stores no `Cache-Control` of its own, so without this the browser falls back to a
 * heuristic lifetime of a tenth of the object's age — nearly zero for one just
 * uploaded, which is what made a fresh emoticon re-fetch on every single mount.
 *
 * WARN: `private`, matching the 302 that points here. `public` would license a
 * shared cache to hold the bytes for a year and keep replaying them past
 * `EMOTICON_URL_EXPIRY`, which is the ceiling the signature exists to impose.
 */
export const EMOTICON_ASSET_CACHE_CONTROL = `private, max-age=${(365 * A_DAY) / A_SECOND}, immutable`;

/**
 * The stored form of a keyword list: trimmed, whitespace-collapsed, deduplicated
 * case-insensitively, and capped (REQUIREMENTS.md § 13.8.).
 *
 * WARN: Lives here rather than in `entities/emoticon` for the reason
 * `toEmoticonAssetUrl` does — that barrel re-exports a `server-only` api segment,
 * and the composer matches keywords in the browser.
 *
 * WARN: Keywords keep the case they were typed in and are compared folded. Storing
 * them folded would render `OK` back as `ok` in the sheet that authored it, and
 * comparing them unfolded would let one item carry `OK` and `ok` as two keywords.
 */
export function normalizeKeywords(input: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const raw of input) {
    // WARN: `trimEnd` *after* the slice, or a multi-word entry cut at a space is stored with a trailing one — `matchesKeywordQuery` never trims, so `query.startsWith(keyword)` would then need the user to type that space too.
    const keyword = raw
      .trim()
      .replace(/\s+/gu, " ")
      .slice(0, MAX_EMOTICON_KEYWORD_LENGTH)
      .trimEnd();
    const folded = keyword.toLowerCase();

    // WARN: § 13.8. A floor on the stored *keyword*, and deliberately not one on the typed query — a one-character query is the useful direction and is allowed. This is the other direction: `matchesKeywordQuery` runs `query.startsWith(keyword)` for Korean particles, so a keyword of `아` underlines every drafted word beginning with that syllable.
    if (keyword.length < MIN_KEYWORD_LENGTH || seen.has(folded)) {
      continue;
    }

    seen.add(folded);
    kept.push(keyword);

    if (kept.length === MAX_EMOTICON_KEYWORDS) {
      break;
    }
  }

  return kept;
}

/**
 * The shortest keyword an item may carry.
 *
 * WARN: REQUIREMENTS.md § 13.8. A floor on what is **stored**, and there is no
 * matching floor on what is typed — the two used to be one constant, which read as
 * one rule and was three. A one-character *query* is fine and is what KakaoTalk
 * offers; a one-character *keyword* is not, because `matchesKeywordQuery`'s
 * particle direction makes `아` answer to every drafted word starting with it.
 */
export const MIN_KEYWORD_LENGTH = 2;

/** The word in a typed draft that has emoticons behind it (REQUIREMENTS.md § 13.8.). */
export type KeywordMatch = {
  /** What the user actually typed — the panel filters on this, not on the keyword it hit. */
  query: string;
  start: number;
  end: number;
};

/**
 * Whether a stored keyword answers to a typed word.
 *
 * WARN: REQUIREMENTS.md § 13.8. Prefixes count **in both directions**, and each
 * direction pays for a different case. `keyword.startsWith(query)` is the one the
 * user asked for: an item tagged `고민되는군` has to be reachable by typing `고민`,
 * because nobody types a whole sentence to find a picture of it. `query.startsWith
 * (keyword)` is Korean grammar — a particle attaches to the word (`우와가`,
 * `고민되는군요`), so the typed token is the keyword plus a suffix that is not part
 * of it. Dropping either half loses half the feature.
 *
 * WARN: The two directions are why `MIN_KEYWORD_LENGTH` guards the keyword and
 * nothing guards the query. A one-character query can only ever reach the first
 * direction — the second needs a keyword shorter still, and there are none — so it
 * costs a wider result set and no false matches at all.
 */
export function matchesKeywordQuery(keyword: string, query: string): boolean {
  const foldedKeyword = keyword.toLowerCase();
  const foldedQuery = query.toLowerCase();

  return foldedKeyword.startsWith(foldedQuery) || foldedQuery.startsWith(foldedKeyword);
}

/**
 * The word a typed draft should offer emoticons for, or `null` when it offers none.
 *
 * INFO: § 13.8. Split on whitespace, and the span reported is the whole word — the
 * underline has to sit under something the reader recognises as a word, and
 * `고민` inside `고민되는군` is not one.
 *
 * WARN: The **last** matching word wins, not the first or the longest. The offer
 * follows the caret, which is where the user is looking; keyed on the first match a
 * word typed later would silently underline something at the far left of the field.
 *
 * WARN: § 13.8. No minimum length, deliberately. A one-character token offers
 * whatever it prefixes, which is KakaoTalk's own behaviour and the point of the
 * feature — `왈` has to reach the item tagged `왈?`. The floor that remains is
 * `MIN_KEYWORD_LENGTH`, on the stored word rather than on the typed one.
 */
export function findKeywordMatch(text: string, keywords: Iterable<string>): Nullable<KeywordMatch> {
  let match: Nullable<KeywordMatch> = null;

  for (const token of text.matchAll(/\S+/gu)) {
    const query = token[0];

    if (!hasMatch(keywords, query)) {
      continue;
    }

    match = { query, start: token.index, end: token.index + query.length };
  }

  return match;
}

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

/**
 * WARN: Iterates the collection rather than copying it. This runs once per token per
 * keystroke on the composer's field, and the caller holds a `Set` of every keyword in
 * every enabled pack — spreading it to reach `some` allocated that whole set again on
 * each character typed, on the app's hottest input path.
 */
function hasMatch(keywords: Iterable<string>, query: string): boolean {
  for (const keyword of keywords) {
    if (matchesKeywordQuery(keyword, query)) {
      return true;
    }
  }

  return false;
}
