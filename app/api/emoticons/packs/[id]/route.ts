import {
  deleteEmoticonPack,
  getEmoticonPack,
  renameEmoticonPack,
  setEmoticonPackThumbnail,
} from "@/entities/emoticon";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { MAX_EMOTICON_PACK_NAME_LENGTH } from "@/shared/config";
import { deleteObjects } from "@/shared/storage";
import { NextResponse } from "next/server";
import { z } from "zod";

// WARN: REQUIREMENTS.md § 13.7.1. jandh-emoticons mirrors this handler, and the browser reaches whichever copy the switch names. Both sides change together — a fix landed here alone is one this app stops running the moment the switch is on.

const paramsSchema = z.object({ id: z.uuid() });

// INFO: Both fields are optional and independent — the detail screen renames and re-thumbnails from two different controls. `null` clears the thumbnail back to the § 13.2. fallback.
const bodySchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_EMOTICON_PACK_NAME_LENGTH).optional(),
    thumbnailItemId: z.uuid().nullish(),
  })
  .refine((body) => body.name !== undefined || body.thumbnailItemId !== undefined);

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const params = paramsSchema.safeParse(await context.params);

  if (!params.success) {
    return apiError("invalid_request");
  }

  const pack = await getEmoticonPack(params.data.id, user.id);

  if (!pack) {
    return apiError("not_found");
  }

  return NextResponse.json({ pack });
}

/** INFO: REQUIREMENTS.md § 13.1. No `created_by` check anywhere here — either participant may edit any pack. */
export async function PATCH(request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!params.success || !body.success) {
    return apiError("invalid_request");
  }

  if (body.data.name !== undefined && !(await renameEmoticonPack(params.data.id, body.data.name))) {
    return apiError("not_found");
  }

  if (
    body.data.thumbnailItemId !== undefined &&
    !(await setEmoticonPackThumbnail(params.data.id, body.data.thumbnailItemId ?? null))
  ) {
    // INFO: `setEmoticonPackThumbnail` refuses an item belonging to another pack, which is a bad request rather than a missing one.
    return apiError("invalid_request");
  }

  const pack = await getEmoticonPack(params.data.id, user.id);

  return NextResponse.json({ pack });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const params = paramsSchema.safeParse(await context.params);

  if (!params.success) {
    return apiError("invalid_request");
  }

  const result = await deleteEmoticonPack(params.data.id);

  if (result.status === "not_found") {
    return apiError("not_found");
  }

  // INFO: One of its items has been sent, so the pack cannot go without deciding what those bubbles become (§ 18. #1).
  if (result.status === "in_use") {
    return apiError("in_use");
  }

  // INFO: REQUIREMENTS.md § 9. Cleanup behind a row that is already gone — `deleteObjects` never throws, so a bucket that refuses must not fail the delete.
  await deleteObjects(result.orphanedKeys);

  return new NextResponse(null, { status: 204 });
}
