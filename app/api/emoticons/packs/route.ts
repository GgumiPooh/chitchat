import { createEmoticonPack, listEmoticonPacks } from "@/entities/emoticon";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { MAX_EMOTICON_PACK_NAME_LENGTH } from "@/shared/config";
import { NextResponse } from "next/server";
import { z } from "zod";

// WARN: REQUIREMENTS.md § 13.7.1. jandh-emoticons mirrors this handler, and the browser reaches whichever copy the switch names. Both sides change together — a fix landed here alone is one this app stops running the moment the switch is on.

const bodySchema = z.object({
  name: z.string().trim().min(1).max(MAX_EMOTICON_PACK_NAME_LENGTH),
});

/**
 * Every pack in this user's own order (REQUIREMENTS.md § 13.1.), summaries and
 * nothing else.
 *
 * INFO: § 13.6. `?items=1` is gone with the picker's payload. The panel takes this
 * list and asks `packs/{id}/items` for the one tab it opens; each summary already
 * names the thumbnail it draws with, which is what the picker used to need the items
 * for.
 *
 * WARN: § 13.8. Hidden packs are included, and the picker is what filters them out of
 * its tabs. This used to be `?enabled=1` and the filter was here — which made a hidden
 * pack's items unreachable by search as well as by tab, and § 13.9.'s 따라하기
 * undeliverable for exactly the emoticon that needs it most.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  return NextResponse.json({ packs: await listEmoticonPacks(user.id) });
}

/** REQUIREMENTS.md § 13.4. A title is the whole form — items and a thumbnail come later. */
export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  const pack = await createEmoticonPack(body.data.name, user.id);

  return NextResponse.json({ pack }, { status: 201 });
}
