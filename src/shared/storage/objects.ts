import "server-only";

import { MEDIA_CACHE_MAX_AGE, MEDIA_URL_EXPIRY, UPLOAD_URL_EXPIRY } from "@/shared/config";
import {
  A_SECOND,
  safelyGetAsync,
  safelyRunAsync,
  type Maybe,
  type Nullable,
  type Optional,
} from "@/shared/lib";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getBucket, getR2 } from "./client";

export type StoredObject = {
  size: number;
  mime: string;
};

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
 * Duplicates a stored object under a second key, inside the bucket.
 *
 * INFO: REQUIREMENTS.md § 12.1. What 배경으로 설정 runs on a photo that is already
 * in the conversation. It is a server-side copy — the bytes never leave R2 — which
 * is the whole reason the feature can afford to own its object rather than point at
 * somebody else's: `discardScopedMedia` may then delete it without reaching into
 * the `chat/` scope a bubble is still rendering (§ 12.).
 *
 * WARN: Unlike `presignUpload`, this carries no `Content-Type` of its own.
 * `CopyObjectCommand` defaults to `COPY` metadata, so the destination inherits the
 * type § 14. already verified on the source — re-stating it here would be a second
 * claim about bytes this process has still never seen.
 *
 * WARN: Throws. A copy that half-lands leaves a key with no `media` row, which is
 * unreachable and costs bucket space alone (§ 9.) — but a caller that registered a
 * row for an object that is not there would render a broken image forever.
 */
export async function copyObject(sourceKey: string, destinationKey: string): Promise<void> {
  await getR2().send(
    new CopyObjectCommand({
      Bucket: getBucket(),
      // WARN: The source is `{bucket}/{key}`, and the key half must be URI-encoded. Ours are `{scope}/{uuid}/{uuid}` so nothing in them needs escaping today, but a key that ever carries one would silently copy the wrong object rather than fail.
      // WARN: Per segment with `encodeURIComponent`, never `encodeURI` over the whole key. `encodeURI` preserves the URI-reserved set by design, so it leaves `?`, `#`, `&` and `+` intact — which is precisely the silent wrong-object copy above, not a guard against it. The `split`/`join` is what keeps the `/` separators literal.
      CopySource: `${getBucket()}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`,
      Key: destinationKey,
    }),
  );
}

/**
 * INFO: Never throws. Deleting the objects is cleanup behind a row that is already
 * gone, and failing it must not fail the request that removed the row.
 */
export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  await safelyRunAsync(async () => {
    await getR2().send(
      new DeleteObjectsCommand({
        Bucket: getBucket(),
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
  });
}

/**
 * Deletes objects that a *replacement* detached, once the read path has stopped
 * pointing at them (REQUIREMENTS.md § 12.).
 *
 * WARN: For § 9.'s media window only. It waits `MEDIA_CACHE_MAX_AGE`, so an
 * emoticon — whose redirect is cached for days (§ 13.3.) — MUST NOT use it: the
 * timer would have to outlive the process by most of a week. That path deletes
 * immediately and recovers on the read side instead (§ 13.4.).
 *
 * WARN: In-process, so a restart inside the window leaks the objects. That is the
 * accepted cost: they are replaced avatars, they are unreachable once the row is
 * gone, and the alternative is a durable queue for a two-person app.
 */
export function deleteObjectsAfterCacheWindow(keys: string[]): void {
  if (keys.length === 0) {
    return;
  }

  // INFO: Unreferenced, so the timer never keeps the process alive on its own.
  setTimeout(() => void deleteObjects(keys), MEDIA_CACHE_MAX_AGE).unref?.();
}
