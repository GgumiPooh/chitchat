/**
 * REQUIREMENTS.md § 6. Every id in this app is a 64-bit snowflake, carried as a
 * decimal string: `43 bits ms | 10 bits machine | 10 bits sequence`.
 *
 * WARN: A string, never a `number`. A snowflake exceeds `Number.MAX_SAFE_INTEGER`,
 * so `JSON.parse` and `Number()` both round it silently — `7231234567890123456`
 * becomes `7231234567890124000` and the row it names stops existing.
 *
 * WARN: And never compared with `<`, `>` or `Math.max` either. Every id this app
 * will ever mint is 19 digits (§ 6. picks the epoch for it), so lexicographic order
 * happens to agree with numeric order — which is exactly what would make a stray
 * `>` survive review and then fail the day the width moves. Use `compareId`.
 *
 * WARN: The layout is **frozen** and is no longer free to be re-cut. This note used to
 * say the opposite, on the grounds that ordering was all the app asked of an id and
 * that an `idToDate` would tie the file to the bit widths forever. RESTRUCTURE.md
 * § 3.1. takes that trade deliberately: the timestamp is read back out of the id now,
 * every `created_at` column is gone, and a change to the epoch or the field widths
 * would silently restate the age of every row already written. Re-cutting the format
 * means versioning it and keeping the old branch for every id minted under it.
 *
 * WARN: § 3.1. The time an id carries is the wall clock of whichever instance minted
 * it — two deployments on two platforms — rather than the database's `now()`, and
 * `nextSnowflake` mints deliberately ahead of real time when a millisecond's sequence
 * is exhausted. Sub-second, and accepted; do not build anything on this that needs a
 * single authoritative clock.
 */
declare const idBrand: unique symbol;

type Id<TName extends string> = string & { readonly [idBrand]: TName };

export type UserId = Id<"UserId">;

export type SessionId = Id<"SessionId">;

export type MediaId = Id<"MediaId">;

export type MessageId = Id<"MessageId">;

export type EventId = Id<"EventId">;

export type EmoticonPackId = Id<"EmoticonPackId">;

export type EmoticonItemId = Id<"EmoticonItemId">;

export type PushSubscriptionId = Id<"PushSubscriptionId">;

/**
 * The last segment of an R2 key (REQUIREMENTS.md § 9.). Not a row id — no table has
 * a column of it — but the app mints it and it shares the generator, so it shares
 * the brand space rather than travelling as a bare string.
 */
export type StorageObjectId = Id<"StorageObjectId">;

/** Any of the branded ids above, for code that is generic over them. */
export type SnowflakeId =
  | UserId
  | SessionId
  | MediaId
  | MessageId
  | EventId
  | EmoticonPackId
  | EmoticonItemId
  | PushSubscriptionId
  | StorageObjectId;

// INFO: Up to 19 digits is `2^63 - 1`; the leading class excludes `0`, so no caller can pass a padded or empty segment.
export const SNOWFLAKE_PATTERN = /^[1-9]\d{0,18}$/;

export function isSnowflake(value: string): boolean {
  return SNOWFLAKE_PATTERN.test(value);
}

/**
 * Brands a string already proven to be a snowflake. The zod schemas in
 * `@/shared/config` and the drizzle column type are the only callers.
 *
 * WARN: Not a validator — `isSnowflake` is, and every boundary owes it a call.
 */
export function toId<TId extends SnowflakeId>(value: string): TId {
  return value as TId;
}

/** `-1`, `0` or `1`, ordering two ids the way the database orders them. */
export function compareId(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);

  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * REQUIREMENTS.md § 6. The width of the machine and sequence fields together, which is
 * what a millisecond is worth in id space.
 *
 * WARN: Exported so that SQL which has to reconstruct the timestamp builds it from
 * *this* value rather than writing `20` out again — `effectivePackPosition` is the one
 * such caller. A literal in a migration or a query is the third copy of a constant
 * `CLAUDE.md § 4.2.1.` already requires to be mirrored across two repositories.
 */
export const SNOWFLAKE_TIME_SHIFT = 20n;

/**
 * REQUIREMENTS.md § 6. 1990-01-01T00:00:00Z, the instant the timestamp field counts
 * from.
 *
 * WARN: Declared here rather than beside the generator so the browser can reach it —
 * `db/snowflake.ts` is `server-only` and `idToDate` runs wherever a timestamp is
 * drawn. That module imports this one; there is no second copy.
 */
export const SNOWFLAKE_EPOCH = 631152000000n;

/**
 * When the row this id names was created.
 *
 * INFO: RESTRUCTURE.md § 3.3. This replaces the `created_at` column on every table
 * whose primary key is a snowflake — the id already carried the instant, and storing
 * it twice meant the ordering key and the displayed time could disagree.
 *
 * WARN: § 3.1. Reading this ties the app to the bit layout permanently. That is the
 * decision, not an oversight; the header note says what it costs.
 */
export function idToDate(id: string): Date {
  return new Date(Number((BigInt(id) >> SNOWFLAKE_TIME_SHIFT) + SNOWFLAKE_EPOCH));
}

/**
 * The smallest id that could have been minted `ms` milliseconds before `id`.
 *
 * INFO: REQUIREMENTS.md § 8.4.'s replay floor. An id is taken at INSERT and becomes
 * visible at COMMIT, so a row can arrive carrying an id below the cursor the reader
 * has already moved past — and the window that has to cover is a duration, which is
 * what this expresses. Answers `"0"` below the epoch, the § 8.4. "from the start"
 * sentinel.
 */
export function idFloorBefore<TId extends string>(id: TId, ms: number): TId {
  const at = (BigInt(id) >> SNOWFLAKE_TIME_SHIFT) - BigInt(ms);

  return (at <= 0n ? "0" : (at << SNOWFLAKE_TIME_SHIFT).toString()) as TId;
}

/**
 * The id one below `id`, for a caller that needs an exclusive bound where the API
 * takes an inclusive one (`fetchChangedMessages`).
 */
export function idBefore<TId extends string>(id: TId): TId {
  return (BigInt(id) - 1n).toString() as TId;
}

/** The later of two ids — `Math.max` for values `Math.max` would destroy. */
export function maxId<TId extends string>(left: TId, right: TId): TId {
  return compareId(left, right) >= 0 ? left : right;
}
