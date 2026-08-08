import { deleteEmoticonItem, updateEmoticonItem } from "@/entities/emoticon";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { MAX_EMOTICON_KEYWORDS, MAX_EMOTICON_KEYWORD_LENGTH } from "@/shared/config";
import { deleteObjects } from "@/shared/storage";
import { NextResponse } from "next/server";
import { z } from "zod";

const paramsSchema = z.object({ id: z.uuid() });

/**
 * INFO: REQUIREMENTS.md § 13.4. `audioKey` is tri-state on purpose — absent keeps
 * the sound the item already has, `null` removes it, a key replaces it.
 */
const patchSchema = z
  .object({
    imageKey: z.string().min(1).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    audioKey: z.string().min(1).nullish(),
    // INFO: REQUIREMENTS.md § 13.8. Absent keeps the item's keywords; `[]` is the explicit "remove them all", so an image-only edit cannot wipe them by omission.
    keywords: z
      .array(z.string().max(MAX_EMOTICON_KEYWORD_LENGTH))
      .max(MAX_EMOTICON_KEYWORDS)
      .optional(),
  })
  // WARN: § 8.3. reserves the bubble's box from the stored size, so new bytes without their measurements would leave the row describing the image it replaced.
  .refine(
    (body) =>
      (body.imageKey === undefined) === (body.width === undefined) &&
      (body.width === undefined) === (body.height === undefined),
    { message: "image requires its measurements" },
  )
  // WARN: Every key is optional, so `{}` parses — and drizzle throws `No values to set` on the empty `.set()` that follows, which surfaces as a 500 for what is a malformed request. § 13.8. made `updated_at` conditional, which removed the one field that had always kept that object non-empty.
  .refine((body) => Object.values(body).some((value) => value !== undefined), "empty patch");

/**
 * Replaces an item's assets in place (REQUIREMENTS.md § 13.4.).
 *
 * INFO: Unlike DELETE below, an item already sent in chat may be edited. The
 * message references the item rather than the object, so there is no foreign key to
 * trip over, and the corrected image appearing in the history is what editing is
 * for.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const params = paramsSchema.safeParse(await context.params);
  const body = patchSchema.safeParse(await request.json().catch(() => null));

  if (!params.success || !body.success) {
    return apiError("invalid_request");
  }

  const { imageKey, width, height, audioKey, keywords } = body.data;

  const result = await updateEmoticonItem({
    itemId: params.data.id,
    uploaderId: user.id,
    image: imageKey && width && height ? { key: imageKey, width, height } : undefined,
    audioKey,
    keywords,
  });

  if (result.status === "not_found") {
    return apiError("not_found");
  }

  // INFO: An object is missing, or its stored type or size failed § 14., or a key was not this uploader's to claim — the same answer registration gives.
  if (result.status === "unprocessable") {
    return apiError("unprocessable");
  }

  // WARN: Immediate, and a participant holding the pre-edit redirect does get a broken image for one load — `PreloadImage` retries past the cache (§ 13.4.), which is what pays for the multi-day asset cache the deferred delete could not have outlived.
  await deleteObjects(result.orphanedKeys);

  return NextResponse.json({ emoticon: result.emoticon });
}

/**
 * INFO: REQUIREMENTS.md § 13.2. A pack whose thumbnail was this item keeps
 * existing — the FK is `ON DELETE SET NULL` and the picker falls back to the
 * pack's first item.
 *
 * WARN: An item already sent in chat is referenced by `messages.emoticon_item_id`,
 * which carries no cascade, so this answers 409 rather than letting Postgres
 * surface a foreign-key error as a 500. Deleting the item would otherwise have to
 * decide what an already-sent bubble becomes, which is § 18. #1's question.
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const params = paramsSchema.safeParse(await context.params);

  if (!params.success) {
    return apiError("invalid_request");
  }

  const result = await deleteEmoticonItem(params.data.id);

  if (result.status === "not_found") {
    return apiError("not_found");
  }

  if (result.status === "in_use") {
    return apiError("in_use");
  }

  // INFO: REQUIREMENTS.md § 9. Cleanup behind a row that is already gone; `deleteObjects` never throws.
  await deleteObjects(result.orphanedKeys);

  return new NextResponse(null, { status: 204 });
}
