import { emoticonItems, getDb, media } from "@/shared/db";
import { deleteObjects, listObjectKeys, toThumbKey } from "@/shared/storage";

/**
 * REQUIREMENTS.md § 9. Deletes the objects left behind by
 * `scripts/migrate-r2-keys.ts`, which copied every stored object onto a snowflake
 * key and deliberately kept the originals.
 *
 * WARN: This is the one irreversible step of the whole id migration. Until it runs,
 * restoring the pre-migration dump is a rollback — the rows it puts back name the
 * old keys and those objects are still there. Afterwards it is data loss.
 *
 * WARN: The uuid-shaped key is **not** what authorises a delete. Every key a live
 * row names is loaded first and nothing in that set is ever deleted, whatever it
 * looks like; the shape is only how a candidate is proposed. A row added between the
 * listing and the delete is therefore safe by construction, since it can only carry
 * a key this script never proposed.
 *
 * INFO: Dry run by default. `--delete` is the only thing that removes anything.
 */
const LEGACY_KEY = /^[a-z]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//iu;

// INFO: `DeleteObjectsCommand` takes 1000 keys per call, which is also R2's limit.
const DELETE_BATCH = 1000;

async function main() {
  const isDeleting = process.argv.includes("--delete");
  const live = await loadLiveKeys();

  console.log(`${live.size} keys are named by a live row`);

  const doomed: string[] = [];
  let listed = 0;
  let protectedByDb = 0;

  for await (const page of listObjectKeys()) {
    listed += page.length;

    for (const key of page) {
      if (!LEGACY_KEY.test(key)) {
        continue;
      }

      if (live.has(key)) {
        protectedByDb += 1;

        continue;
      }

      doomed.push(key);
    }
  }

  console.log(`listed ${listed} objects, ${doomed.length} match the legacy shape`);

  if (protectedByDb > 0) {
    console.error(
      `refusing to run: ${protectedByDb} legacy-shaped keys are still named by a row — migrate-r2-keys.ts has not finished`,
    );
    process.exit(1);
  }

  if (!isDeleting) {
    console.log(doomed.slice(0, 3).join("\n"));
    console.log(`dry run — pass --delete to remove these ${doomed.length} objects`);
    process.exit(0);
  }

  for (let index = 0; index < doomed.length; index += DELETE_BATCH) {
    await deleteObjects(doomed.slice(index, index + DELETE_BATCH));
    console.log(`deleted ${Math.min(index + DELETE_BATCH, doomed.length)} / ${doomed.length}`);
  }

  console.log(`done — ${doomed.length} objects removed`);
  process.exit(0);
}

/**
 * Every key a row currently points at, plus the derived `_thumb` sibling of each
 * `media` key — that one belongs to its row (§ 9.) and is named by no column.
 */
async function loadLiveKeys(): Promise<Set<string>> {
  const db = getDb();
  const [mediaRows, itemRows] = await Promise.all([
    db.select({ r2Key: media.r2Key }).from(media),
    db.select({ r2Key: emoticonItems.r2Key, audioKey: emoticonItems.audioKey }).from(emoticonItems),
  ]);

  const keys = new Set<string>();

  mediaRows.forEach((row) => {
    keys.add(row.r2Key);
    keys.add(toThumbKey(row.r2Key));
  });

  itemRows.forEach((row) => {
    keys.add(row.r2Key);

    if (row.audioKey) {
      keys.add(row.audioKey);
    }
  });

  return keys;
}

void main();
