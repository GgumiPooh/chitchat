import "server-only";

import { getDb, media, storageReservations } from "@/shared/db";
import { and, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { toThumbKey } from "./keys";
import { deleteObjects } from "./objects";

/**
 * Takes the bytes behind `keys` out of the bucket, records that it happened, and
 * answers the keys that are actually finished (REQUIREMENTS.md § 9.).
 *
 * WARN: The order is the whole mechanism. The objects go first and the stamp goes
 * second, and **only the keys R2 confirmed are stamped** — so a delete that fails
 * leaves the rows exactly as the next pass expects to find them, which is why there is
 * no attempt counter and no dead-letter state. Stamping unconditionally would turn one
 * failed request into a permanent orphan nothing looks for again, since a stamped row
 * leaves both the reclaim's candidate query and § 12.4.'s keep set.
 *
 * WARN: Deleting an object R2 does not hold **succeeds**, and every retry safety here
 * rests on it — a second pass over a key the first pass already cleared is a no-op
 * rather than an error.
 *
 * INFO: The `_thumb` sibling is derived rather than reserved or rowed (§ 9.), so it is
 * purged from the base key here rather than being carried by every caller.
 */
export async function purgeNow(keys: string[]): Promise<string[]> {
  if (keys.length === 0) {
    return [];
  }

  const confirmed = new Set(await deleteObjects(keys.flatMap((key) => [key, toThumbKey(key)])));

  // WARN: Both halves or neither. A key whose `_thumb` was refused is not finished, and stamping it would retire the pair while half of it is still in the bucket.
  // INFO: A `_thumb` R2 never held is reported as deleted like any other key, so the pair test costs a file attachment nothing.
  const purged = keys.filter((key) => confirmed.has(key) && confirmed.has(toThumbKey(key)));

  if (purged.length === 0) {
    return [];
  }

  // WARN: `deleted_at IS NOT NULL` is a guard, not a filter. A live row stamped as purged leaves the § 9. queue while `GET /api/media/{id}` still serves it — the one state no later pass can find, let alone repair.
  await getDb()
    .update(media)
    .set({ r2PurgedAt: sql`now()` })
    .where(and(inArray(media.r2Key, purged), isNotNull(media.deletedAt), isNull(media.r2PurgedAt)));

  await getDb()
    .update(storageReservations)
    .set({ r2PurgedAt: sql`now()` })
    .where(and(inArray(storageReservations.r2Key, purged), isNull(storageReservations.r2PurgedAt)));

  return purged;
}
