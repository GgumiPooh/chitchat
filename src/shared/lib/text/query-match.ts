export type QuerySegment = {
  value: string;
  isMatch: boolean;
};

/**
 * Where `query` first occurs in `text`, as an offset into `text` itself, or `-1`.
 *
 * WARN: `toLowerCase` is not length-preserving — `İ` folds to two code units —
 * and an index found in the folded string would then be read against the
 * original one, so a single such character ahead of the match shifts every
 * offset after it. Where folding changes a length there is nothing to align, so
 * the scan drops to the exact one rather than answering a position that is off
 * by the drift.
 */
export function findQueryIndex(text: string, query: string, from = 0): number {
  const isFoldable =
    text.toLowerCase().length === text.length && query.toLowerCase().length === query.length;

  return isFoldable
    ? text.toLowerCase().indexOf(query.toLowerCase(), from)
    : text.indexOf(query, from);
}

/**
 * `text` cut into the parts a query matches and the parts it does not
 * (REQUIREMENTS.md § 8.6.1.) — the client-side split that stands in for
 * `ts_headline`, shared by the § 6.8. result row and the bubble it points at.
 *
 * WARN: `indexOf`, never a regex. The query is whatever the user typed, so a `.`
 * or a `(` in it would be a pattern rather than the character they meant — the
 * same reason the SQL side escapes `%` and `_`.
 */
export function splitTextByQuery(text: string, query: string): QuerySegment[] {
  const needle = query.trim();

  if (needle.length === 0) {
    return [{ value: text, isMatch: false }];
  }

  const segments: QuerySegment[] = [];
  let cursor = 0;

  for (let at = findQueryIndex(text, needle); at >= 0; at = findQueryIndex(text, needle, cursor)) {
    if (at > cursor) {
      segments.push({ value: text.slice(cursor, at), isMatch: false });
    }

    segments.push({ value: text.slice(at, at + needle.length), isMatch: true });
    cursor = at + needle.length;
  }

  if (cursor < text.length) {
    segments.push({ value: text.slice(cursor), isMatch: false });
  }

  return segments;
}
