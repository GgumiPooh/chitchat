import { canReadMedia, getMediaRow, toVariantKey } from "@/entities/media";
import { getCurrentUser } from "@/shared/auth";
import { MEDIA_CACHE_MAX_AGE } from "@/shared/config";
import { A_SECOND } from "@/shared/lib";
import { presignDownload } from "@/shared/storage";
import { NextResponse } from "next/server";
import { z } from "zod";

const paramsSchema = z.object({ id: z.uuid() });

const querySchema = z.object({
  variant: z.enum(["thumb", "original"]).default("thumb"),
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
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = paramsSchema.safeParse(await context.params);
  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!params.success || !query.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const row = await getMediaRow(params.data.id);

  // INFO: The same answer for an object that does not exist and one this user may not read — a distinguishable 403 would confirm the id.
  if (!row || !(await canReadMedia(row, user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // WARN: REQUIREMENTS.md § 9.1. A file attachment is served as an attachment whatever the query says, and never as a thumb variant it has no object for. Nothing in the app renders one inline, so the only way this URL is ever opened is to save it.
  const isFile = row.filename !== null;
  // WARN: REQUIREMENTS.md § 9.3. A voice message has no `_thumb` sibling either — one PUT, like a file — so it is forced off the default variant for the same reason. It is **not** forced to an attachment: unlike a file it is meant to play inline, and `variant` defaulting to `thumb` is what would otherwise sign a URL for an object R2 never received.
  const hasNoThumb = isFile || row.waveformPeaks !== null;
  const url = await presignDownload(
    toVariantKey(row, hasNoThumb ? "original" : query.data.variant),
    {
      asAttachment: isFile || query.data.download === "1",
      filename: row.filename,
    },
  );

  return NextResponse.redirect(url, {
    status: 302,
    // WARN: REQUIREMENTS.md § 9. Shorter than the signature's own lifetime, or the browser replays a cached redirect to a URL R2 has stopped honouring.
    headers: { "Cache-Control": `private, max-age=${MEDIA_CACHE_MAX_AGE / A_SECOND}` },
  });
}
