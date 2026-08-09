import { getEmoticonItem, toSlotKey } from "@/entities/emoticon";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import {
  EMOTICON_ASSET_CACHE_CONTROL,
  EMOTICON_CACHE_MAX_AGE,
  EMOTICON_SLOTS,
  EMOTICON_URL_EXPIRY,
} from "@/shared/config";
import { A_SECOND } from "@/shared/lib";
import { presignDownload } from "@/shared/storage";
import { NextResponse } from "next/server";
import { z } from "zod";

// WARN: REQUIREMENTS.md § 13.7.1. jandh-emoticons mirrors this handler too, and this one is exempt from the switch rather than from the mirror — each app always serves its own copy, so a fix landed here alone leaves that app's screens on the old behaviour indefinitely.

const paramsSchema = z.object({ id: z.uuid() });

// INFO: `v` is `Emoticon.version` and is read by nobody here — it is what keeps an edited item's cached redirect (§ 13.4.) from answering for the object it replaced.
const querySchema = z.object({ slot: z.enum(EMOTICON_SLOTS).default("image") });

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
  const key = row && toSlotKey(row, query.data.slot);

  // INFO: The same answer for an item that does not exist and one that carries no asset in this slot — an optional companion's absence is not worth a distinguishable status.
  if (!key) {
    return apiError("not_found");
  }

  // WARN: § 13.3. The `Cache-Control` on the *bytes* is signed into this URL, not stored on the object — R2 holds none, and a browser cannot put one on the upload.
  const url = await presignDownload(key, {
    expiry: EMOTICON_URL_EXPIRY,
    cacheControl: EMOTICON_ASSET_CACHE_CONTROL,
  });

  return NextResponse.redirect(url, {
    status: 302,
    // WARN: REQUIREMENTS.md § 13.3. Days rather than § 9.'s minutes, because `v` makes this URL address one immutable version — and still shorter than the signature's own lifetime, or the browser replays a redirect R2 has stopped honouring.
    headers: { "Cache-Control": `private, max-age=${EMOTICON_CACHE_MAX_AGE / A_SECOND}` },
  });
}
