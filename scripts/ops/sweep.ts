import { getDb, media, storageReservations } from "@/shared/db";
import { AN_HOUR, A_SECOND } from "@/shared/lib";
import { deleteObjects, getBucket, getR2, toThumbKey } from "@/shared/storage";
import { ListObjectsV2Command, type ListObjectsV2CommandOutput } from "@aws-sdk/client-s3";
import { isNull, or, sql } from "drizzle-orm";
import { formatBytes, notifyOps } from "./notify";

/**
 * REQUIREMENTS.md § 9., § 12.4. Audits the bucket against the database and deletes what no
 * row can name.
 *
 * INFO: An audit, not a collection round. No object may be written before the row that
 * claims it (§ 9.), so **zero is the normal result** and a non-zero count is a bug report
 * naming a writer that uploaded before it registered. The delete is the remedy, not the
 * purpose.
 */

/**
 * WARN: A whitelist, never a blacklist. Every key either app writes is
 * `{scope}/{ownerId}/{snowflake}`, so anything outside these four — `backups/` above all —
 * is never listed here and therefore can never be deleted by this run.
 */
const MEDIA_PREFIXES = ["chat", "avatar", "emoticon", "background"] as const;

/**
 * WARN: One hour, and it MUST match `SPENT_CLAIM_RETENTION` in `shared/storage/reclaim.ts`.
 * A claim dropped sooner than this audit protects an object for reports that object as an
 * orphan; the two move together or not at all.
 */
const MIN_AGE = AN_HOUR;

const DEFAULT_MAX_DELETE_RATIO = 0.5;

/**
 * WARN: The second safety net, for a keep set that is short rather than empty. A bug in the
 * reservation path answers exactly like a bucket full of garbage — and a healthy audit finds
 * nothing at all, so anything past this share of the bucket means the keep set is wrong
 * rather than that the bucket is.
 *
 * WARN: An unparseable value REFUSES to run rather than falling back. `Number("half")` is
 * `NaN`, every `ratio > NaN` is false, and the net would be silently off — a typo in a
 * repository variable would quietly license deleting the whole bucket. A safety limit that
 * cannot be read is the one thing that must not degrade to permissive.
 */
function readMaxDeleteRatio(): number {
  const raw = process.env.ORPHAN_MAX_DELETE_RATIO?.trim();

  if (!raw) {
    return DEFAULT_MAX_DELETE_RATIO;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`ORPHAN_MAX_DELETE_RATIO must be a number in (0, 1] — got "${raw}"`);
  }

  return value;
}

type BucketObject = {
  key: string;
  sizeBytes: number;
  lastModified: number;
};

/**
 * Every key a row can name — the registered key AND its derived thumbnail.
 *
 * WARN: `deleted_at` does NOT exclude a row; `r2_purged_at` does. A soft-deleted row still
 * holding its objects is WAITING for the reclaim, which is the one pass allowed to delete
 * them, and sweeping it here would race that pass into stamping rows whose bytes had gone.
 *
 * WARN: `storage_reservations` is the other half and cannot be dropped. A claim names a key
 * BEFORE the object exists, so every in-flight upload lives only there — without it this
 * deletes uploads that are still being written.
 *
 * WARN: A RECENTLY purged row is kept too. The listing is read first, so an object the
 * reclaim removes and stamps between the two reads is in the listing and out of the keep
 * set — reported as a writer bug when it is nothing of the kind. One `MIN_AGE` is the
 * window: anything stamped longer ago has had a whole pass to leave the bucket.
 */
async function fetchRegisteredKeys(): Promise<Set<string>> {
  const stillProtected = sql`now() - make_interval(secs => ${MIN_AGE / A_SECOND}::double precision)`;
  const db = getDb();

  const [mediaRows, claimRows] = await Promise.all([
    db
      .select({ r2Key: media.r2Key })
      .from(media)
      .where(or(isNull(media.r2PurgedAt), sql`${media.r2PurgedAt} > ${stillProtected}`)),
    db
      .select({ r2Key: storageReservations.r2Key })
      .from(storageReservations)
      .where(
        or(
          isNull(storageReservations.r2PurgedAt),
          sql`${storageReservations.r2PurgedAt} > ${stillProtected}`,
        ),
      ),
  ]);

  const keys = new Set<string>();

  for (const { r2Key } of [...mediaRows, ...claimRows]) {
    keys.add(r2Key);
    keys.add(toThumbKey(r2Key));
  }

  return keys;
}

/** Every object under the four media prefixes. Throws rather than reporting a short listing as a clean bucket. */
async function listMediaObjects(): Promise<BucketObject[]> {
  const objects: BucketObject[] = [];

  for (const prefix of MEDIA_PREFIXES) {
    let continuationToken: string | undefined = undefined;

    do {
      const page: ListObjectsV2CommandOutput = await getR2().send(
        new ListObjectsV2Command({
          Bucket: getBucket(),
          Prefix: `${prefix}/`,
          ContinuationToken: continuationToken,
        }),
      );

      for (const object of page.Contents ?? []) {
        if (object.Key === undefined) {
          continue;
        }

        objects.push({
          key: object.Key,
          sizeBytes: object.Size ?? 0,
          // INFO: A `Date` from the SDK, so there is no timezone to pin — the CLI's listing prints a local-zone stamp with no marker and needs one.
          lastModified: (object.LastModified ?? new Date(0)).getTime(),
        });
      }

      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  return objects;
}

/**
 * The floor under the whole sweep. Everything here decides what to delete by SUBTRACTING
 * the database from the bucket, so a database that answers with less than it should makes
 * the bucket itself look like garbage.
 *
 * WARN: An empty keep set is the case that matters. A query that connects fine and returns
 * nothing is indistinguishable from "nothing is registered" — a restored-but-unloaded
 * database, a replica, a fresh migration or a local URL all produce it, and without this
 * one run erases every object in the bucket irreversibly.
 */
function checkSafety(scanned: number, orphans: number, keepSetSize: number): string | null {
  if (scanned === 0) {
    return null;
  }
  if (keepSetSize === 0) {
    return "media and storage_reservations returned no rows — refusing to treat the entire bucket as orphaned";
  }
  if (orphans === 0) {
    return null;
  }

  const ratio = orphans / scanned;

  const limit = readMaxDeleteRatio();

  if (ratio > limit) {
    return `${orphans}/${scanned} objects (${(ratio * 100).toFixed(1)}%) look orphaned, above ORPHAN_MAX_DELETE_RATIO=${limit}`;
  }

  return null;
}

async function main() {
  const isDryRun = process.env.SWEEP_DRY_RUN?.trim().toLowerCase() === "true";
  const isNotifyOnClean = process.env.SWEEP_NOTIFY?.trim().toLowerCase() === "true";

  // WARN: Read before any work, though `checkSafety` reads it again where it is used. That
  // call is reached only once something looks orphaned, so a typo'd limit would otherwise
  // sit unnoticed through every healthy run and surface on the one day it has to hold.
  readMaxDeleteRatio();

  // WARN: The bucket is read BEFORE the database, never after. A row written between the two reads then lands in the keep set, where a listing taken second would have shown its object with no row to hold it.
  const objects = await listMediaObjects();
  const registered = await fetchRegisteredKeys();

  const now = Date.now();
  const orphans = objects.filter(
    (object) => !registered.has(object.key) && now - object.lastModified >= MIN_AGE,
  );
  const reclaimable = orphans.reduce((total, object) => total + object.sizeBytes, 0);
  const blocked = checkSafety(objects.length, orphans.length, registered.size);

  console.log(
    `[sweep] scanned ${objects.length}, orphans ${orphans.length} (${formatBytes(reclaimable)})`,
  );

  if (blocked) {
    console.error(`[sweep] refusing to delete: ${blocked}`);
    await notifyOps("고아 파일 감사 중단", `안전장치 작동 · ${blocked}`);

    process.exitCode = 1;

    return;
  }

  if (orphans.length === 0) {
    // INFO: § 12.4. Zero is the normal result of a daily run nobody is waiting on, so the schedule says nothing; a hand-started run has a presser waiting and says 고아 파일 없음.
    if (isNotifyOnClean) {
      await notifyOps("고아 파일 감사 정상", "고아 파일 없음");
    }

    return;
  }

  if (isDryRun) {
    await notifyOps(
      "고아 파일 발견",
      `업로드 순서 위반 ${orphans.length}개 · ${formatBytes(reclaimable)} 확보 가능`,
    );

    return;
  }

  const confirmed = new Set(await deleteObjects(orphans.map((object) => object.key)));
  // INFO: Re-summed over what R2 confirmed rather than kept from the target list, so a partial sweep cannot claim space it did not reclaim.
  const reclaimed = orphans
    .filter((object) => confirmed.has(object.key))
    .reduce((total, object) => total + object.sizeBytes, 0);
  const missed = orphans.length - confirmed.size;

  console.log(`[sweep] deleted ${confirmed.size}/${orphans.length}`);

  // WARN: A run that found N and deleted none is a failure — "일부 삭제 · 0/N" would read as partial progress that never happened.
  if (confirmed.size === 0) {
    await notifyOps("고아 파일 정리 실패", `발견 ${orphans.length}개 중 0개 삭제됨`);

    process.exitCode = 1;

    return;
  }

  await notifyOps(
    "고아 파일 발견",
    missed > 0
      ? `업로드 순서 위반 ${orphans.length}개 · ${confirmed.size}개 삭제 · ${formatBytes(reclaimed)} 확보 · ${missed}개 실패`
      : `업로드 순서 위반 ${orphans.length}개 삭제 · ${formatBytes(reclaimed)} 확보`,
  );
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  async (error: unknown) => {
    console.error("[sweep] failed", error);
    await notifyOps("고아 파일 감사 실패", error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
