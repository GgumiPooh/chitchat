import type { SnowflakeId } from "@/shared/lib";
import { customType } from "drizzle-orm/pg-core";

/**
 * REQUIREMENTS.md § 6. A `bigint` column holding a snowflake, surfaced as the
 * branded decimal string every layer of the app carries (`@/shared/lib`).
 *
 * WARN: Not `bigint({ mode: "number" })`, which rounds every value above 2^53 to a
 * row that does not exist, and not `mode: "bigint"` either — `JSON.stringify` throws
 * on a `BigInt`, and every id here crosses at least one JSON boundary. postgres.js
 * already hands `int8` back as a string, so this mapping costs nothing at runtime.
 */
export function snowflake<TId extends SnowflakeId>(name: string) {
  return customType<{ data: TId; driverData: string }>({
    dataType: () => "bigint",
    fromDriver: (value) => value as TId,
    toDriver: (value) => value,
  })(name);
}
