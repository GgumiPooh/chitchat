import { ensureEnv } from "@/shared/config";
import { A_DAY, type Nullable } from "@/shared/lib";
import { getBucket, getR2, listBackups, type BackupObject } from "@/shared/storage";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { spawn } from "node:child_process";
import { formatBytes, notifyOps } from "./notify";

/**
 * REQUIREMENTS.md § 12.4. Dumps Postgres straight into R2, on a schedule.
 *
 * INFO: `pg_dump` streams into the upload rather than through a file, so a dump larger
 * than the runner's disk is still only bytes in flight.
 */

/**
 * How many UTC days with at least one dump `backups/` keeps. Once an eleventh day holds
 * one, every dump of the oldest day goes at the end of the run.
 *
 * INFO: § 12.4. Counted in days rather than dumps, so a hand-started 백업 생성 does not push a day of history out — the same day's dumps live and go together.
 */
const MAX_BACKUP_DAYS = 10;

/**
 * WARN: Uploads land here first and are promoted only once verified. A stream that dies
 * mid-dump still leaves an object, so writing straight to `backups/` would put a truncated
 * file where the retention sweep counts it and the restore path trusts it.
 */
const STAGING_PREFIX = "backups/tmp/";

const BACKUPS_PREFIX = "backups/";

/**
 * WARN: A **direct** connection, never a pooled one. `pg_dump` against pgBouncer exits 0
 * having written nothing, and that dump is worthless — which is the failure the size check
 * below exists to catch when this is got wrong anyway.
 */
function readDatabaseUrl(): string {
  return process.env.DATABASE_URL_UNPOOLED?.trim() || ensureEnv("DATABASE_URL");
}

/**
 * Percent-decodes one URL component, answering it unchanged when it is not valid encoding.
 *
 * WARN: `decodeURIComponent` throws `URIError` on a lone `%`, which a password written into
 * the connection string unencoded legitimately contains — and a backup that dies parsing its
 * own credentials before it reaches the database is a worse answer than one that tries them
 * as written. libpq gets the raw form and says whether it works.
 */
function decodeComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function toDumpName(databaseUrl: string): string {
  const database = new URL(databaseUrl).pathname.replace(/^\//, "") || "jandh";
  const stamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "-");

  return `${database}_${stamp}.dump`;
}

/**
 * Streams `pg_dump` into R2. The size is verified separately, by `readStoredSize`.
 *
 * WARN: The exit code is awaited alongside the upload, and a non-zero one fails the run
 * even if the upload resolved. `pg_dump` writes a valid prefix before it discovers it
 * cannot continue, so an upload that "succeeded" says nothing on its own.
 *
 * WARN: The connection is handed over as libpq's own `PG*` variables rather than as a URL
 * argument, so the password never enters `argv` where `ps` would show it. It is also why
 * there is no shell here at all — `spawn` without one cannot be talked into interpreting
 * a `$` or a backtick that a generated password legitimately contains.
 */
async function streamDump(databaseUrl: string, key: string): Promise<void> {
  const url = new URL(databaseUrl);
  const dump = spawn(
    "pg_dump",
    ["-F", "c", "--clean", "--no-owner", "--no-privileges", "--no-acl"],
    {
      env: {
        ...process.env,
        PGHOST: url.hostname,
        PGPORT: url.port || "5432",
        PGUSER: decodeComponent(url.username),
        PGPASSWORD: decodeComponent(url.password),
        PGDATABASE: decodeComponent(url.pathname.replace(/^\//, "")),
        // INFO: The tunnel already carries the hop, and a runner-local endpoint has no certificate to verify.
        PGSSLMODE: url.searchParams.get("sslmode") ?? "prefer",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stderr = "";
  dump.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const exited = new Promise<void>((resolve, reject) => {
    dump.on("error", reject);
    dump.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`pg_dump exited ${code}${stderr.trim() ? `: ${stderr.trim()}` : ""}`)),
    );
  });

  const upload = new Upload({
    client: getR2(),
    params: { Bucket: getBucket(), Key: key, Body: dump.stdout },
  });
  const uploaded = upload.done();

  /**
   * WARN: Both settle before this returns or throws, and the upload is ABORTED on the way
   * out. `Promise.all` rejects the instant `pg_dump` does, while a multipart upload of the
   * valid prefix it already wrote is still in flight — so the caller's cleanup would delete
   * a key R2 does not hold yet (a `DeleteObject` on a missing key succeeds silently) and the
   * truncated dump would land afterwards, into a staging prefix nothing ever reads again:
   * `listBackups` hides it behind `Delimiter` and the orphan sweep whitelists only the four
   * media prefixes. An abandoned multipart upload also keeps its parts, and its bill.
   */
  try {
    await Promise.all([uploaded, exited]);
  } catch (error) {
    dump.kill();
    await upload.abort().catch(() => {});
    // INFO: Settled rather than left dangling, so its rejection cannot surface as an unhandled one after this throws.
    await uploaded.catch(() => {});

    throw error;
  }
}

/**
 * The size R2 stores at `key`, `0` when it holds nothing there, or `null` when R2 could not
 * be asked.
 *
 * WARN: The last two are NOT the same answer and the caller must not collapse them. A key
 * that is not there is a dump `pg_dump` never wrote; a throttle or a timeout is no verdict
 * on the dump at all, and reading it as "0 bytes" throws away a multi-gigabyte upload that
 * had already succeeded.
 */
async function readStoredSize(key: string): Promise<Nullable<number>> {
  try {
    const head = await getR2().send(new HeadObjectCommand({ Bucket: getBucket(), Key: key }));

    return head.ContentLength ?? 0;
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404) {
      // INFO: Logged apart from a stored-but-empty object, which reaches the caller as the same 0. The two have different causes — nothing was written, against the bucket not holding what was — and only this line separates them for whoever reads the run.
      console.error(`[backup] R2 does not hold ${key} at all`);

      return 0;
    }

    console.error(`[backup] could not read the size of ${key}`, error);

    return null;
  }
}

/**
 * How long a staged object survives before a later run reclaims it.
 *
 * WARN: Far longer than any dump takes, because the objects this collects are the ones a
 * failed run deliberately LEFT for a person to look at. It is a floor under an inspection
 * window, not a timeout on the upload.
 */
const STALE_STAGING_AGE = 7 * A_DAY;

/**
 * Drops staged objects old enough that no run could still be writing them.
 *
 * WARN: Age-bounded, and never a recursive wipe of the prefix. `readStoredSize` answering
 * `null` leaves this run's object behind on purpose and nothing else ever removes it —
 * `listBackups` hides the prefix behind `Delimiter` and the orphan sweep whitelists only
 * the four media prefixes — so without this a run of transient R2 failures bills for
 * multi-gigabyte dumps forever, invisible on the 서버 관리 screen.
 *
 * INFO: Never throws. This is housekeeping at the end of a backup that already succeeded,
 * and a bucket that refuses it must not turn that into a failure.
 */
async function sweepStaleStaging(): Promise<number> {
  const staleBefore = Date.now() - STALE_STAGING_AGE;
  let dropped = 0;

  try {
    const page = await getR2().send(
      new ListObjectsV2Command({ Bucket: getBucket(), Prefix: STAGING_PREFIX }),
    );

    for (const object of page.Contents ?? []) {
      if (
        object.Key === undefined ||
        (object.LastModified?.getTime() ?? Date.now()) >= staleBefore
      ) {
        continue;
      }

      console.warn(`[backup] dropping a stale staged dump: ${object.Key}`);
      await getR2().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: object.Key }));
      dropped += 1;
    }
  } catch (error) {
    console.error("[backup] could not sweep the staging prefix", error);
  }

  return dropped;
}

/** Drops this run's staged object. Never throws — the failure that got here is the one worth reporting. */
async function removeStaged(key: string): Promise<void> {
  try {
    await getR2().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
  } catch (error) {
    console.error(`[backup] could not remove ${key}`, error);
  }
}

/**
 * The UTC calendar day a dump was taken on, read from the stamp in its name.
 *
 * INFO: The name and not `LastModified`, which is the moment of the promoting copy rather than of the dump; a name without a stamp falls back to it.
 */
function toBackupDay(backup: BackupObject): string {
  return backup.filename.match(/_(\d{4}-\d{2}-\d{2})T/)?.[1] ?? backup.lastModified.slice(0, 10);
}

/**
 * Deletes every dump of the days past `MAX_BACKUP_DAYS` and answers the ones that actually went.
 *
 * WARN: Only confirmed deletions are counted. Reporting a trim that failed would tell the
 * banner the bucket is back under its limit while it quietly keeps growing.
 */
async function trimOldBackups(): Promise<string[]> {
  const backups = await listBackups();
  const days = [...new Set(backups.map(toBackupDay))].sort();
  const expiredDays = new Set(days.slice(0, Math.max(0, days.length - MAX_BACKUP_DAYS)));
  const dropped: string[] = [];

  for (const backup of backups) {
    if (!expiredDays.has(toBackupDay(backup))) {
      continue;
    }

    try {
      await getR2().send(
        new DeleteObjectCommand({
          Bucket: getBucket(),
          Key: `${BACKUPS_PREFIX}${backup.filename}`,
        }),
      );
      dropped.push(backup.filename);
    } catch (error) {
      console.error(`[backup] could not drop ${backup.filename}`, error);
    }
  }

  return dropped;
}

async function main() {
  const databaseUrl = readDatabaseUrl();
  const filename = toDumpName(databaseUrl);
  const stagedKey = `${STAGING_PREFIX}${filename}`;
  const finalKey = `${BACKUPS_PREFIX}${filename}`;

  console.log(`[backup] dumping to ${stagedKey}`);

  try {
    await streamDump(databaseUrl, stagedKey);
  } catch (error) {
    await removeStaged(stagedKey);

    throw error;
  }

  const sizeBytes = await readStoredSize(stagedKey);

  /**
   * WARN: `null` is "R2 could not be asked", which is NOT a verdict on the dump — so the
   * staged object is LEFT WHERE IT IS rather than deleted. The upload may well have been
   * good, and a throttle on the size check is no reason to throw away a dump that took
   * minutes to stream. It stays under `backups/tmp/`, out of `listBackups` and out of the
   * retention count, for a person to look at.
   */
  if (sizeBytes === null) {
    throw new Error(
      `could not verify the staged dump — ${stagedKey} was left in place for inspection`,
    );
  }

  // WARN: A crashed `pg_dump` is caught above; a SILENT one is caught here. A pooled connection exits 0 having written nothing, and only the stored size tells the two apart.
  if (sizeBytes === 0) {
    await removeStaged(stagedKey);

    throw new Error(
      `the staged dump is empty or absent — check that DATABASE_URL points at a direct connection, and the log above for whether R2 held ${stagedKey} at all`,
    );
  }

  // INFO: Copy then drop, because S3 has no move. The promotion is what makes the dump visible to `listBackups`, so it happens only after the size check above.
  await getR2().send(
    new CopyObjectCommand({
      Bucket: getBucket(),
      CopySource: `${getBucket()}/${stagedKey}`,
      Key: finalKey,
    }),
  );
  await removeStaged(stagedKey);

  const dropped = await trimOldBackups();
  await sweepStaleStaging();

  console.log(`[backup] ${filename} (${formatBytes(sizeBytes)}), trimmed ${dropped.length}`);

  await notifyOps(
    "백업 성공",
    `${filename} (${formatBytes(sizeBytes)})${dropped.length > 0 ? ` · 오래된 백업 ${dropped.length}개 정리` : ""}`,
  );
}

main().then(
  () => process.exit(0),
  async (error: unknown) => {
    console.error("[backup] failed", error);
    await notifyOps("백업 실패", error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
