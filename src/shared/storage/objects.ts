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
 */
export function presignUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    getR2(),
    new PutObjectCommand({ Bucket: getBucket(), Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_EXPIRY / A_SECOND },
  );
}

/**
 * A short-lived read URL. The bucket stays private, so this is the only way out of it.
 *
 * WARN: `asAttachment` has to be signed into the URL. The route answers a 302 to
 * R2, and an `<a download>` is dropped the moment the navigation resolves
 * cross-origin — only R2's own `Content-Disposition` still saves the file.
 */
export function presignDownload(key: string, asAttachment = false): Promise<string> {
  return getSignedUrl(
    getR2(),
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
      ResponseContentDisposition: asAttachment ? "attachment" : undefined,
    }),
    { expiresIn: MEDIA_URL_EXPIRY / A_SECOND },
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
 * pointing at them (REQUIREMENTS.md § 13.4.).
 *
 * WARN: Not the same cleanup as `deleteObjects`. An asset route answers a 302 that
 * the browser caches for `MEDIA_CACHE_MAX_AGE` (§ 9.), so a participant who loaded
 * the pre-edit asset replays that redirect at a key deleting it immediately would
 * have removed — a broken image rather than a stale one. Deleting a row's object is
 * unaffected, because the row it was rendered from is gone too.
 *
 * WARN: In-process, so a restart inside the window leaks the objects. That is the
 * accepted cost: they are a handful of edited emoticon images, they are unreachable
 * (§ 13.3.), and the alternative is a durable queue for a two-person app.
 */
export function deleteObjectsAfterCacheWindow(keys: string[]): void {
  if (keys.length === 0) {
    return;
  }

  // INFO: Unreferenced, so the timer never keeps the process alive on its own.
  setTimeout(() => void deleteObjects(keys), MEDIA_CACHE_MAX_AGE).unref?.();
}
