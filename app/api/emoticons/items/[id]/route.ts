import { deleteEmoticonItem, updateEmoticonItem } from "@/entities/emoticon";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import {
  MAX_EMOTICON_KEYWORD_LENGTH,
  MAX_EMOTICON_KEYWORDS,
  snowflakeSchema,
} from "@/shared/config";
import type { EmoticonItemId } from "@/shared/lib";
import { purgeNow } from "@/shared/storage";
import { NextResponse } from "next/server";
import { z } from "zod";

// WARN: REQUIREMENTS.md § 13.7.1. jandh-emoticons mirrors this handler, and the browser reaches whichever copy the switch names. Both sides change together — a fix landed here alone is one this app stops running the moment the switch is on.

const paramsSchema = z.object({ id: snowflakeSchema<EmoticonItemId>() });

/** WARN: § 8.3. reserves the bubble's box from the stored size, so the measurements travel with the key rather than being fields of their own — new bytes without them would leave the row describing the image they replaced. */
const imageSchema = z.object({
  key: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

/**
 * INFO: REQUIREMENTS.md § 13.4. Every slot is tri-state on purpose — absent keeps
 * what the item already has, `null` empties it, a value replaces it.
 */
const patchSchema = z
  .object({
    still: imageSchema.nullish(),
    animated: imageSchema.nullish(),
    audioKey: z.string().min(1).nullish(),
    // INFO: REQUIREMENTS.md § 13.8. Absent keeps the item's keywords; `[]` is the explicit "remove them all", so an image-only edit cannot wipe them by omission.
    keywords: z
      .array(z.string().max(MAX_EMOTICON_KEYWORD_LENGTH))
      .max(MAX_EMOTICON_KEYWORDS)
      .optional(),
  })
  // INFO: `emoticon_items_has_image_check` for the one case the body can settle on its own; emptying only the slot the item actually holds is refused by `updateEmoticonItem`, which is what knows.
  .refine((body) => body.still !== null || body.animated !== null)
  // WARN: Every key is optional, so `{}` parses — and drizzle throws `No values to set` on the empty `.set()` that follows, which surfaces as a 500 for what is a malformed request. § 13.8. made `updated_at` conditional, which removed the one field that had always kept that object non-empty.
  .refine((body) => Object.values(body).some((value) => value !== undefined), "empty patch");

/**
 * Replaces an item's assets in place (REQUIREMENTS.md § 13.4.).
 *
 * INFO: § 13.4. An item already sent in chat may be edited — the message references the
 * item rather than the object, so the corrected image appears in the history.
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

  const result = await updateEmoticonItem({
    itemId: params.data.id,
    uploaderId: user.id,
    ...body.data,
  });

  if (result.status === "not_found") {
    return apiError("not_found");
  }

  // INFO: An object is missing, or its stored type or size failed § 14., or a key was not this uploader's to claim — the same answer registration gives.
  if (result.status === "unprocessable") {
    return apiError("unprocessable");
  }

  // WARN: § 13.4. Immediate and inline, with no grace and no `after()`. A participant holding the pre-edit redirect does get a broken image for one load — `PreloadImage` retries past the cache — which is what pays for the multi-day asset cache no deferred delete could have outlived.
  await purgeNow(result.orphanedKeys);

  return NextResponse.json({ emoticon: result.emoticon });
}

/**
 * INFO: REQUIREMENTS.md § 13.2. A pack whose thumbnail was this item keeps
 * existing — the FK is `ON DELETE SET NULL` and the picker falls back to the
 * pack's first item.
 *
 * INFO: REQUIREMENTS.md § 13.4. Every item takes the same soft-delete, sent or not,
 * mini or not.
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

  // INFO: REQUIREMENTS.md § 9. The `media` rows went with the item; `purgeNow` takes the bytes and never throws. § 13.4. gives emoticons no grace — the redirect is cached for days.
  await purgeNow(result.orphanedKeys);

  return new NextResponse(null, { status: 204 });
}
