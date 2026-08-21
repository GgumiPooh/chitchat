import { writeChatBackground, type ReplacedBackground } from "@/entities/chat-background";
import {
  discardUnwornScopedMedia,
  insertMedia,
  mediaUploadSchema,
  validateMediaUpload,
} from "@/entities/media";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { isImageMime } from "@/shared/config";
import { getDb } from "@/shared/db";
import { safelyRunAsync, type Nullable } from "@/shared/lib";
import { after, NextResponse } from "next/server";
import { z } from "zod";

// INFO: REQUIREMENTS.md § 12.2. `null` is 기본 배경으로 — the room goes back to the flat `chat-canvas`. Required rather than `nullish`, because unlike § 12.'s patch there is only one field here and an absent one would leave nothing to write.
const bodySchema = z.object({ media: mediaUploadSchema.nullable() });

/**
 * REQUIREMENTS.md § 12.2. The wallpaper both participants see.
 *
 * WARN: Its own route rather than a key on `PATCH /api/users/me`, and that is the
 * whole shape of this feature: the wallpaper is not a property of the caller. Either
 * participant may set it, either may clear it, and the object being replaced
 * generally belongs to the other one.
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  const { media } = body.data;

  // WARN: § 9. The R2 HEADs stay outside the transaction — see `validateMediaUpload`. The image-only rule (§ 12.1.) is checked here too: the copy route already refuses a video for the chat slot, but `chat_settings` is writable with any `background/` object its setter owns, so nothing else would stop one aimed here.
  const validated =
    media && (await validateMediaUpload({ ownerId: user.id, upload: media, scope: "background" }));

  if (media && (!validated || !isImageMime(validated.mime))) {
    return apiError("unprocessable");
  }

  const update = await getDb().transaction(async (tx) => {
    if (!validated) {
      return writeChatBackground(tx, null);
    }

    const written = await insertMedia(tx, validated);

    if (!written) {
      return "reclaimed" as const;
    }

    return writeChatBackground(tx, written.id);
  });

  if (update === "reclaimed") {
    return apiError("unprocessable");
  }

  discardReplaced(update.replaced);

  return NextResponse.json({ backgroundMediaId: update.backgroundMediaId });
}

/**
 * WARN: Cleanup behind a write that already committed, so it runs after the response
 * and cannot fail it — REQUIREMENTS.md § 12.'s argument unchanged. A transient failure
 * here answering 500 for a change that landed leaves the sheet on
 * 배경을 저장하지 못했어요, and the retry uploads a second photo.
 *
 * WARN: REQUIREMENTS.md § 12.2. The **previous setter's** id, never the caller's.
 * `discardScopedMedia` narrows to `background/{ownerId}/`, so passing the person who
 * happens to be replacing it reclaims nothing at all whenever the two participants
 * take turns — and the bucket grows by a full-resolution photo each time.
 */
function discardReplaced(replaced: Nullable<ReplacedBackground>): void {
  if (!replaced) {
    return;
  }

  after(() =>
    safelyRunAsync(() => discardUnwornScopedMedia(replaced.id, replaced.ownerId, "background")),
  );
}
