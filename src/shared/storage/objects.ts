import "server-only";

import { MEDIA_URL_EXPIRY, UPLOAD_URL_EXPIRY } from "@/shared/config";
import { A_SECOND, safelyGetAsync, type Maybe, type Nullable, type Optional } from "@/shared/lib";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getBucket, getR2 } from "./client";

export type StoredObject = {
  size: number;
  mime: string;
};

// INFO: S3's own cap on one `DeleteObjects` payload, and jandh-ops batches its sweep at the same figure.
const DELETE_BATCH_SIZE = 1000;

/**
 * REQUIREMENTS.md § 12.4. Where jandh-ops puts its dumps, in the bucket the app's own
 * objects live in — which is why § 9.'s sweep whitelists the four media prefixes rather
 * than blacklisting this one.
 */
const BACKUPS_PREFIX = "backups/";

/**
 * WARN: Anchored, and it bounds what the 서버 관리 screen can name. Every dump is written
 * as `{db}_{ISO}.dump`, so a name that cannot match is not a name this prefix holds.
 */
const BACKUP_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(dump|sql\.gz)$/;

/** Whether `filename` is shaped like a dump this prefix could hold. */
export function isBackupFilename(filename: string): boolean {
  return BACKUP_FILENAME_PATTERN.test(filename);
}

/** REQUIREMENTS.md § 12.4. One dump under `backups/`. */
export type BackupObject = {
  filename: string;
  sizeBytes: number;
  /** ISO 8601, from R2's own `LastModified`. */
  lastModified: string;
};

/**
 * Every dump directly under `backups/`, newest first.
 *
 * WARN: Throws when the bucket could not be listed, and does NOT fall back to an empty
 * array. "The bucket is empty" and "the bucket could not be read" draw the same screen
 * otherwise, and the second one would also report every backup as already deleted.
 *
 * INFO: `Delimiter` is what keeps jandh-ops' staging area out. That service uploads to
 * `backups/tmp/` and promotes only once it has verified the size, so a half-written dump
 * sits under a sub-prefix — which a delimited listing returns as `CommonPrefixes` and
 * never as a row here.
 */
export async function listBackups(): Promise<BackupObject[]> {
  const backups: BackupObject[] = [];
  let continuationToken: Optional<string> = undefined;

  do {
    // INFO: The output is annotated because `send` is overloaded on its command, and inferring it here would resolve through the token this loop assigns from the result.
    const page: ListObjectsV2CommandOutput = await getR2().send(
      new ListObjectsV2Command({
        Bucket: getBucket(),
        Prefix: BACKUPS_PREFIX,
        Delimiter: "/",
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of page.Contents ?? []) {
      const filename = object.Key?.slice(BACKUPS_PREFIX.length);

      if (!filename) {
        continue;
      }

      // WARN: Logged, never skipped quietly. The dumps are still named by jandh-ops while
      // this filter lives here, so a name that stops matching — an unescaped `:` out of an
      // ISO stamp is the obvious one — would empty this screen while every backup reported
      // success, and nothing would separate that from a bucket that is genuinely empty.
      if (!isBackupFilename(filename)) {
        console.warn(`[backups] ignoring an unrecognised key under ${BACKUPS_PREFIX}: ${filename}`);

        continue;
      }

      backups.push({
        filename,
        sizeBytes: object.Size ?? 0,
        lastModified: (object.LastModified ?? new Date(0)).toISOString(),
      });
    }

    // INFO: Retention keeps ten days, so the loop is for correctness rather than for a page anybody expects to see.
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return backups.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

/**
 * Deletes one dump, answering the row it removed or `null` when no such dump exists.
 *
 * WARN: The listing is what makes the second answer possible. `DeleteObject` succeeds for
 * a key that was never there, so deleting first and reporting success would tell the
 * screen it had removed a backup that some other run had already dropped.
 *
 * WARN: Throws rather than reporting, unlike `deleteObjects`. That one is cleanup behind
 * somebody else's request and may not fail it; this one IS the request.
 */
export async function deleteBackup(filename: string): Promise<Nullable<BackupObject>> {
  const existing = (await listBackups()).find((backup) => backup.filename === filename);

  if (existing === undefined) {
    return null;
  }

  await getR2().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: `${BACKUPS_PREFIX}${filename}` }),
  );

  return existing;
}

/**
 * A URL the browser may `PUT` one object to (REQUIREMENTS.md § 9.), bypassing
 * Vercel's 4.5MB request body limit.
 *
 * WARN: `contentType` is advisory, not a constraint. Verified against the live
 * bucket: R2 accepts a PUT whose `Content-Type` differs from the signed one and
 * stores the header it was sent. Neither the type nor the size is enforced at
 * upload — `headObject` at registration is the *only* place REQUIREMENTS.md § 14.
 * actually holds, which is why nothing may reference an object before that runs.
 *
 * WARN: The PUT carries `Content-Type` and nothing else. Every further header is a
 * header the browser has to be allowed to send, and the bucket's CORS
 * `AllowedHeaders` is a deploy step (REQUIREMENTS.md § 9.) — one the code must not
 * depend on. `Cache-Control` in particular belongs on `presignDownload`.
 */
export function presignUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    getR2(),
    new PutObjectCommand({ Bucket: getBucket(), Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_EXPIRY / A_SECOND },
  );
}

export type PresignDownloadOptions = {
  asAttachment?: boolean;
  /** REQUIREMENTS.md § 9.1. The name a file attachment saves under, since the key is a UUID. Ignored unless `asAttachment` is set. */
  filename?: Nullable<string>;
  /** INFO: Defaults to § 9.'s window; `EMOTICON_URL_EXPIRY` is the long one, and REQUIREMENTS.md § 13.3. is why only emoticons may take it. */
  expiry?: number;
  /** INFO: REQUIREMENTS.md § 13.3. What R2 answers the bytes with, for objects it stores no `Cache-Control` of its own for — which is all of them. */
  cacheControl?: string;
  /** INFO: REQUIREMENTS.md § 13.3. Rounds the signing time down to this grid, so every request inside one window gets the same URL back; `EMOTICON_SIGNING_BUCKET` is the only caller. */
  signingBucket?: number;
};

/**
 * A read URL. The bucket stays private, so this is the only way out of it.
 *
 * WARN: `asAttachment` has to be signed into the URL. The route answers a 302 to
 * R2, and an `<a download>` is dropped the moment the navigation resolves
 * cross-origin — only R2's own `Content-Disposition` still saves the file.
 *
 * WARN: Whatever `Cache-Control` the caller puts on that 302 MUST stay under
 * `expiry`, or the browser replays a cached redirect to a signature R2 has stopped
 * honouring (REQUIREMENTS.md § 9.).
 *
 * WARN: `cacheControl` is signed here rather than stored on the object at upload,
 * and it is the only way to set one that costs the browser nothing (§ 13.3.).
 *
 * WARN: `signingBucket` shortens the URL's life by its own size, since the signature
 * is dated to the start of the window rather than to now. Whatever `Cache-Control`
 * the caller puts on the 302 has to clear `expiry - signingBucket`, not `expiry`.
 */
export function presignDownload(
  key: string,
  {
    asAttachment,
    filename,
    expiry = MEDIA_URL_EXPIRY,
    cacheControl,
    signingBucket,
  }: PresignDownloadOptions = {},
): Promise<string> {
  return getSignedUrl(
    getR2(),
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
      ResponseContentDisposition: asAttachment ? toDisposition(filename) : undefined,
      ResponseCacheControl: cacheControl,
    }),
    { expiresIn: expiry / A_SECOND, signingDate: toBucketStart(signingBucket) },
  );
}

// INFO: REQUIREMENTS.md § 13.3. `undefined` leaves the SDK on `new Date()`, which is every caller that has not asked for a stable URL.
function toBucketStart(bucket: Maybe<number>): Optional<Date> {
  return bucket ? new Date(Math.floor(Date.now() / bucket) * bucket) : undefined;
}

/**
 * WARN: REQUIREMENTS.md § 9.1. `filename*` alone, in RFC 8187 form. A bare
 * `filename=` may carry only ASCII, and a Korean document name is exactly what this
 * exists to preserve — percent-encoding also takes the quotes and semicolons a name
 * could otherwise inject into the header out of play.
 *
 * WARN: `encodeURIComponent` is **not** an `ext-value` encoder on its own. It leaves
 * `'` `(` `)` `*` `!` `~` unescaped, and `'` is the delimiter this very form is built
 * from — so `don't panic.pdf` would parse as charset `UTF-8`, language `don`, and a
 * value missing its first characters. The second pass is what closes that.
 */
function toDisposition(filename: Maybe<string>): string {
  if (!filename) {
    return "attachment";
  }

  const encoded = encodeURIComponent(filename).replace(
    /['()*!~]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename*=UTF-8''${encoded}`;
}

/**
 * What R2 actually holds at `key`, or `undefined` when it holds nothing.
 *
 * INFO: REQUIREMENTS.md § 9. Direct-to-R2 upload means the server never sees the
 * bytes, so this is where the § 14. type and size checks happen — before a `media`
 * row exists to point at them.
 */
export async function headObject(key: string): Promise<Optional<StoredObject>> {
  const head = await safelyGetAsync(() =>
    getR2().send(new HeadObjectCommand({ Bucket: getBucket(), Key: key })),
  );

  if (!head?.ContentType || head.ContentLength === undefined) {
    return undefined;
  }

  return { size: head.ContentLength, mime: head.ContentType };
}

/**
 * What R2 holds at `key`, but only when it satisfies `isAcceptable`.
 *
 * INFO: The single gate REQUIREMENTS.md § 14. is enforced at, for chat media (§ 9.)
 * and emoticon assets (§ 13.3.) alike. Both upload straight to R2, which enforces
 * neither the signed `Content-Type` nor any size, so the caller's own claim about
 * what it uploaded is never what gets checked — this reads the stored object back.
 */
export async function headAcceptableObject(
  key: string,
  isAcceptable: (object: StoredObject) => boolean,
): Promise<Optional<StoredObject>> {
  const object = await headObject(key);

  return object && isAcceptable(object) ? object : undefined;
}

/** The bytes R2 holds at a key, and the type it holds them as. */
export type FetchedObject = {
  bytes: Uint8Array;
  mime: string;
};

/**
 * Reads an object's bytes into memory.
 *
 * INFO: The one thing a HEAD cannot answer. § 13.2.'s two image slots are decided
 * by whether the file animates, and no header says: `image/webp` and `image/gif`
 * are each legal for a single frame, and an APNG is stored as the `image/png` it
 * was uploaded as.
 *
 * WARN: The whole object, and deliberately not a prefix. A GIF's second image
 * descriptor may sit anywhere in the file, so a prefix can confirm an animation and
 * can never refuse one — and refusing is the half that matters here.
 *
 * WARN: Bounded by `maxBytes` against what R2 reports, and refused rather than
 * truncated. Everything this reads was capped on the way in (§ 14.), so anything
 * past it is not an object this was meant to read.
 */
export async function readObject(key: string, maxBytes: number): Promise<Optional<FetchedObject>> {
  const object = await safelyGetAsync(() =>
    getR2().send(new GetObjectCommand({ Bucket: getBucket(), Key: key })),
  );

  if (!object?.Body || !object.ContentType) {
    return undefined;
  }

  if (object.ContentLength !== undefined && object.ContentLength > maxBytes) {
    return undefined;
  }

  const bytes = await safelyGetAsync(() => object.Body!.transformToByteArray());

  return bytes && bytes.byteLength <= maxBytes ? { bytes, mime: object.ContentType } : undefined;
}

/**
 * Removes objects from the bucket, and answers **which of them R2 confirmed**.
 *
 * INFO: Still never throws. A failed cleanup must not fail the request that stamped
 * the row, and the caller decides what an unconfirmed key means.
 *
 * WARN: It reports rather than swallows, and `purgeNow` is why. The swallow was right
 * while the row was already gone and the § 12.4. sweep was the net; now the stamp is
 * what retires the work, so a silently failed delete would stamp a row whose object is
 * still there — an orphan produced by the one function meant to prevent them.
 *
 * WARN: Confirmations, never the complement of the failures. Anything R2 did not name
 * is left unstamped and retried, which costs one no-op delete; inferring success from
 * a missing error costs an orphan nothing looks for again.
 *
 * WARN: A `DeleteObjects` call fails **per key**, not as a whole — R2 answers `Deleted`
 * and `Errors` side by side and a partial failure is still a 200.
 *
 * WARN: `Quiet` is left off deliberately. In quiet mode R2 omits `Deleted` entirely,
 * which this would read as every key having failed.
 */
export async function deleteObjects(keys: string[]): Promise<string[]> {
  const confirmed: string[] = [];

  // WARN: `DeleteObjects` refuses a payload over `DELETE_BATCH_SIZE` outright, and a refusal here confirms nothing — which would stamp nothing and retry the same oversized call forever. A pack delete reaches that size on a § 13.7. import.
  for (let index = 0; index < keys.length; index += DELETE_BATCH_SIZE) {
    const batch = keys.slice(index, index + DELETE_BATCH_SIZE);

    const result = await safelyGetAsync(() =>
      getR2().send(
        new DeleteObjectsCommand({
          Bucket: getBucket(),
          Delete: { Objects: batch.map((Key) => ({ Key })) },
        }),
      ),
    );

    // INFO: A refused batch confirms none of its own keys and leaves the rest of the run to carry on, so one bad batch costs a retry rather than the whole purge.
    confirmed.push(
      ...(result?.Deleted ?? []).flatMap(({ Key }) => (Key === undefined ? [] : [Key])),
    );
  }

  return confirmed;
}
