import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import {
  EMOTICON_SLOTS,
  allowedMimesForEmoticonSlot,
  maxSizeForEmoticonSlot,
} from "@/shared/config";
import { buildStorageKey, presignUpload, releaseReservations, reserveKey } from "@/shared/storage";
import { NextResponse } from "next/server";
import { z } from "zod";

// WARN: REQUIREMENTS.md § 13.7.1. jandh-emoticons mirrors this handler, and the browser reaches whichever copy the switch names. Both sides change together — a fix landed here alone is one this app stops running the moment the switch is on.

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
    return apiError("unauthorized");
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  const { slot, mime, size } = body.data;

  if (!allowedMimesForEmoticonSlot(slot).includes(mime)) {
    return apiError("unsupported_media");
  }

  // INFO: REQUIREMENTS.md § 14. A courtesy rejection on the client's own claim. R2 enforces neither the type nor the size of a presigned PUT, so `registerEmoticon` re-checks both against what actually landed.
  if (size > maxSizeForEmoticonSlot(slot)) {
    return apiError("too_large");
  }

  // WARN: Built from the caller's own id and never read off the request — a signature the browser could aim would let it overwrite any object in the bucket (§ 9.).
  const r2Key = buildStorageKey("emoticon", user.id);

  // WARN: § 9. The claim is written before the ticket is signed, never after — a signature handed out first may be redeemed while this request is still in flight, landing an object no row ever named.
  await reserveKey(r2Key, user.id);

  // INFO: § 13.3. No `Cache-Control` here — the asset route signs one into the presigned GET instead, which asks nothing of the browser or of the bucket's CORS policy.
  return NextResponse.json({ r2Key, uploadUrl: await presignUpload(r2Key, mime) });
}

/**
 * Drops objects that landed in R2 for a submit that never produced an item
 * (§ 13.3.). Nothing addresses R2 by key, so an unregistered object is unreachable
 * from the app and would otherwise sit in the bucket forever.
 *
 * WARN: The key prefix is the ownership proof, exactly as in `registerEmoticon`. The
 * second half — that a failed *second* submit cannot delete the assets a first one
 * registered — is now structural: registration consumes the reservation, so a key that
 * reached a `media` row has none left for this to release. It used to be asserted by
 * asking which keys were slotted into an item, which answered wrongly for a row that
 * existed but had not been slotted yet.
 *
 * WARN: § 13.7.1. Same URL, same body, same 204 as before — jandh-emoticons mirrors
 * this handler and the client protocol did not move.
 */
export async function DELETE(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = discardSchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  const own = body.data.r2Keys.filter((key) => key.startsWith(`emoticon/${user.id}/`));

  await releaseReservations(own, user.id);

  return new NextResponse(null, { status: 204 });
}
