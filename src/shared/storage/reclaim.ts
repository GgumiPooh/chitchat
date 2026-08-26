import "server-only";

import { MEDIA_DELETE_GRACE } from "@/shared/config";
import { getDb, media, storageReservations } from "@/shared/db";
import { AN_HOUR, A_SECOND, safelyRunAsync } from "@/shared/lib";
import { and, count, eq, inArray, isNotNull, isNull, lte, notExists, sql } from "drizzle-orm";
import { purgeNow } from "./purge";

// WARN: One call's ceiling per pass, so an upload can never pay for a month of deletes. The work is idempotent and the next call resumes it, so a short pass is a slow drain rather than a lost one.
const RECLAIM_LIMIT = 200;

/**
 * WARN: One hour, matching `ORPHAN_MIN_AGE` in the ops service and **not**
 * `MEDIA_DELETE_GRACE`. A stamped row is what tells that service's audit an object was
 * purged on purpose, and its listing is only consulted for objects older than this — so
 * dropping the row sooner reports the same object as an orphan, which is the expensive
 * false positive the delay exists to prevent. Move the two together or not at all.
 */
const SPENT_CLAIM_RETENTION = AN_HOUR;

/**
 * Reclaims the bytes behind soft-deleted media and expired upload claims
 * (REQUIREMENTS.md § 9.).
 *
 * INFO: The ops service (§ 12.4.) runs this same job on an interval, and this copy
 * exists so that retiring it does not silently stop cleanup. Both may select the same
 * candidates and issue the same deletes: deleting a key R2 no longer holds succeeds, and
 * every stamp is guarded on `r2_purged_at IS NULL`, so the two need no lock between them.
 *
 * WARN: The work is produced by **deletes** and triggered by **uploads**, which is the
 * known weakness. A stretch of deleting without uploading leaves the bytes in the bucket
 * until the ops service's next interval catches them. That is accepted — this is the half
 * that keeps cleanup alive without that service, not the schedule anything depends on.
 *
 * WARN: Never throws. It is cleanup behind somebody else's request, and a bucket or a
 * pool that refuses must not fail the upload that happened to trigger it.
 */
export async function reclaimExpiredStorage(limit: number = RECLAIM_LIMIT): Promise<void> {
  await safelyRunAsync(async () => {
    await reclaimExpiredStorageOnce(limit);
  });
}

/** What one pass finished. Both counts are **objects R2 confirmed**, never candidates. */
export type ReclaimReport = {
  media: number;
  claims: number;
};

/**
 * One pass of the same work, reporting what it finished and throwing what it could not.
 *
 * INFO: The scheduled reclaim is what needs both. It has to know when the queue is drained
 * — `RECLAIM_LIMIT` bounds a pass, so a backlog takes several — and a run that could not
 * reach the bucket has to fail loudly where the upload-triggered copy above must not.
 *
 * WARN: A pass reporting zero means "nothing more to do **this run**", which is drained
 * and total failure alike. A caller looping on it therefore needs a ceiling of its own:
 * a key R2 keeps refusing stays unstamped and is selected again by the very next pass.
 */
export async function reclaimExpiredStorageOnce(
  limit: number = RECLAIM_LIMIT,
): Promise<ReclaimReport> {
  await expireAiAttachments(limit);

  const media = await purgeNow(await findPurgeableMedia(limit));
  const claims = await purgeNow(await findExpiredClaims(limit));

  await dropSpentClaims();

  return { media: media.length, claims: claims.length };
}

/**
 * REQUIREMENTS.md § 8.15. Folds an Ask AI attachment whose `expires_at` has passed
 * into an ordinary soft-delete — nothing but this timestamp distinguishes it from any
 * other `media` row from here on, so it tombstones and purges through the same path
 * every other deletion does.
 *
 * WARN: A pure `deleted_at` stamp, never a purge of its own — this pass touches no R2
 * object, so it does not belong in `ReclaimReport`, which counts only what R2 confirmed.
 */
async function expireAiAttachments(limit: number): Promise<void> {
  const candidates = getDb()
    .select({ id: media.id })
    .from(media)
    .where(
      and(isNotNull(media.expiresAt), lte(media.expiresAt, sql`now()`), isNull(media.deletedAt)),
    )
    .limit(limit);

  await getDb()
    .update(media)
    .set({ deletedAt: sql`now()` })
    .where(inArray(media.id, candidates));
}

/**
 * How much a run would reclaim right now, without reclaiming any of it.
 *
 * INFO: What 미리보기 asks. Unlike the orphan sweep's preview this is not a safety gate —
 * nothing here can be wrong about what it found, since every row it counts is one the
 * database has already marked deleted. It answers "is there anything to do", which is the
 * question worth having before spending a run.
 *
 * WARN: Counted, never `LIMIT`ed. `RECLAIM_LIMIT` bounds one pass of the real work, and a
 * preview reporting that ceiling would answer "200" for a backlog of thousands.
 */
export async function countReclaimable(): Promise<ReclaimReport> {
  const [mediaRows, claimRows] = await Promise.all([
    getDb().select({ count: count() }).from(media).where(isPurgeableMedia()),
    getDb().select({ count: count() }).from(storageReservations).where(isExpiredClaim()),
  ]);

  return { media: mediaRows[0]?.count ?? 0, claims: claimRows[0]?.count ?? 0 };
}

/**
 * INFO: § 12. Soft-deleted past the window a peer may still replay a cached 302 inside;
 * `media_pending_purge_idx` is the partial index this reads through.
 *
 * WARN: One predicate, shared with `countReclaimable`. A preview that asked a differently
 * worded question would report a number the run then does not match.
 */
function isPurgeableMedia() {
  return and(
    isNotNull(media.deletedAt),
    lte(media.deletedAt, sinceNow(MEDIA_DELETE_GRACE)),
    isNull(media.r2PurgedAt),
  );
}

function findPurgeableMedia(limit: number): Promise<string[]> {
  return getDb()
    .select({ r2Key: media.r2Key })
    .from(media)
    .where(isPurgeableMedia())
    .limit(limit)
    .then(toKeys);
}

/**
 * INFO: § 9. A claim nobody redeemed, whose object is therefore named by nothing else.
 *
 * WARN: The `NOT EXISTS` should be unreachable — registration consumes the claim, so an
 * expired one cannot have a row — and it is carried anyway because reachable it would
 * strip the bytes out from under a **live** `media` row, which nothing can repair. Both
 * services state it, so all copies of this query agree.
 */
function isExpiredClaim() {
  return and(
    lte(storageReservations.expiresAt, sql`now()`),
    isNull(storageReservations.r2PurgedAt),
    notExists(
      getDb()
        .select({ one: sql`1` })
        .from(media)
        .where(eq(media.r2Key, storageReservations.r2Key)),
    ),
  );
}

function findExpiredClaims(limit: number): Promise<string[]> {
  return getDb()
    .select({ r2Key: storageReservations.r2Key })
    .from(storageReservations)
    .where(isExpiredClaim())
    .limit(limit)
    .then(toKeys);
}

/**
 * Drops claims whose bytes are confirmed gone, so the reclaim's own query does not read
 * a table that only grows.
 *
 * WARN: Stamped rows only, and never in the same statement as the stamp. An unstamped
 * row deleted here loses the one record that its object is still in the bucket.
 */
function dropSpentClaims(): Promise<unknown> {
  return getDb()
    .delete(storageReservations)
    .where(
      and(
        isNotNull(storageReservations.r2PurgedAt),
        lte(storageReservations.r2PurgedAt, sinceNow(SPENT_CLAIM_RETENTION)),
      ),
    );
}

// WARN: The database's clock, never `Date.now()` — an app server running early would reclaim keys whose window has not actually closed.
function sinceNow(age: number) {
  return sql`now() - make_interval(secs => ${age / A_SECOND}::double precision)`;
}

function toKeys(rows: { r2Key: string }[]): string[] {
  return rows.map((row) => row.r2Key);
}
