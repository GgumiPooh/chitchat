import { registerMedia } from "@/entities/media";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { MEDIA_UPLOAD_SCOPES, VOICE_PEAK_SCALE, VOICE_WAVEFORM_PEAKS } from "@/shared/config";
import { toScopePrefix } from "@/shared/storage";
import { isBlurhashValid } from "blurhash";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  r2Key: z.string().min(1),
  // INFO: REQUIREMENTS.md § 8.3. Read off the decoded `<img>` / `<video>` in the browser, because the server never receives the bytes to measure.
  // INFO: § 9.1. Zero is allowed because a file attachment has no box to measure; `registerMedia` zeroes it there regardless and refuses a media row whose thumbnail never landed.
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative().nullish(),
  // INFO: REQUIREMENTS.md § 9. The placeholder the browser encoded from the `_thumb` object it had just uploaded — the server never sees those pixels, so it can only check the string.
  // INFO: Shape is `isBlurhashValid` from the package that wrote it, never a regex spelled out here: the leading character encodes the component counts the rest of the length must agree with, and base83 is exactly what a dependency exists to avoid hand-rolling.
  // WARN: A malformed value is **caught to null**, never refused. Registration runs after the bytes are in R2, so a 400 at this schema orphans an object no row can name and no retry can rescue — the same argument `filename` above carries for its missing `.max()`. What a nulled placeholder costs is § 8.3.'s empty box, which is what every row drew before this column was written at all.
  blurhash: z
    .string()
    .refine((value) => isBlurhashValid(value).result)
    .nullish()
    .catch(null),
  // INFO: REQUIREMENTS.md § 9.1. The name the file was picked under. Sanitized and accepted only for a stored type the app cannot draw — `registerMedia` decides that from R2, not from here.
  // WARN: Length is not bounded here, by either `.max()` or a code-point refine. Registration is the step *after* the bytes are in R2, so every rejection at this schema orphans an object that no row can name and that no retry can rescue — the same 400 comes back forever. `registerMedia` runs `toSafeFilename`, which truncates to `MAX_FILENAME_LENGTH` by code point, so an over-long name is already a harmless truncation rather than a failure. Bounding it here converts that into the orphan.
  filename: z.string().min(1).nullish(),
  // INFO: REQUIREMENTS.md § 9.3. The waveform the recorder extracted. Bounded here only in shape; `registerMedia` is what refuses it on a mime this app does not record into, which is the check that matters.
  // WARN: Shape only, and the length is exact rather than a ceiling — unlike `filename` above, a malformed array is not a name to salvage, and `registerMedia` refuses the row on it either way.
  waveformPeaks: z
    .array(z.number().int().min(0).max(VOICE_PEAK_SCALE))
    .length(VOICE_WAVEFORM_PEAKS)
    .nullish(),
  // INFO: REQUIREMENTS.md § 10. An upload started in the 보관함 tab that is not being posted to the conversation. It needs a marker of its own, because the grid's other source is the `message_media` join.
  addToGallery: z.boolean().optional(),
});

/**
 * Registers an object the browser has already uploaded (REQUIREMENTS.md § 9.).
 * Until this succeeds the object is unreachable — nothing in the app addresses
 * R2 by key, only by `media.id`.
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

  // WARN: The prefix is the ownership check. `buildStorageKey` puts the uploader's id in the key, so a caller naming someone else's key is claiming an object it never uploaded. The scope is matched too, or an emoticon object could be claimed as a `media` row and land in the library (§ 13.3.).
  const scope = MEDIA_UPLOAD_SCOPES.find((candidate) =>
    body.data.r2Key.startsWith(toScopePrefix(candidate, user.id)),
  );

  if (!scope) {
    return apiError("invalid_request");
  }

  // WARN: REQUIREMENTS.md § 12. `addToGallery` is the caller's own claim, so it has to be refused rather than ignored for a scope the library does not own. An avatar filed into the grid is deleted outright by § 10.'s removal — nothing carries it in a message — and `users.avatar_media_id` is `ON DELETE SET NULL`, so the wearer's photo would silently disappear.
  if (scope !== "chat" && body.data.addToGallery) {
    return apiError("invalid_request");
  }

  const media = await registerMedia({ ownerId: user.id, scope, ...body.data });

  // INFO: The object is missing, or its stored type or size failed § 14. Either way there is nothing to point a message at.
  if (!media) {
    return apiError("unprocessable");
  }

  return NextResponse.json({ media }, { status: 201 });
}
