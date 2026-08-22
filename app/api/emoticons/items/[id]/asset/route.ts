import { getEmoticonItem, toSlotAsset, type ResolvedSlotAsset } from "@/entities/emoticon";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import {
  EMOTICON_ASSET_CACHE_CONTROL,
  EMOTICON_CACHE_MAX_AGE,
  EMOTICON_FALLBACK_CACHE_MAX_AGE,
  EMOTICON_SIGNING_BUCKET,
  EMOTICON_SLOTS,
  EMOTICON_URL_EXPIRY,
  isAllowedEmoticonAsset,
  maxSizeForEmoticonSlot,
  snowflakeSchema,
  toEmoticonAssetFilename,
  type EmoticonSlot,
} from "@/shared/config";
import type { EmoticonItemId } from "@/shared/lib";
import { A_SECOND } from "@/shared/lib";
import { presignDownload, readObject } from "@/shared/storage";
import { NextResponse } from "next/server";
import { z } from "zod";

// WARN: REQUIREMENTS.md § 13.7.1. jandh-emoticons mirrors this handler too, and this one is exempt from the switch rather than from the mirror — each app always serves its own copy, so a fix landed here alone leaves that app's screens on the old behaviour indefinitely.

const paramsSchema = z.object({ id: snowflakeSchema<EmoticonItemId>() });

// INFO: `v` is `Emoticon.version` and is read by nobody here — it is what keeps an edited item's cached redirect (§ 13.4.) from answering for the object it replaced.
// INFO: An absent slot means the animation, which is what a bubble asks for and what the deprecated `image` alias meant before it was removed.
const querySchema = z.object({
  slot: z.enum(EMOTICON_SLOTS).default("animated-image"),
  // INFO: REQUIREMENTS.md § 13.4. The bytes streamed from this origin instead of the redirect — see `streamForEditing`.
  variant: z.literal("edit").optional(),
  // INFO: `toEmoticonAssetDownloadUrl` sets it. Only R2's own `Content-Disposition` survives the 302 (§ 10.).
  download: z.literal("1").optional(),
});

/**
 * REQUIREMENTS.md § 13.3. Redirects to a presigned GET after validating the
 * session. Being same-origin is what makes this work from a bare `<img src>` or
 * `<audio src>` — the browser attaches the session cookie with no fetch wrapper.
 *
 * WARN: A valid session is the whole check, and that is deliberate. A pack belongs
 * to the conversation (§ 13.1.), so there is no per-object question to ask — unlike
 * `canReadMedia`, whose scopes reach objects nobody has posted.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const params = paramsSchema.safeParse(await context.params);
  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!params.success || !query.success) {
    return apiError("invalid_request");
  }

  const row = await getEmoticonItem(params.data.id);
  const asset = row && toSlotAsset(row, query.data.slot);

  // INFO: The same answer for an item that does not exist and one that carries no asset in this slot — an optional companion's absence is not worth a distinguishable status.
  if (!asset) {
    return apiError("not_found");
  }

  if (query.data.variant === "edit") {
    return streamForEditing(asset, query.data.slot);
  }

  // WARN: § 13.3. The `Cache-Control` on the *bytes* is signed into this URL, not stored on the object — R2 holds none, and a browser cannot put one on the upload.
  // WARN: § 13.3. `signingBucket` is what makes a redirect miss cost a 302 and nothing else — re-signed at the wall clock, the same object comes back under a new URL and the browser re-downloads bytes it already holds.
  const url = await presignDownload(asset.key, {
    asAttachment: query.data.download === "1",
    filename: toEmoticonAssetFilename(params.data.id, asset.mime),
    expiry: EMOTICON_URL_EXPIRY,
    cacheControl: EMOTICON_ASSET_CACHE_CONTROL,
    signingBucket: EMOTICON_SIGNING_BUCKET,
  });

  // WARN: Days are earned by `v` addressing one immutable version of the slot that was asked for, and `isFallback` is the narrow case where that is not what answered — an item with **no still**, drawn with its animation until an author gives it one. A missing animation is not that case and does not come here: a static emoticon is finished, so `toSlotAsset` leaves it on the full window.
  const maxAge = asset.isFallback ? EMOTICON_FALLBACK_CACHE_MAX_AGE : EMOTICON_CACHE_MAX_AGE;

  return NextResponse.redirect(url, {
    status: 302,
    // WARN: REQUIREMENTS.md § 13.3. Shorter than the signature's own lifetime, or the browser replays a redirect R2 has stopped honouring. `v` addressing one immutable version is what buys the length.
    headers: { "Cache-Control": `private, max-age=${maxAge / A_SECOND}` },
  });
}

/**
 * REQUIREMENTS.md § 13.4. A stored still as bytes on this origin, so the sheet can
 * re-edit it in a canvas — for `app/api/media/[id]`'s reason (`CLAUDE.md § 5.3.`): an
 * R2 response is cross-origin, so a canvas drawn from it is tainted.
 *
 * WARN: Images only, and re-checked against § 14.'s allow-list. This is the one
 * branch answering bytes under the app's own origin, so a type the slot never admits
 * must not be streamed inline even if one were somehow stored.
 */
async function streamForEditing(asset: ResolvedSlotAsset, slot: EmoticonSlot) {
  if (slot === "audio") {
    return apiError("not_found");
  }

  const fetched = await readObject(asset.key, maxSizeForEmoticonSlot(slot));

  if (!fetched || !isAllowedEmoticonAsset(slot, fetched.mime, fetched.bytes.byteLength)) {
    return apiError("not_found");
  }

  return new NextResponse(new Uint8Array(fetched.bytes), {
    // INFO: § 13.3. The same immutable lifetime the presigned GET carries — the key holds a UUID, so these bytes never change.
    headers: { "Content-Type": fetched.mime, "Cache-Control": EMOTICON_ASSET_CACHE_CONTROL },
  });
}
