import { A_DAY, A_MEGABYTE, A_MINUTE, A_SECOND, type Nullable } from "@/shared/lib";
import { z } from "zod";

// WARN: REQUIREMENTS.md § 13.7.1. Held apart from the fallback below, because the switch has to be able to tell a configured origin from a defaulted one.
const EMOTICONS_ORIGIN_SETTING = (process.env.NEXT_PUBLIC_EMOTICONS_ORIGIN ?? "").trim();

// WARN: REQUIREMENTS.md § 13.7. The same value `next.config.ts` rewrites to, and the same trailing slash stripped off it — the two cannot import one another, since that file is loaded before the path aliases exist.
const EMOTICONS_ORIGIN = (EMOTICONS_ORIGIN_SETTING || "http://localhost:3001").replace(/\/+$/, "");

// WARN: REQUIREMENTS.md § 13.7. The `/emoticons` segment is jandh-emoticons' own `basePath` rather than an artifact of the rewrite, so it survives a call that skips the rewrite entirely.
const EMOTICONS_API_ORIGIN = `${EMOTICONS_ORIGIN}/emoticons`;

/**
 * Whether the emoticon API below is jandh-emoticons' copy of it rather than this
 * app's own (REQUIREMENTS.md § 13.7.1.).
 *
 * WARN: Default **off**, and deliberately the opposite polarity to
 * `IS_SSE_IDLE_SLEEP_ENABLED` — a variable forgotten in a new environment has to
 * fall back to the routes this app always deploys, never to an origin that may not
 * be answering.
 *
 * WARN: A switch and not a second origin. § 13.7. keeps
 * `NEXT_PUBLIC_EMOTICONS_ORIGIN` as the one address every reader shares, because two
 * names holding the same origin is a pair that drifts invisibly.
 *
 * WARN: It takes **both** variables, and an unset origin wins over a set switch. The
 * default origin is a dev server, so honouring the switch without one would build
 * every emoticon URL against `localhost:3001` — mixed content a production browser
 * blocks, with the whole feature down and nothing naming the cause. Ignoring the
 * switch instead leaves § 13.7.1.'s fallback answering, which is the failure the
 * default-off polarity above was chosen for.
 *
 * WARN: `NEXT_PUBLIC_` and read as a literal member access. Next inlines these at
 * build time, so a computed lookup resolves to `undefined` in the browser bundle —
 * and flipping this therefore needs a redeploy rather than an environment edit.
 */
const IS_EMOTICON_API_REMOTE =
  EMOTICONS_ORIGIN_SETTING !== "" &&
  ["true", "1", "on"].includes(
    (process.env.NEXT_PUBLIC_EMOTICON_API_REMOTE ?? "").trim().toLowerCase(),
  );

/**
 * WARN: § 13.7.1. Empty means this app's own origin, which leaves every constant
 * below the relative path it has always been — the off state is not a code path of
 * its own, it is the string that shipped before the switch existed.
 */
const EMOTICON_API_BASE = IS_EMOTICON_API_REMOTE ? EMOTICONS_API_ORIGIN : "";

/** REQUIREMENTS.md § 13.3. Presigned PUT then registration, exactly as § 9. does — but no `_thumb` sibling and no `media` row. */
export const EMOTICON_UPLOAD_URL = `${EMOTICON_API_BASE}/api/emoticons/upload-url`;

export const EMOTICON_PACKS_URL = `${EMOTICON_API_BASE}/api/emoticons/packs`;

export const EMOTICON_ITEMS_URL = `${EMOTICON_API_BASE}/api/emoticons/items`;

export const EMOTICON_PREFS_URL = `${EMOTICON_API_BASE}/api/emoticons/prefs`;

export const EMOTICON_FAVORITES_URL = `${EMOTICON_API_BASE}/api/emoticons/favorites`;

/**
 * The keyword suggester, which is **jandh-emoticons' route rather than this app's**
 * (REQUIREMENTS.md § 13.8.1.).
 *
 * WARN: Unconditional, where the four above follow § 13.7.1.'s switch. This route
 * has no copy on this side to fall back to — `GEMINI_API_KEY` is deliberately not an
 * environment variable here — so it is absolute whatever the switch says.
 *
 * WARN: `proxy.ts`'s `emoticons/api` exclusion is **not** this call's and must not
 * be removed with it. That zone's own import screen posts to the same handler at
 * this origin, where the path is relative (§ 13.7.).
 *
 * WARN: Do not move the route back. The model call is the expensive part of this
 * feature and it is deliberately hosted where the emoticon work already is, so
 * jandh's own function budget pays for the conversation rather than for tagging.
 */
export const EMOTICON_KEYWORDS_URL = `${EMOTICONS_API_ORIGIN}/api/emoticons/keywords`;

/**
 * The finished restructure. An emoticon has two image slots and neither of them is "the
 * image": `still-image` is what a picker cell, a tab icon and a quote thumbnail draw,
 * and `animated-image` is what the bubble and the staged preview play.
 *
 * INFO: `still` alone was rejected — this codebase already reads `still` as an adverb
 * (`isStillStored`, and the prose throughout), and the `-image` suffix is what fixes the
 * part of speech. `poster` was rejected as a `<video poster>` borrowing implying a
 * placeholder that is replaced on play, which never happens here.
 */
export const EMOTICON_SLOTS = ["still-image", "animated-image", "audio"] as const;

export type EmoticonSlot = (typeof EMOTICON_SLOTS)[number];

/** INFO: The two an author fills, which is `EmoticonSlot` without the sound. Either one alone is a whole emoticon. */
export type EmoticonImageSlot = "still-image" | "animated-image";

/**
 * WARN: REQUIREMENTS.md § 13.2. One slot for both kinds of image. A still arrives
 * re-encoded to AVIF, falling back to PNG, which is why `image/jpeg` is absent — an
 * emoticon is rendered directly, without a bubble (DESIGN.md § 6.5.), so JPEG would
 * replace its transparency with an opaque box and a `heic` would be unreadable to
 * whichever participant is not on iOS.
 */
export const ALLOWED_EMOTICON_IMAGE_MIMES = [
  "image/avif",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

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
 * REQUIREMENTS.md § 13.4.1. The window a clip is cut down to before it becomes an
 * animation.
 *
 * INFO: Every extra second is frames in a file `MAX_EMOTICON_IMAGE_SIZE` bounds and seconds of single-threaded wasm encode; six is a whole gesture and still lands under both.
 */
export const MAX_EMOTICON_VIDEO_DURATION = 6 * A_SECOND;

/**
 * The long edge a re-encoded still is downscaled to.
 *
 * INFO: DESIGN.md § 6.5. caps the bubble at 140×140, so this is roughly 3× density
 * with room for the picker's own cell. Larger only costs bytes — nothing renders it bigger.
 */
export const EMOTICON_MAX_EDGE = 420;

/**
 * The two kinds of pack, and what an item's own kind is derived from
 * (REQUIREMENTS.md § 13.).
 *
 * WARN: The list `emoticon_pack_type` is declared from, so the enum and the app
 * cannot drift — `media.kind` is built off `MEDIA_KINDS` for that same reason.
 */
export const EMOTICON_PACK_TYPES = ["emoticon", "mini"] as const;

export type EmoticonPackType = (typeof EMOTICON_PACK_TYPES)[number];

/** WARN: Required on every read that lists or resolves a pack (§ 13.), never defaulted — an omitted kind is a mini in the emoticon picker. */
export const emoticonPackTypeSchema = z.enum(EMOTICON_PACK_TYPES);

/**
 * What a **list** read may ask for: one kind, or deliberately both (§ 13.).
 *
 * WARN: `"all"` is a third value a caller has to type, never an absent filter. It
 * exists for § 13.6.'s picker alone, which draws 이모티콘 and 미니 as two menus of one
 * panel and partitions the answer by `pack.type` itself — two requests there would be
 * two caches for one payload the preload already warms.
 *
 * WARN: Do **not** reach for it anywhere a user picks from a single list. Every screen
 * under 설정 names its own kind, and that is what keeps a mini out of 이모티콘 관리.
 */
export const EMOTICON_PACK_SCOPES = [...EMOTICON_PACK_TYPES, "all"] as const;

export type EmoticonPackScope = (typeof EMOTICON_PACK_SCOPES)[number];

export const emoticonPackScopeSchema = z.enum(EMOTICON_PACK_SCOPES);

/**
 * What each kind is called on screen (REQUIREMENTS.md § 13.).
 *
 * INFO: § 13.5. `pack` is the noun every management screen builds its titles, its
 * empty states and its sheets from, so the two are declared together rather than
 * composed at each call site.
 */
export const EMOTICON_KIND_NOUNS = {
  emoticon: { kind: "이모티콘", pack: "이모티콘 묶음" },
  mini: { kind: "미니이모티콘", pack: "미니이모티콘 묶음" },
} as const satisfies Record<EmoticonPackType, { kind: string; pack: string }>;

/**
 * What a message's text needs about an emoticon standing inside it
 * (REQUIREMENTS.md § 13.).
 *
 * WARN: Every field is here because the line is measured before anything loads — the
 * box from `width`/`height`, and `isDeleted` because a deleted item still occupies one.
 * `name` is the § 8.10. quote and the § 16.1. push body, which read it when removing
 * the placeholders leaves the message no words of its own.
 */
export type InlineEmoticonInfo = {
  width: number;
  height: number;
  version: number;
  name: Nullable<string>;
  hasAudio: boolean;
  isDeleted: boolean;
};

/** INFO: § 13. Keyed by item id and deduplicated, so a page repeating one emoticon carries it once. */
export type InlineEmoticonMap = Record<string, InlineEmoticonInfo>;

export const MAX_EMOTICON_PACK_NAME_LENGTH = 40;

/**
 * How many packs one page of § 13.5.'s 이모티콘 묶음 검색 tab holds, and the most a caller
 * may ask for.
 *
 * WARN: REQUIREMENTS.md § 13.5. The paged read is the **search** tab's, never the
 * picker's or 사용중's — both of those need the whole set to answer membership, and a
 * page silently reads to them as the packs it left out having been hidden.
 *
 * WARN: § 13.7.1. Declared in both repositories with the same values. A page size that
 * drifts is two deployments that both answer and hand back different pages depending on
 * which one the switch is pointing at, with the browser's cursor written against the
 * other.
 */
export const EMOTICON_PACK_PAGE_SIZE = 30;

export const MAX_EMOTICON_PACK_PAGE_SIZE = 50;

/**
 * REQUIREMENTS.md § 13.8. How many search keywords one item may carry, and how
 * long each may be.
 *
 * INFO: § 13.9.1. The per-item cap now bounds the reverse probe rather than a
 * payload — a term is enumerated into substrings up to `MAX_EMOTICON_KEYWORD_LENGTH`,
 * and this is how many stored words one item can put in front of them.
 */
export const MAX_EMOTICON_KEYWORDS = 12;

export const MAX_EMOTICON_KEYWORD_LENGTH = 20;

/**
 * A mini carries a name rather than search terms, so it carries exactly one
 * (REQUIREMENTS.md § 13.).
 *
 * WARN: `sync_emoticon_keywords` skips a mini's pack entirely (`0045`), so a second
 * keyword would be a word no search can reach — the cap is what keeps the authoring
 * screen from offering one.
 */
export const MAX_MINI_KEYWORDS = 1;

/** INFO: What `normalizeKeywords` is capped to, by the kind of pack the item belongs to. */
export function maxKeywordsFor(type: EmoticonPackType): number {
  return type === "mini" ? MAX_MINI_KEYWORDS : MAX_EMOTICON_KEYWORDS;
}

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
 * WARN: Three, reached from sixteen by way of four, and the reason is **answer
 * quality rather than time** (§ 13.8.1.). Sixteen fitted the latency budget; what it
 * did not fit was a lite model's ability to keep sixteen inline images apart while
 * reading the Korean line off each one. The whole feature rests on `id` naming the
 * right picture, and that is the first thing to degrade as the count grows — so this
 * moves down freely and upward only against a fresh measurement.
 *
 * WARN: Callers MUST chunk to this. It is also what makes the screen able to say how
 * far along it is — a single request can only ever report "not yet".
 *
 * WARN: jandh-emoticons declares this number too and owns the route. The two MUST
 * agree: chunking larger here is refused there.
 */
export const KEYWORD_SUGGESTION_BATCH = 3;

const KEYWORD_SUGGESTION_CONCURRENCY_SETTING = Number.parseInt(
  (process.env.NEXT_PUBLIC_KEYWORD_SUGGESTION_CONCURRENCY ?? "").trim(),
  10,
);

/**
 * How many `KEYWORD_SUGGESTION_BATCH` requests one run may keep in flight
 * (REQUIREMENTS.md § 13.8.1.).
 *
 * WARN: Google's per-minute quota is what bounds this, never anything local — the
 * free tier answers 15 a minute and a 36-item pack is 12, so a run is safe while it
 * fits one minute's allowance and raising this cannot rescue one that does not.
 *
 * WARN: `NEXT_PUBLIC_` and read as a literal member access, exactly as § 13.7.1.'s
 * switch is — a computed lookup resolves to `undefined` in the browser bundle, and
 * changing the value needs a redeploy rather than an environment edit.
 *
 * INFO: A blank or unparseable value falls back to the default and not to 1, since `.env.example` ships every name empty.
 */
export const KEYWORD_SUGGESTION_CONCURRENCY =
  Number.isInteger(KEYWORD_SUGGESTION_CONCURRENCY_SETTING) &&
  KEYWORD_SUGGESTION_CONCURRENCY_SETTING > 0
    ? KEYWORD_SUGGESTION_CONCURRENCY_SETTING
    : 6;

/**
 * How long an emoticon's presigned GET stays valid, and how long the 302 in front
 * of it may be cached.
 *
 * WARN: REQUIREMENTS.md § 13.3. Deliberately not § 9.'s `MEDIA_URL_EXPIRY`. An
 * emoticon's asset URL carries `v` (§ 13.4.), so it addresses one immutable version
 * and a long cache can never serve the wrong bytes — a `media` URL has no such
 * version and stays on the short window.
 *
 * WARN: Seven days is SigV4's ceiling and cannot be raised; `EMOTICON_SIGNING_BUCKET`
 * and `EMOTICON_CACHE_MAX_AGE` are both spent out of it, and their sum MUST stay under
 * it — or the browser replays a cached redirect to a signature R2 has stopped honouring (§ 9.).
 */
export const EMOTICON_URL_EXPIRY = 7 * A_DAY;

/**
 * The grid an emoticon's presigned GET is signed against, so that every request
 * inside one window is answered with the **byte-identical** URL.
 *
 * WARN: REQUIREMENTS.md § 13.3. Without this the signature carries the wall clock,
 * so two requests a second apart address the same object at two different URLs — and
 * the browser's cache is keyed by URL, so a redirect that expires costs the whole
 * object again even though those bytes are already held under the previous one.
 *
 * WARN: This window and `EMOTICON_CACHE_MAX_AGE` are drawn from the same seven days
 * and MUST stay under it together. A request arriving at the very end of a window is
 * handed a URL already `EMOTICON_SIGNING_BUCKET` into its life.
 */
export const EMOTICON_SIGNING_BUCKET = 5 * A_DAY;

/**
 * WARN: § 13.3. Shorter than `EMOTICON_SIGNING_BUCKET` on purpose, and it is what
 * makes the window above free rather than merely long: a browser that re-asks inside
 * the window is handed the same URL, so it pays one 302 and keeps the bytes.
 */
export const EMOTICON_CACHE_MAX_AGE = A_DAY;

/**
 * The finished restructure. How long a redirect for a **still** that was answered by the
 * animation may be held.
 *
 * WARN: The days above are earned by `v` addressing one immutable version of one slot,
 * and a fallback is exactly the case where that stops being true: an item with no still
 * serves its animation under `slot=still-image`, and a still given to it afterwards would
 * be a day behind every browser that had asked once — `EMOTICON_CACHE_MAX_AGE`'s window,
 * which is far longer than "the same session" for a slot that is about to be filled.
 *
 * INFO: § 9.'s own window, because "short enough that a change lands the same session"
 * is the same question `MEDIA_CACHE_MAX_AGE` answers for an unversioned media URL.
 */
export const EMOTICON_FALLBACK_CACHE_MAX_AGE = 5 * A_MINUTE;

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
export function normalizeKeywords(
  input: readonly string[],
  max: number = MAX_EMOTICON_KEYWORDS,
): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const raw of input) {
    // WARN: `trimEnd` *after* the slice, or a multi-word entry cut at a space is stored with a trailing one — `matchesKeywordQuery` never trims, so `query.includes(keyword)` would then need the user to type that space too.
    const keyword = raw
      .trim()
      .replace(/\s+/gu, " ")
      .slice(0, MAX_EMOTICON_KEYWORD_LENGTH)
      .trimEnd();
    const folded = keyword.toLowerCase();

    // WARN: § 13.8. A floor on the stored *keyword*, and deliberately not one on the typed query — a one-character query is the useful direction and is allowed. This is the other direction: `matchesKeywordQuery` runs `query.includes(keyword)` for Korean particles, so a keyword of `아` underlines every drafted word carrying that syllable anywhere.
    if (keyword.length < MIN_KEYWORD_LENGTH || seen.has(folded)) {
      continue;
    }

    seen.add(folded);
    kept.push(keyword);

    if (kept.length === max) {
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
 * WARN: REQUIREMENTS.md § 13.8. Containment **in both directions**, and each
 * direction pays for a different case. `keyword.includes(query)` is the one the user
 * asked for: an item tagged `고민되는군` has to be reachable by typing `고민`, because
 * nobody types a whole sentence to find a picture of it. `query.includes(keyword)` is
 * Korean grammar — a particle attaches to the word (`우와가`, `고민되는군요`), so the
 * typed token is the keyword plus an affix that is not part of it. Dropping either
 * half loses half the feature.
 *
 * WARN: § 13.8. These were `startsWith`, and an anchored match cannot answer a Korean
 * interjection. `와` is what somebody types and `우와` is what the item is tagged —
 * neither is a prefix of the other, so the one word the user reaches for found nothing
 * at all. `와아` against `와!` fails the same way in both directions at once.
 *
 * WARN: § 13.8. Unanchoring is safe **because Korean writes a syllable per code
 * point**, which is what makes this a different trade than it would be in English:
 * `와` matches the syllable 와 and nothing else, where a one-letter Latin substring
 * would match half the library. Measured over the real column before the change —
 * every query but two returned an identical item set, `와` went from 0 items to 2,
 * and the broadest query reached 14% of the tagged items.
 *
 * WARN: `MIN_KEYWORD_LENGTH` guards the keyword and nothing guards the query, and
 * containment makes that floor **more** load-bearing rather than less: a stored `아`
 * would now answer every drafted word containing that syllable anywhere, not only the
 * ones starting with it.
 */
export function matchesKeywordQuery(keyword: string, query: string): boolean {
  const foldedKeyword = keyword.toLowerCase();
  const foldedQuery = query.toLowerCase();

  return foldedKeyword.includes(foldedQuery) || foldedQuery.includes(foldedKeyword);
}

/**
 * The relevance ladder (REQUIREMENTS.md § 13.9.1.) — `matchesKeywordQuery`'s two
 * directions, told apart with equality above them.
 *
 * WARN: § 13.9.1. There used to be two rungs below these, a Hangul shape and a
 * qwerty slip, and they went with the move to a server-side search. Both were
 * decompositions of the *keyword*, which is a thing only an in-memory library can
 * afford — neither survives translation into an indexable predicate, and running
 * them over a candidate page instead would rank on a rung the page was not selected
 * by. Restoring either means an index that stores the decomposition.
 */
const RELEVANCE = {
  exact: 6,
  keywordHoldsTerm: 4,
  termHoldsKeyword: 3,
} as const;

/**
 * How well an item answers a set of query terms (REQUIREMENTS.md § 13.9.).
 *
 * INFO: Summed over the terms, so an item that answers several of them outranks one
 * that answers a single term very well — 따라하기 hands over a whole keyword list,
 * and the emoticons worth showing first are the ones that share most of it.
 *
 * WARN: § 13.9.1. The single definition of relevance, and it is called on the
 * **server** now that `search-emoticons.ts` selects the candidates. The ladder is
 * deliberately not reimplemented in SQL: two definitions of "related" that drift is
 * the expensive failure, where a JS pass over a bounded candidate page is not.
 *
 * WARN: Zero means no match, and callers filter on it — which is also the check that
 * the SQL candidate set and this ladder still agree.
 */
export function toKeywordRelevance(keywords: string[], terms: string[]): number {
  // WARN: Folded once here rather than inside the loop below, which is per term. `searchEmoticons` ranks up to `EMOTICON_SEARCH_CANDIDATE_LIMIT` items against up to `MAX_EMOTICON_KEYWORDS` terms, so folding per term repeated the same conversion twelve times over every keyword of every candidate.
  const foldedKeywords = keywords.map((keyword) => keyword.toLowerCase());

  return terms.reduce(
    (total, term) => total + toLiteralRelevance(foldedKeywords, term.toLowerCase()),
    0,
  );
}

function toLiteralRelevance(foldedKeywords: string[], foldedTerm: string): number {
  let best = 0;

  for (const foldedKeyword of foldedKeywords) {
    if (foldedKeyword === foldedTerm) {
      return RELEVANCE.exact;
    }

    if (foldedKeyword.includes(foldedTerm)) {
      best = Math.max(best, RELEVANCE.keywordHoldsTerm);
      continue;
    }

    if (foldedTerm.includes(foldedKeyword)) {
      best = Math.max(best, RELEVANCE.termHoldsKeyword);
    }
  }

  return best;
}

/**
 * REQUIREMENTS.md § 13.9. A search field may hold several words at once, separated
 * by commas, and matches an item that answers **any** of them.
 *
 * INFO: A comma because § 13.4.'s keyword field already commits a chip on one, so
 * this is the separator the app has already taught. A field with no comma in it
 * splits to the single term it always was.
 */
export function splitKeywordQuery(query: string): string[] {
  return query
    .split(",")
    .map((term) => term.trim())
    .filter((term) => term !== "");
}

/**
 * How long the picker's search field may get.
 *
 * WARN: REQUIREMENTS.md § 13.9. Not `MAX_EMOTICON_KEYWORD_LENGTH`, which is the cap
 * on one stored word — 따라하기 fills this field with an item's whole keyword list,
 * so a field capped at one word's length is one the user cannot then edit.
 */
export const MAX_KEYWORD_QUERY_LENGTH = MAX_EMOTICON_KEYWORDS * (MAX_EMOTICON_KEYWORD_LENGTH + 2);

/**
 * How many matching items `searchEmoticons` reads out of the database before
 * `toKeywordRelevance` ranks them (REQUIREMENTS.md § 13.9.1.).
 *
 * WARN: A cut applied **before** the ranking, and that is a known compromise rather
 * than an oversight. It falls on the candidate select, in `item_id` order — which has
 * nothing to do with relevance, so a query matching more than this can lose a highly
 * relevant item to one that merely sorts earlier. Unreachable at the few hundred packs
 * this ships with — it is the ceiling that keeps the query bounded at ten thousand,
 * where the answer is an approximate sort in SQL rather than a bigger number here.
 *
 * WARN: Not `EMOTICON_SEARCH_PAGE_SIZE`, and the two must not be confused. This
 * number never leaves the server; sending candidates to the browser would restore
 * the payload the whole change exists to remove.
 */
export const EMOTICON_SEARCH_CANDIDATE_LIMIT = 5000;

/**
 * How many ranked results one search answers with (REQUIREMENTS.md § 13.9.1.).
 *
 * INFO: § 13.8. draws them as a single row that scrolls sideways, so this is a
 * scroll's worth rather than a page anybody reaches the end of — a search whose best
 * answer is past the thirtieth cell is a search the user retypes instead.
 */
export const EMOTICON_SEARCH_PAGE_SIZE = 30;

/**
 * Maximum number of user-preferred (most frequently used) emoticons boosted to the top of search results (REQUIREMENTS.md § 13.9.2.).
 */
export const MAX_EMOTICON_SEARCH_USER_MATCHES = 3;

/**
 * How many distinct keywords `GET /api/emoticons/items?keywords=1` may answer with
 * (REQUIREMENTS.md § 13.8.).
 *
 * WARN: § 13.8. A ceiling on a **payload**, and it is here so that outgrowing the
 * list is visible rather than silent. The composer's underline set is one row per
 * distinct word in the whole library — a few thousand at the packs this ships with
 * (30–80KB), but measured at 36,741 words and 490KB over a synthetic five hundred,
 * which is a megabyte of JSON pulled on the way into a room with nothing naming the
 * cause. Truncated instead, the words the cut drops stop underlining and say plainly
 * that § 13.8.'s ceiling has been reached.
 *
 * WARN: The cut falls on a sorted list, so what it drops is the tail of the
 * collation rather than an arbitrary set — which is what makes the symptom
 * reproducible instead of a word that sometimes works.
 */
export const MAX_EMOTICON_KEYWORD_LIST = 10_000;

/**
 * How many ids one `GET /api/emoticons/items?ids=` may name (REQUIREMENTS.md
 * § 13.6.).
 *
 * INFO: § 13.6. 최근 사용 is the only caller and stores sixteen, so this is headroom
 * rather than a limit the app reaches — what it bounds is a hand-written query
 * asking for the library one id list at a time.
 *
 * WARN: `listEmoticonsByIds` truncates to it rather than refusing, so a caller that
 * grows past it loses the tail of its list instead of the whole answer — and that is
 * the **one** place the cut is made. The route used to slice as well, which is two
 * readings of one constant and only one of them ever being corrected.
 */
export const MAX_EMOTICON_ID_LOOKUP = 64;

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

// INFO: The finished restructure. Both image slots take the same types and the same ceiling — they hold two renderings of one picture, not two kinds of thing.
const SLOT_RULES: Record<EmoticonSlot, { mimes: readonly string[]; maxSize: number }> = {
  "still-image": { mimes: ALLOWED_EMOTICON_IMAGE_MIMES, maxSize: MAX_EMOTICON_IMAGE_SIZE },
  "animated-image": { mimes: ALLOWED_EMOTICON_IMAGE_MIMES, maxSize: MAX_EMOTICON_IMAGE_SIZE },
  audio: { mimes: ALLOWED_EMOTICON_AUDIO_MIMES, maxSize: MAX_EMOTICON_AUDIO_SIZE },
};

/**
 * Whether these bytes actually animate.
 *
 * WARN: The only honest answer to "is this the still or the animation", and the
 * reason the slot cannot be decided from a mime. `image/webp` and `image/gif` are
 * both perfectly legal for a single frame, and an APNG arrives as `image/png` — so
 * the mime is wrong in both directions and is wrong silently, which is a picker
 * cell playing an animation or a bubble holding still.
 *
 * WARN: Reads the container, never a decoder. `createImageBitmap` and an `<img>`
 * both answer "it decoded" for one frame and for sixty, and neither runs on the
 * server at all.
 */
export function isAnimatedImage(bytes: Uint8Array): boolean {
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return hasPngChunk(bytes, "acTL");
  }

  if (startsWith(bytes, GIF_SIGNATURE)) {
    return countGifFrames(bytes) > 1;
  }

  if (startsWith(bytes, RIFF_SIGNATURE) && startsWith(bytes.subarray(8), WEBP_SIGNATURE)) {
    return hasWebpChunk(bytes, "ANMF");
  }

  return false;
}

/** INFO: The one format `isAnimatedImage` cannot clear from a prefix — a GIF's second image descriptor may sit anywhere in the file, so a caller reading a slice has to know to read the rest. */
export function isGifImage(bytes: Uint8Array): boolean {
  return startsWith(bytes, GIF_SIGNATURE);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const GIF_SIGNATURE = [0x47, 0x49, 0x46, 0x38];

const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];

const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function readFourCc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

/** INFO: A PNG chunk is a 4-byte length, a 4-byte type, the payload and a 4-byte CRC. `acTL` must precede the first `IDAT`, so the walk stops there rather than reading the pixels. */
function hasPngChunk(bytes: Uint8Array, type: string): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = PNG_SIGNATURE.length;

  while (offset + 8 <= bytes.length) {
    const chunk = readFourCc(bytes, offset + 4);

    if (chunk === type) {
      return true;
    }

    if (chunk === "IDAT") {
      return false;
    }

    offset += 12 + view.getUint32(offset);
  }

  return false;
}

/** INFO: RIFF is a flat chunk list — a 4-byte tag, a 4-byte little-endian length, and a payload padded to an even boundary. `ANMF` is an actual frame, where `ANIM` is only the header that says frames may follow. */
function hasWebpChunk(bytes: Uint8Array, type: string): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    if (readFourCc(bytes, offset) === type) {
      return true;
    }

    const size = view.getUint32(offset + 4, true);

    offset += 8 + size + (size % 2);
  }

  return false;
}

/**
 * WARN: The whole file is walked, because a GIF's second image descriptor may sit
 * anywhere in it — this is the one format whose *absence* of animation cannot be
 * read off a prefix. The walk is block headers only; no LZW data is decoded.
 */
function countGifFrames(bytes: Uint8Array): number {
  // INFO: The 6-byte header, the 7-byte logical screen descriptor, and a global colour table only when its flag is set.
  const packed = bytes[10];
  let offset = 13 + (packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0);
  let frames = 0;

  while (offset < bytes.length) {
    const block = bytes[offset];

    if (block === 0x3b) {
      break;
    }

    if (block === 0x21) {
      offset = skipGifSubBlocks(bytes, offset + 2);

      continue;
    }

    if (block !== 0x2c) {
      break;
    }

    frames += 1;

    if (frames > 1) {
      break;
    }

    // INFO: The 10-byte image descriptor, a local colour table when its flag is set, then the LZW minimum code size the data blocks follow.
    const local = bytes[offset + 9];

    offset = skipGifSubBlocks(
      bytes,
      offset + 11 + (local & 0x80 ? 3 * 2 ** ((local & 0x07) + 1) : 0),
    );
  }

  return frames;
}

/** INFO: A run of length-prefixed blocks closed by a zero length, which is how GIF stores both extension payloads and pixel data. */
function skipGifSubBlocks(bytes: Uint8Array, start: number): number {
  let offset = start;

  while (offset < bytes.length && bytes[offset] !== 0x00) {
    offset += bytes[offset] + 1;
  }

  return offset + 1;
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
 * WARN: REQUIREMENTS.md § 13.7.1. Written out rather than built from
 * `EMOTICON_ITEMS_URL`, and the duplication is the point: the asset route is the one
 * the switch must never move. It is reached by an `<img>`, an `<audio>` and a bare
 * `new Image()`, which jandh-emoticons answers without CORS on purpose — and § 13.6.
 * warms a whole pack over this app's single HTTP/2 connection, which a second origin
 * would split in two.
 */
const EMOTICON_ASSET_ITEMS_PATH = "/api/emoticons/items";

/**
 * The same-origin URL an `<img>` or `<audio>` points at.
 *
 * WARN: A route, not an R2 URL — the request carries the session cookie and the
 * handler redirects to a presigned GET (REQUIREMENTS.md § 13.3.). Lives in
 * `shared/config` for the reason `toMediaUrl` does: `entities/emoticon`'s barrel
 * also exports a `server-only` api segment.
 *
 * WARN: Same-origin whatever § 13.7.1.'s switch is set to, and this app's own asset
 * route is therefore the one emoticon handler that is never dead code.
 *
 * WARN: `version` is `Emoticon.version` and callers that hold the item MUST pass
 * it. Editing an item (§ 13.4.) swaps the object behind an unchanged id, and this
 * redirect is cached (§ 9.) — without it the browser keeps serving the old asset.
 *
 * WARN: The finished restructure. `slot` is **required, and its default is not coming back**.
 * It defaulted to `image`, which is to say to the animated object, so every call site
 * that had not thought about the question was silently handed the heavy asset — a picker
 * of forty cells, a strip of tab icons and a 32px quote thumbnail included. That default
 * is the bug this whole body of work starts from, and making the parameter required is
 * what turns "which slot does this draw?" from something a reader has to know into
 * something the compiler asks at every call.
 */
export function toEmoticonAssetUrl(itemId: string, slot: EmoticonSlot, version?: number): string {
  const versionParam = version === undefined ? "" : `&v=${version}`;

  return `${EMOTICON_ASSET_ITEMS_PATH}/${itemId}/asset?slot=${slot}${versionParam}`;
}

/** REQUIREMENTS.md § 13.4. The stored still streamed from this origin as a `File`-able body, which the redirect above cannot be (§ 12.1.). */
export function toEmoticonAssetEditUrl(itemId: string, version?: number): string {
  return `${toEmoticonAssetUrl(itemId, "still-image", version)}&variant=edit`;
}

/** REQUIREMENTS.md § 13.4. The same redirect with an attachment disposition signed into it — what saves the file, since `download` is dropped cross-origin (§ 10.). */
export function toEmoticonAssetDownloadUrl(
  itemId: string,
  slot: EmoticonSlot,
  version?: number,
): string {
  return `${toEmoticonAssetUrl(itemId, slot, version)}&download=1`;
}

// INFO: Every type the two slot allow-lists admit, so a download is never saved as `.bin`; `audio/mp4` and `audio/x-m4a` are one `.m4a` (see `ALLOWED_EMOTICON_AUDIO_MIMES`).
const EMOTICON_ASSET_EXTENSIONS: Record<string, string> = {
  "image/avif": "avif",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
};

/** The name a downloaded asset saves under — R2 keys carry none of their own. */
export function toEmoticonAssetFilename(itemId: string, mime: string): string {
  return `emoticon-${itemId}.${EMOTICON_ASSET_EXTENSIONS[mime] ?? "bin"}`;
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
