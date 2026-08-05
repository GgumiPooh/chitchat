import { getCurrentUser } from "@/shared/auth";
import {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_VIDEO_MIMES,
  MEDIA_UPLOAD_SCOPES,
  THUMBNAIL_MIME,
  maxSizeForMime,
} from "@/shared/config";
import { buildStorageKey, presignUpload, toThumbKey } from "@/shared/storage";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  mime: z.enum([...ALLOWED_IMAGE_MIMES, ...ALLOWED_VIDEO_MIMES]),
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
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { mime, size, scope } = body.data;

  // INFO: REQUIREMENTS.md § 14. A courtesy rejection on the client's own claim. R2 enforces neither the type nor the size of a presigned PUT, so `registerMedia` re-checks both against what actually landed.
  if (size > maxSizeForMime(mime)) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const r2Key = buildStorageKey(scope, user.id);
  const [uploadUrl, thumbnailUploadUrl] = await Promise.all([
    presignUpload(r2Key, mime),
    presignUpload(toThumbKey(r2Key), THUMBNAIL_MIME),
  ]);

  return NextResponse.json({ r2Key, uploadUrl, thumbnailUploadUrl, thumbnailMime: THUMBNAIL_MIME });
}
