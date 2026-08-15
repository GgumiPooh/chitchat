import { ensureEnv } from "@/shared/config";
import { getBucket, getR2, listBackups } from "@/shared/storage";
import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { spawn } from "node:child_process";
import { formatBytes, notifyOps } from "./notify";

/**
 * REQUIREMENTS.md § 12.4. Dumps Postgres straight into R2, on a schedule.
 *
 * INFO: `pg_dump` streams into the upload rather than through a file, so a dump larger
 * than the runner's disk is still only bytes in flight.
 */

/** How many dumps `backups/` keeps. The oldest beyond this go at the end of every run. */
const MAX_BACKUPS = 10;

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
 * Streams `pg_dump` into R2 and answers the object's size.
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
async function streamDump(databaseUrl: string, key: string): Promise<number> {
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

  const head = await getR2().send(new HeadObjectCommand({ Bucket: getBucket(), Key: key }));

  return head.ContentLength ?? 0;
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
 * Deletes the oldest dumps past `MAX_BACKUPS` and answers the ones that actually went.
 *
 * WARN: Only confirmed deletions are counted. Reporting a trim that failed would tell the
 * banner the bucket is back under its limit while it quietly keeps growing.
 */
async function trimOldBackups(): Promise<string[]> {
  const backups = await listBackups();

  if (backups.length <= MAX_BACKUPS) {
    return [];
  }

  const dropped: string[] = [];

  // INFO: `listBackups` answers newest first, so the tail is the oldest.
  for (const backup of backups.slice(MAX_BACKUPS)) {
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

  let sizeBytes: number;

  try {
    sizeBytes = await streamDump(databaseUrl, stagedKey);
  } catch (error) {
    await removeStaged(stagedKey);

    throw error;
  }

  // WARN: `pipefail` catches a crashed `pg_dump`, not a silent one. A pooled connection exits 0 having written nothing, and only the stored size tells the two apart.
  if (sizeBytes === 0) {
    await removeStaged(stagedKey);

    throw new Error(
      "pg_dump exited 0 but wrote 0 bytes — check that DATABASE_URL points at a direct connection",
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
