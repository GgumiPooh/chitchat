import "server-only";

import { ensureEnv } from "@/shared/config";
import postgres from "postgres";

export type DbSession = ReturnType<typeof postgres>;

/**
 * A dedicated, unpooled connection outside the request pool — what
 * `listenToChannels` opens for its `LISTEN`s, exposed directly for a caller that
 * also needs to run ordinary queries on that same session (`runQueuedGeneration`'s
 * advisory lock, in particular).
 *
 * WARN: REQUIREMENTS.md § 6.'s reason for the unpooled string applies here too — a
 * transaction-mode pooler hands the connection to another caller between
 * statements, which would drop both the `LISTEN` and the advisory lock without
 * erroring.
 *
 * WARN: The caller owns the connection's whole lifetime — call `.end()` in a
 * `finally` block; nothing else reclaims it.
 */
export function openUnpooledSession(): DbSession {
  return postgres(ensureEnv("DATABASE_URL_UNPOOLED"), { max: 1, prepare: false });
}
