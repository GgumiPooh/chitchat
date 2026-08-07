import { copyMediaIntoScope } from "@/entities/media";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  sourceId: z.uuid(),
  // INFO: REQUIREMENTS.md § 12.1. Which background this copy is for. It is not the scope — both share `background/` — it is the one thing that decides whether a video is allowed.
  slot: z.enum(["profile", "chat"]),
});

/**
 * REQUIREMENTS.md § 12.1. Lifts a photo the caller can already see into their own
 * `background/` scope, so it can be worn as a profile cover or a chat wallpaper.
 *
 * WARN: The scope is fixed here rather than taken from the body. `background` is
 * the one scope whose objects are duplicates by design; letting a caller name
 * `chat` would mint a `media` row that the § 10. library immediately owns, and
 * `avatar` would put a second copy behind `discardScopedMedia` on the next profile
 * save.
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

  const result = await copyMediaIntoScope({
    sourceId: body.data.sourceId,
    userId: user.id,
    scope: "background",
    // INFO: REQUIREMENTS.md § 12.1. The chat wallpaper is image-only — it sits behind § 8.3.'s virtualized list, where a decoding video is a battery cost paid for as long as the tab is open.
    canBeVideo: body.data.slot === "profile",
  });

  switch (result.status) {
    case "copied":
      return NextResponse.json({ media: result.media }, { status: 201 });
    // INFO: The source is missing or this user may not read it. REQUIREMENTS.md § 9. answers 404 rather than 403 for both, so the response cannot confirm an id exists.
    case "unreachable":
      return apiError("not_found");
    // INFO: REQUIREMENTS.md § 12.1. A background is drawn in an `<img>`, so a video has no still frame to wear. Its own status, because unlike the 404 above this is a real object the caller can see.
    case "unsupported":
      return apiError("unsupported_media");
    // WARN: The copy landed in R2 and then failed § 14. at registration, so two objects are now in the bucket with no row. Answering 404 here reported that as a source that never existed and left the orphan attributable to nothing.
    case "unregistered":
      return apiError("unprocessable");
  }
}
