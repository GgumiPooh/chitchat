import { canReadMedia, getMediaRow, toVariantKey } from "@/entities/media";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import {
  MEDIA_ASSET_CACHE_CONTROL,
  MEDIA_CACHE_MAX_AGE,
  MEDIA_SIGNING_BUCKET,
  isImageMime,
  isVideoMime,
  maxSizeForScope,
  snowflakeSchema,
} from "@/shared/config";
import type { Media } from "@/shared/db";
import type { MediaId } from "@/shared/lib";
import { A_SECOND } from "@/shared/lib";
import { presignDownload, readObject } from "@/shared/storage";
import { NextResponse } from "next/server";
import { z } from "zod";

const paramsSchema = z.object({ id: snowflakeSchema<MediaId>() });

const querySchema = z.object({
  // INFO: REQUIREMENTS.md § 12.1. `edit` is the original again, streamed instead of redirected — see `streamForEditing`.
  variant: z.enum(["thumb", "original", "edit"]).default("thumb"),
  // INFO: `toMediaDownloadUrl` sets it. Only R2's own `Content-Disposition` survives the 302, so this is what "원본 저장" rides on.
  download: z.literal("1").optional(),
});

/**
 * REQUIREMENTS.md § 9. Redirects to a presigned GET after validating the session.
 * Being same-origin is what makes this work from a bare `<img src>` — the browser
 * attaches the session cookie without any fetch wrapper.
 *
 * WARN: The UUID is not the access control. Every read revalidates the session and
 * then asks `canReadMedia` whether this user may see this particular object.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const params = paramsSchema.safeParse(await context.params);
  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!params.success || !query.success) {
    return apiError("invalid_request");
  }

  const row = await getMediaRow(params.data.id);

  // INFO: The same answer for an object that does not exist and one this user may not read — a distinguishable 403 would confirm the id.
  if (!row || !(await canReadMedia(row, user.id))) {
    return apiError("not_found");
  }

  if (query.data.variant === "edit") {
    return streamForEditing(row);
  }

  // WARN: REQUIREMENTS.md § 9.1. A file attachment is served as an attachment whatever the query says, and never as a thumb variant it has no object for. Nothing in the app renders one inline, so the only way this URL is ever opened is to save it.
  const isFile = row.filename !== null;
  // WARN: REQUIREMENTS.md § 9.3. A voice message has no `_thumb` sibling either — one PUT, like a file — so it is forced off the default variant for the same reason. It is **not** forced to an attachment: unlike a file it is meant to play inline, and `variant` defaulting to `thumb` is what would otherwise sign a URL for an object R2 never received.
  const hasNoThumb = isFile || row.waveformPeaks !== null;
  // WARN: § 9. `cacheControl` and `signingBucket` are a pair and neither works alone — the header gives the bytes a lifetime, the grid gives them a URL stable enough to be found under it again.
  const url = await presignDownload(
    toVariantKey(row, hasNoThumb ? "original" : query.data.variant),
    {
      asAttachment: isFile || query.data.download === "1",
      filename: row.filename,
      cacheControl: MEDIA_ASSET_CACHE_CONTROL,
      signingBucket: MEDIA_SIGNING_BUCKET,
    },
  );

  return NextResponse.redirect(url, {
    status: 302,
    // WARN: REQUIREMENTS.md § 9. Shorter than `MEDIA_URL_EXPIRY - MEDIA_SIGNING_BUCKET` and not merely than the expiry — the URL above is dated to the start of its window — or the browser replays a cached redirect to a signature R2 has stopped honouring.
    headers: { "Cache-Control": `private, max-age=${MEDIA_CACHE_MAX_AGE / A_SECOND}` },
  });
}

/**
 * REQUIREMENTS.md § 12.1. The original as bytes on this origin, so 사진 사용하기 can
 * crop it in a canvas.
 *
 * WARN: A stream and not the 302 above, and `CLAUDE.md § 5.3.` is the argument: an R2
 * response is cross-origin, so a canvas drawn from it is tainted, and fetching it in
 * CORS mode downloads the photo a second time under a separate cache entry, answers
 * differently cold and warm, and fails outright under a bucket policy that does not
 * name the origin.
 *
 * WARN: The display path keeps its redirect. This variant is asked for once, when the
 * editor opens, so every `<img>` and preload still shares the cached 302.
 */
async function streamForEditing(row: Media) {
  // WARN: § 9.1. The one branch that answers bytes from this origin instead of a 302, so it re-states the allow-list rather than inheriting the attachment forcing below. `isFileMime` is a shape test, not an allow-list — `image/svg+xml` is deliberately filed as an attachment (§ 14.) precisely so nothing renders it, and streaming one inline would run its script under the app's own origin and session.
  if (row.filename !== null || !(isImageMime(row.mime) || isVideoMime(row.mime))) {
    return apiError("not_found");
  }

  // INFO: § 14.'s `background` ceiling, since every target of 사진 사용하기 is a background or an avatar — it is what keeps a 500MB chat video from being buffered into a response.
  const fetched = await readObject(row.r2Key, maxSizeForScope(row.mime, "background"));

  if (!fetched) {
    return apiError("not_found");
  }

  return new NextResponse(new Uint8Array(fetched.bytes), {
    headers: {
      "Content-Type": fetched.mime,
      // INFO: § 9. The same immutable lifetime the presigned GET carries — the key holds a UUID, so these bytes never change.
      "Cache-Control": MEDIA_ASSET_CACHE_CONTROL,
    },
  });
}
