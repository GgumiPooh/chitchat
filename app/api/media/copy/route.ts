import { copyMediaIntoScope } from "@/entities/media";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  sourceId: z.uuid(),
});

/**
 * REQUIREMENTS.md § 12.1. Lifts a photo the caller can already see into their own
 * `background/` scope, so it can be worn as a profile cover or a chat wallpaper.
 *
 * WARN: The scope is fixed here rather than taken from the body. `background` is
 * the one scope whose objects are duplicates by design; letting a caller name
 * `chat` would mint a `media` row that the § 10. gallery immediately owns, and
 * `avatar` would put a second copy behind `discardScopedMedia` on the next profile
 * save.
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

  const result = await copyMediaIntoScope({
    sourceId: body.data.sourceId,
    userId: user.id,
    scope: "background",
  });

  switch (result.status) {
    case "copied":
      return NextResponse.json({ media: result.media }, { status: 201 });
    // INFO: The source is missing or this user may not read it. REQUIREMENTS.md § 9. answers 404 rather than 403 for both, so the response cannot confirm an id exists.
    case "unreachable":
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    // INFO: REQUIREMENTS.md § 12.1. A background is drawn in an `<img>`, so a video has no still frame to wear. Its own status, because unlike the 404 above this is a real object the caller can see.
    case "unsupported":
      return NextResponse.json({ error: "unsupported_media" }, { status: 415 });
    // WARN: The copy landed in R2 and then failed § 14. at registration, so two objects are now in the bucket with no row. Answering 404 here reported that as a source that never existed and left the orphan attributable to nothing.
    case "unregistered":
      return NextResponse.json({ error: "unprocessable" }, { status: 422 });
  }
}
