import {
  deleteEmoticonPack,
  getEmoticonPack,
  renameEmoticonPack,
  setEmoticonPackThumbnail,
} from "@/entities/emoticon";
import { getCurrentUser } from "@/shared/auth";
import { MAX_EMOTICON_PACK_NAME_LENGTH } from "@/shared/config";
import { deleteObjects } from "@/shared/storage";
import { NextResponse } from "next/server";
import { z } from "zod";

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
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = paramsSchema.safeParse(await context.params);

  if (!params.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const pack = await getEmoticonPack(params.data.id, user.id);

  if (!pack) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ pack });
}

/** INFO: REQUIREMENTS.md § 13.1. No `created_by` check anywhere here — either participant may edit any pack. */
export async function PATCH(request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!params.success || !body.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (body.data.name !== undefined && !(await renameEmoticonPack(params.data.id, body.data.name))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (
    body.data.thumbnailItemId !== undefined &&
    !(await setEmoticonPackThumbnail(params.data.id, body.data.thumbnailItemId ?? null))
  ) {
    // INFO: `setEmoticonPackThumbnail` refuses an item belonging to another pack, which is a bad request rather than a missing one.
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const pack = await getEmoticonPack(params.data.id, user.id);

  return NextResponse.json({ pack });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = paramsSchema.safeParse(await context.params);

  if (!params.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await deleteEmoticonPack(params.data.id);

  if (result.status === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // INFO: One of its items has been sent, so the pack cannot go without deciding what those bubbles become (§ 18. #1).
  if (result.status === "in_use") {
    return NextResponse.json({ error: "in_use" }, { status: 409 });
  }

  // INFO: REQUIREMENTS.md § 9. Cleanup behind a row that is already gone — `deleteObjects` never throws, so a bucket that refuses must not fail the delete.
  await deleteObjects(result.orphanedKeys);

  return new NextResponse(null, { status: 204 });
}
