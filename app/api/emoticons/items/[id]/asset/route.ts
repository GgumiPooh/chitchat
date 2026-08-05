import { getEmoticonItem, toSlotKey } from "@/entities/emoticon";
import { getCurrentUser } from "@/shared/auth";
import { EMOTICON_SLOTS, MEDIA_CACHE_MAX_AGE } from "@/shared/config";
import { A_SECOND } from "@/shared/lib";
import { presignDownload } from "@/shared/storage";
import { NextResponse } from "next/server";
import { z } from "zod";

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
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = paramsSchema.safeParse(await context.params);
  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!params.success || !query.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const row = await getEmoticonItem(params.data.id);
  const key = row && toSlotKey(row, query.data.slot);

  // INFO: The same answer for an item that does not exist and one that carries no asset in this slot — an optional companion's absence is not worth a distinguishable status.
  if (!key) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.redirect(await presignDownload(key), {
    status: 302,
    // WARN: REQUIREMENTS.md § 9. Shorter than the signature's own lifetime, or the browser replays a cached redirect to a URL R2 has stopped honouring.
    headers: { "Cache-Control": `private, max-age=${MEDIA_CACHE_MAX_AGE / A_SECOND}` },
  });
}
