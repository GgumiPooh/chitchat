import { AN_HOUR, A_DAY, A_KILOBYTE, A_SECOND } from "@/shared/lib";

/** REQUIREMENTS.md § 8.9. Resolves one URL into the card a text bubble renders above its text. */
export const LINK_PREVIEW_PATH = "/api/link-preview";

// WARN: `url` is the table's primary key and a btree entry is capped near 2704 bytes, so this is a storage limit rather than a preference. A message may still carry a longer URL — it simply gets no card.
export const MAX_LINK_PREVIEW_URL_LENGTH = 1_024;

// INFO: A title or a thumbnail changing is not news worth refetching quickly, and the cache is what keeps scrolling old history free of outbound requests.
export const LINK_PREVIEW_TTL = 7 * A_DAY;

// WARN: Failures are cached too, or a link to a host that is down costs a full timeout on every scroll past it. Short, because "down" is usually temporary.
export const LINK_PREVIEW_FAILURE_TTL = AN_HOUR;

// INFO: The whole card is one small request; a page that has not answered by now is one the user has already scrolled past.
export const LINK_PREVIEW_TIMEOUT = 5 * A_SECOND;

// WARN: The metadata lives in `<head>`, so the body is read only until this — a video file or a multi-megabyte page would otherwise be buffered whole to find tags that were never coming.
export const MAX_LINK_PREVIEW_BYTES = 512 * A_KILOBYTE;

// INFO: A redirect chain longer than this is a tracker loop, not a canonicalisation.
export const MAX_LINK_PREVIEW_REDIRECTS = 3;

// INFO: Sites gate Open Graph tags on recognising a crawler, so the agent has to read as one — and it names the app so an operator can see who is asking.
export const LINK_PREVIEW_USER_AGENT =
  "Mozilla/5.0 (compatible; JandhBot/1.0; +https://github.com/jeheecheon) facebookexternalhit/1.1";
