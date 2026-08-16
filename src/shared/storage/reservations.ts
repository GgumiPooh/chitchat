import "server-only";

import { STORAGE_RESERVATION_TTL } from "@/shared/config";
import { getDb, media, storageReservations } from "@/shared/db";
import { A_SECOND, type UserId } from "@/shared/lib";
import { and, eq, gt, inArray, isNull, notExists, sql } from "drizzle-orm";
import { purgeNow } from "./purge";

/** The handle `getDb().transaction` hands its callback, for a caller that has to consume a reservation inside its own write. */
export type DbTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Claims `r2Key` before anything is signed for it or copied to it
 * (REQUIREMENTS.md § 9.), so no object can exist that no row named first.
 *
 * WARN: `expires_at` is computed by the database rather than from `Date.now()`. The
 * reclaim compares it against `now()` on that same clock, and the two clocks drift by
 * more than nothing over a window this size — an app server running early would have
 * its own uploads reclaimed out from under it.
 *
 * INFO: The base key only. `_thumb` is derived everywhere else (§ 9.), and a second row
 * here would split a convention the reclaim resolves in one place.
 */
export async function reserveKey(r2Key: string, ownerId: UserId): Promise<void> {
  await getDb()
    .insert(storageReservations)
    .values({
      r2Key,
      ownerId,
      // WARN: The cast is not decoration — a bare placeholder reaches Postgres as `unknown` and `make_interval`'s named argument gives it nothing to resolve against, which fails at plan time rather than at build time.
      expiresAt: sql`now() + make_interval(secs => ${STORAGE_RESERVATION_TTL / A_SECOND}::double precision)`,
    })
    // INFO: A retried ticket for a key already claimed keeps the first claim rather than extending it.
    .onConflictDoNothing();
}

export type ConsumedReservations = {
  /** The keys whose claim was live and has now been handed over to the row being written. */
  consumed: string[];
  /** The keys whose claim had lapsed, and whose bytes a reclaim may therefore already have taken. */
  expired: string[];
};

/**
 * Hands the reservations for `keys` over to the caller's own write.
 *
 * WARN: An expired row is deliberately **left where it is** rather than consumed. Its
 * bytes may already be gone, and leaving the row is what keeps the reclaim's record of
 * that key intact for the pass that finishes the job.
 */
export async function consumeReservations(
  tx: DbTransaction,
  keys: string[],
): Promise<ConsumedReservations> {
  if (keys.length === 0) {
    return { consumed: [], expired: [] };
  }

  const consumed = await tx
    .delete(storageReservations)
    .where(
      and(inArray(storageReservations.r2Key, keys), gt(storageReservations.expiresAt, sql`now()`)),
    )
    .returning({ r2Key: storageReservations.r2Key });

  // INFO: Whatever survives the DELETE above matched a key and failed the freshness test, which is exactly the expired set.
  const lapsed = await tx
    .select({ r2Key: storageReservations.r2Key })
    .from(storageReservations)
    .where(inArray(storageReservations.r2Key, keys));

  return { consumed: consumed.map((row) => row.r2Key), expired: lapsed.map((row) => row.r2Key) };
}

/**
 * REQUIREMENTS.md § 13.3. The client-driven takeback — objects that landed in R2 for a
 * submit that never produced a row.
 *
 * WARN: Only the caller's own live reservations. A key that reached a `media` row has
 * had its reservation consumed already, so this cannot reach the assets of something
 * that registered — which is the property that used to be asserted by asking the
 * emoticon tables what was slotted, and got it wrong.
 *
 * WARN: Expire, then purge, and the two may not be collapsed into a
 * `DELETE … RETURNING`. The row is the only thing naming the object, so removing it
 * before R2 answers turns a crash into the orphan this table exists to make impossible;
 * expiring it first is what makes the second step safe, because `consumeReservations`
 * refuses a lapsed claim and a registration racing this one therefore cannot end up
 * pointing at bytes about to go.
 *
 * WARN: The row is deliberately **left**, stamped, for `reclaimExpiredStorage` to drop
 * an hour later. Deleting it here would take it out of § 12.4.'s keep set while its
 * object may still be in a listing that sweep began before the purge — which reports a
 * clean takeback as a writer bug.
 *
 * WARN: A key that already reached a `media` row is skipped by the `NOT EXISTS`, not
 * merely left un-deleted. Purging it would strip the object out from under a live row —
 * the one state no later pass can repair, since nothing marks it.
 */
export async function releaseReservations(keys: string[], ownerId: UserId): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  const lapsed = await getDb()
    .update(storageReservations)
    .set({ expiresAt: sql`now()` })
    .where(
      and(
        inArray(storageReservations.r2Key, keys),
        eq(storageReservations.ownerId, ownerId),
        gt(storageReservations.expiresAt, sql`now()`),
        isNull(storageReservations.r2PurgedAt),
        notExists(
          getDb()
            .select({ one: sql`1` })
            .from(media)
            .where(eq(media.r2Key, storageReservations.r2Key)),
        ),
      ),
    )
    .returning({ r2Key: storageReservations.r2Key });

  if (lapsed.length === 0) {
    return;
  }

  await purgeNow(lapsed.map((row) => row.r2Key));
}
