import { listUnregisteredEmoticonKeys } from "@/entities/emoticon";
import { getCurrentUser } from "@/shared/auth";
import {
  EMOTICON_SLOTS,
  allowedMimesForEmoticonSlot,
  maxSizeForEmoticonSlot,
} from "@/shared/config";
import { buildStorageKey, deleteObjects, presignUpload } from "@/shared/storage";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  slot: z.enum(EMOTICON_SLOTS),
  mime: z.string().min(1),
  size: z.number().int().positive(),
});

const discardSchema = z.object({ r2Keys: z.array(z.string().min(1)).min(1) });

/**
 * Issues the single presigned PUT one emoticon asset needs (REQUIREMENTS.md § 13.3.).
 *
 * WARN: One URL, not the pair `/api/media/upload-url` issues. An emoticon has no
 * `_thumb` sibling — it is rendered directly at 140px (DESIGN.md § 6.5.), so a
 * derivative would be larger than the thing it derives from.
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

  const { slot, mime, size } = body.data;

  if (!allowedMimesForEmoticonSlot(slot).includes(mime)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  }

  // INFO: REQUIREMENTS.md § 14. A courtesy rejection on the client's own claim. R2 enforces neither the type nor the size of a presigned PUT, so `registerEmoticon` re-checks both against what actually landed.
  if (size > maxSizeForEmoticonSlot(slot)) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  // WARN: Built from the caller's own id and never read off the request — a signature the browser could aim would let it overwrite any object in the bucket (§ 9.).
  const r2Key = buildStorageKey("emoticon", user.id);

  return NextResponse.json({ r2Key, uploadUrl: await presignUpload(r2Key, mime) });
}

/**
 * Drops objects that landed in R2 for a submit that never produced an item
 * (§ 13.3.). Nothing addresses R2 by key, so an unregistered object is unreachable
 * from the app and would otherwise sit in the bucket forever.
 *
 * WARN: The key prefix is the ownership proof, exactly as in `registerEmoticon` —
 * and a key an item already references is refused, so a failed *second* submit
 * cannot delete the assets of the emoticon a first one registered.
 */
export async function DELETE(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = discardSchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const own = body.data.r2Keys.filter((key) => key.startsWith(`emoticon/${user.id}/`));

  await deleteObjects(await listUnregisteredEmoticonKeys(own));

  return new NextResponse(null, { status: 204 });
}
