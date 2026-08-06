import "server-only";

import { MEDIA_CACHE_MAX_AGE, MEDIA_URL_EXPIRY, UPLOAD_URL_EXPIRY } from "@/shared/config";
import { A_SECOND, safelyGetAsync, safelyRunAsync, type Optional } from "@/shared/lib";
import {
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
 * WARN: `cacheControl` is the opposite of advisory. It is signed as a header, so a
 * caller that passes it MUST send the identical `Cache-Control` on the PUT or R2
 * answers 403 for the whole upload.
 */
export function presignUpload(
  key: string,
  contentType: string,
  cacheControl?: string,
): Promise<string> {
  return getSignedUrl(
    getR2(),
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
    { expiresIn: UPLOAD_URL_EXPIRY / A_SECOND },
  );
}

export type PresignDownloadOptions = {
  asAttachment?: boolean;
  /** INFO: Defaults to § 9.'s window; `EMOTICON_URL_EXPIRY` is the long one, and REQUIREMENTS.md § 13.3. is why only emoticons may take it. */
  expiry?: number;
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
 */
export function presignDownload(
  key: string,
  { asAttachment, expiry = MEDIA_URL_EXPIRY }: PresignDownloadOptions = {},
): Promise<string> {
  return getSignedUrl(
    getR2(),
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
      ResponseContentDisposition: asAttachment ? "attachment" : undefined,
    }),
    { expiresIn: expiry / A_SECOND },
  );
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
