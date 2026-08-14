import { SNOWFLAKE_PATTERN, toId, type SnowflakeId } from "@/shared/lib";
import { z } from "zod";

/**
 * REQUIREMENTS.md § 6. The one validator every id crossing a boundary goes
 * through — a path segment, a query parameter, a JSON body field, a `pg_notify`
 * payload — branding the value on the way past.
 *
 * WARN: A string schema, never `z.coerce.number()`. A 19-digit id does not survive
 * `Number()`, and a `z.number()` that happened to pass would already be the wrong
 * row. `z.uuid()` is what this replaced; the shapes are the same size of check.
 */
export function snowflakeSchema<TId extends SnowflakeId>() {
  return z
    .string()
    .regex(SNOWFLAKE_PATTERN)
    .transform(toId<TId>);
}

/**
 * A cursor that also accepts `0` (REQUIREMENTS.md § 8.4.) — the "from the start of
 * the conversation" sentinel a client with an empty window catches up from.
 *
 * WARN: `0` is not a mintable id and never names a row. It is below every value the
 * generator can produce, which is the whole of what `id > cursor` needs from it.
 */
export function snowflakeCursorSchema<TId extends SnowflakeId>() {
  return z.union([z.literal("0"), z.string().regex(SNOWFLAKE_PATTERN)]).transform(toId<TId>);
}
