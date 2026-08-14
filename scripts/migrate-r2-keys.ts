import { emoticonItems, getDb, media, nextSnowflake } from "@/shared/db";
import { mapPooled, toId, type Nullable, type StorageObjectId, type UserId } from "@/shared/lib";
import {
  copyObject,
  headObject,
  toScopePrefix,
  toThumbKey,
  type StorageScope,
} from "@/shared/storage";
import { eq, sql } from "drizzle-orm";

/**
 * REQUIREMENTS.md § 9. Moves every stored object onto a key built from snowflakes,
 * after `0030` has renumbered the rows.
 *
 * The old key is `{scope}/{old user uuid}/{uuid}` and the new one is
 * `{scope}/{user snowflake}/{object snowflake}`. `media` carries its owner, so its
 * new prefix is read off the row; `emoticon_items` carries none, so the uploader is
 * recovered from `snowflake_user_id_map` — the table `0030` leaves behind for
 * exactly this, and which a later migration drops once this script has run.
 *
 * WARN: Copies and never deletes. The old objects are what makes the whole change
 * reversible: restoring the `pg_dump` puts back rows naming the old keys, and those
 * objects have to still be there for that to be a rollback rather than a data loss.
 * Dropping the map and sweeping the bucket are a separate, later piece of work.
 *
 * WARN: Resumable, and safe to run twice. A row whose key already parses as a
 * snowflake pair is skipped, so an interrupted run is finished by running it again.
 *
 * INFO: The database is written only after every object of a row has landed, one row
 * at a time. A crash therefore leaves objects nothing points at — which is the
 * harmless direction; the other one is a row pointing at an object that does not
 * exist, which is a broken photo on screen.
 */
const CONCURRENCY = 8;

const SNOWFLAKE_SEGMENT = /^\d{1,19}$/;

type KeyParts = { scope: StorageScope; owner: string; object: string };

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const db = getDb();
  const owners = await loadOwnerMap(db);

  console.log(`${owners.size} user ids mapped${isDryRun ? " (dry run)" : ""}`);

  const mediaRows = await db
    .select({ id: media.id, ownerId: media.ownerId, r2Key: media.r2Key })
    .from(media);
  const itemRows = await db
    .select({ id: emoticonItems.id, r2Key: emoticonItems.r2Key, audioKey: emoticonItems.audioKey })
    .from(emoticonItems);

  let moved = 0;
  let skipped = 0;

  await mapPooled(
    mediaRows,
    async (row) => {
      const parts = parseKey(row.r2Key);

      if (!parts) {
        skipped += 1;

        return;
      }

      const nextKey = `${toScopePrefix(parts.scope, row.ownerId)}${nextSnowflake<StorageObjectId>()}`;

      if (!isDryRun) {
        await copyObject(row.r2Key, nextKey);
        // INFO: § 9. A derived key rather than a row of its own, so it moves with its parent and is not looked up. A file attachment and a recording have none, which `headObject` is what tells us.
        await copyThumbIfPresent(row.r2Key, nextKey);
        await db.update(media).set({ r2Key: nextKey }).where(eq(media.id, row.id));
      }

      moved += 1;
    },
    { limit: CONCURRENCY },
  );

  await mapPooled(
    itemRows,
    async (row) => {
      const parts = parseKey(row.r2Key);
      const owner = parts && owners.get(parts.owner);

      if (!parts || !owner) {
        skipped += 1;

        return;
      }

      const nextKey = `${toScopePrefix(parts.scope, owner)}${nextSnowflake<StorageObjectId>()}`;
      const nextAudioKey = row.audioKey
        ? `${toScopePrefix(parts.scope, owner)}${nextSnowflake<StorageObjectId>()}`
        : null;

      if (!isDryRun) {
        await copyObject(row.r2Key, nextKey);

        if (row.audioKey && nextAudioKey) {
          await copyObject(row.audioKey, nextAudioKey);
        }

        await db
          .update(emoticonItems)
          .set({ r2Key: nextKey, audioKey: nextAudioKey })
          .where(eq(emoticonItems.id, row.id));
      }

      moved += 1;
    },
    { limit: CONCURRENCY },
  );

  console.log(`moved ${moved}, skipped ${skipped} (already migrated or unparsable)`);
  process.exit(0);
}

/**
 * WARN: Read through raw SQL, because `snowflake_user_id_map` is deliberately not in
 * `schema/` — it exists for the length of this one migration and a drizzle table for
 * it would have to be added and then removed again.
 */
async function loadOwnerMap(db: ReturnType<typeof getDb>): Promise<Map<string, UserId>> {
  const rows = await db.execute<{ old_id: string; new_id: string }>(
    sql`select old_id::text, new_id::text from snowflake_user_id_map`,
  );

  return new Map(rows.map((row) => [row.old_id, toId<UserId>(row.new_id)]));
}

/**
 * INFO: `null` for a key that has already been moved — its owner segment is a
 * snowflake rather than a uuid — and for anything that does not look like one of
 * ours at all.
 */
function parseKey(key: string): Nullable<KeyParts> {
  const [scope, owner, object, ...rest] = key.split("/");

  if (rest.length > 0 || !scope || !owner || !object) {
    return null;
  }

  if (SNOWFLAKE_SEGMENT.test(owner)) {
    return null;
  }

  return { scope: scope as StorageScope, owner, object };
}

async function copyThumbIfPresent(sourceKey: string, destinationKey: string): Promise<void> {
  const thumbSource = toThumbKey(sourceKey);

  if (!(await headObject(thumbSource))) {
    return;
  }

  await copyObject(thumbSource, toThumbKey(destinationKey));
}

void main();
