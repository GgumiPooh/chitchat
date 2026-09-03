import type { MessageId, UserId } from "@/shared/lib";
import "server-only";

import { getDb, messages, users } from "@/shared/db";
import type { DbTransaction } from "@/shared/storage";
import { and, eq, isNull, lt, or, sql, type SQL } from "drizzle-orm";

// WARN: The `<` below is SQL against a `bigint` column, not the string comparison `CLAUDE.md § 3.2.` forbids — Postgres orders it numerically.

/**
 * The guarded write both `markUserRead` and a send (`REQUIREMENTS.md § 8.8.`) share:
 * caps the reported id at the newest message that exists, and moves the cursor only
 * when that capped value is ahead of what is stored — which is what keeps a no-op
 * UPDATE from waking the § 6. `read_cursor` trigger.
 */
export async function advanceReadCursor(
  db: ReturnType<typeof getDb> | DbTransaction,
  userId: UserId,
  cursor: MessageId | SQL<string>,
): Promise<void> {
  // WARN: A send passes its own freshly inserted id uncapped — `max(id)` read inside that transaction can already be a peer's later message, which the sender has not seen.
  const capped = typeof cursor === "string" ? sql<string>`${cursor}::bigint` : cursor;

  await db
    .update(users)
    .set({ lastReadMessageId: capped })
    .where(
      and(
        eq(users.id, userId),
        or(isNull(users.lastReadMessageId), lt(users.lastReadMessageId, capped)),
      ),
    );
}

/**
 * Advances this user's read cursor to `lastSeenMessageId` — what the client
 * reports having actually rendered (`REQUIREMENTS.md § 8.8.`).
 *
 * WARN: The LEAST cap is what stops a stale or skewed client pushing the cursor
 * past a message that does not exist. The forward-only guard is what keeps a
 * second device, or a late request from this one, from walking it backwards —
 * and it is also what makes the UPDATE a no-op when nothing moves, which is what
 * keeps the § 6. `read_cursor` trigger quiet under the app's most frequent write
 * (§ 8.4.).
 */
export async function markUserRead(userId: UserId, lastSeenMessageId: MessageId): Promise<void> {
  await advanceReadCursor(getDb(), userId, cappedCursor(lastSeenMessageId));
}

function cappedCursor(lastSeenMessageId: MessageId): SQL<string> {
  return sql<string>`least(${lastSeenMessageId}::bigint, (select max(${messages.id}) from ${messages}))`;
}
