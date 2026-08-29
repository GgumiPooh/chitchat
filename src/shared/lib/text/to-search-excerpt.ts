import { SEARCH_EXCERPT_LEAD, SEARCH_EXCERPT_MAX_LENGTH } from "@/shared/config";
import { findQueryIndex } from "./query-match";

const ELLIPSIS = "…";

/**
 * The line a search result shows — a window of `text` around its first match
 * (DESIGN.md § 6.8.).
 *
 * WARN: The window has to exist. The row clamps to two lines, so a match 1,500
 * characters into a message would be cut away by the clamp and the row would
 * highlight nothing — which reads as a result that does not contain the query.
 */
export function toSearchExcerpt(text: string, query: string): string {
  // WARN: The same aligned search the client marks with. A fold done here alone would answer an offset that is off by the drift `findQueryIndex` exists to avoid, and the window would be cut around the wrong characters.
  const at = findQueryIndex(text, query);

  if (at < 0 || text.length <= SEARCH_EXCERPT_MAX_LENGTH) {
    return text.slice(0, SEARCH_EXCERPT_MAX_LENGTH);
  }

  const start = Math.max(0, at - SEARCH_EXCERPT_LEAD);
  // WARN: The window is at least the whole match plus its lead, never a flat `SEARCH_EXCERPT_MAX_LENGTH` from `start`. `MAX_SEARCH_QUERY_LENGTH` is longer than that budget minus the lead, so a long pasted query was cut inside its own window — the client's split then found nothing and the row rendered with no mark on it at all, which is the very failure this function exists to prevent.
  const end = Math.min(
    text.length,
    Math.max(start + SEARCH_EXCERPT_MAX_LENGTH, at + query.length + SEARCH_EXCERPT_LEAD),
  );

  return [
    start > 0 ? ELLIPSIS : "",
    text.slice(start, end),
    end < text.length ? ELLIPSIS : "",
  ].join("");
}
