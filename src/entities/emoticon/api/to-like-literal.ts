/**
 * A user's typed characters as a `LIKE` / `ILIKE` literal.
 *
 * WARN: `%`, `_` and the escape character itself. This is not hygiene: unescaped, a
 * query of `%` matches every row in the library and one of `_` matches every row of
 * that length. The user typed characters, not a pattern.
 *
 * WARN: No `ESCAPE` clause goes with it — a backslash is Postgres' own default for
 * `LIKE`, and `entities/message`'s `search-messages.ts` escapes the same three the
 * same way.
 */
export function toLikeLiteral(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}
