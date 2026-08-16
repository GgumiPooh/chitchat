import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_VIDEO_MIMES,
  isFileMime,
  maxSizeForMime,
  MEDIA_UPLOAD_SCOPES,
  THUMBNAIL_MIME,
} from "@/shared/config";
import {
  buildStorageKey,
  presignUpload,
  reclaimExpiredStorage,
  reserveKey,
  toThumbKey,
} from "@/shared/storage";
import { after, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  // INFO: REQUIREMENTS.md § 9.1. The media allow-list, or anything else that is shaped like a mime — the second branch is a file attachment, and `registerMedia` is still where the stored type is checked.
  mime: z.union([
    z.enum([...ALLOWED_IMAGE_MIMES, ...ALLOWED_VIDEO_MIMES]),
    z.string().refine(isFileMime),
  ]),
  size: z.number().int().positive(),
  // INFO: REQUIREMENTS.md § 12. Only the profile editor asks for anything else; every other caller predates the scope and keeps the default.
  scope: z.enum(MEDIA_UPLOAD_SCOPES).default("chat"),
});

/**
 * Issues the pair of presigned PUTs one attachment needs (REQUIREMENTS.md § 9.):
 * the object itself and its `_thumb` sibling.
 *
 * WARN: The key is built here from the caller's own id and never read off the
 * request — a signature the browser could aim would let it overwrite any object
 * in the bucket.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  const { mime, size, scope } = body.data;
  // INFO: REQUIREMENTS.md § 9.1. A file attachment is one PUT, not a pair — there is no frame to render a thumbnail from, so signing a second URL would only invite an object nothing ever reads.
  const isFile = isFileMime(mime);

  // WARN: § 9.1. `registerMedia` refuses a file outside the `chat` scope, and refusing it here too is what keeps that from being a 422 arriving *after* the bytes landed — the ticket is live for `UPLOAD_URL_EXPIRY`, so a 500MB archive would sit in `background/` with no row able to name it and nothing to clean it up.
  if (isFile && scope !== "chat") {
    return apiError("invalid_request");
  }

  // INFO: REQUIREMENTS.md § 14. A courtesy rejection on the client's own claim. R2 enforces neither the type nor the size of a presigned PUT, so `registerMedia` re-checks both against what actually landed.
  if (size > maxSizeForMime(mime)) {
    return apiError("too_large");
  }

  const r2Key = buildStorageKey(scope, user.id);

  // WARN: § 9. The claim is written before the ticket is signed, never after. A signature handed out first is one the browser may redeem while this request is still in flight, and the object it lands would be one no row ever named — which is the whole of what the reservation makes impossible.
  await reserveKey(r2Key, user.id);

  const [uploadUrl, thumbnailUploadUrl] = await Promise.all([
    presignUpload(r2Key, mime),
    isFile ? null : presignUpload(toThumbKey(r2Key), THUMBNAIL_MIME),
  ]);

  // WARN: In `after`, and it may never move onto the response path — the sender of a photo would be waiting on somebody else's deleted bytes, against a bucket this request needs nothing from.
  // INFO: § 9. An upload is the trigger because it is the one request guaranteed to precede the objects this cleans up; the ops service (§ 12.4.) keeps the interval, and `reclaimExpiredStorage` explains what that division costs.
  after(() => reclaimExpiredStorage());

  return NextResponse.json({
    r2Key,
    uploadUrl,
    thumbnailUploadUrl,
    thumbnailMime: isFile ? null : THUMBNAIL_MIME,
  });
}
