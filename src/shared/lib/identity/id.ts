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
 * WARN: `idFloorBefore` is the **only** thing that reads a field back out of an id,
 * and it is what ties this file to the bit widths (§ 6.). Anything else added here
 * that decodes one — an `idToDate`, say — needs a version branch the day the split
 * moves; the layout is otherwise free to be re-cut, since ordering is all the rest
 * of the app asks of an id.
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

// INFO: § 6. The width of the machine and sequence fields together, which is what a millisecond is worth in id space.
const SNOWFLAKE_TIME_SHIFT = 20n;

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
