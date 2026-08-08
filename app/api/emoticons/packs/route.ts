import {
  createEmoticonPack,
  listEmoticonPacks,
  listEmoticonPacksWithItems,
} from "@/entities/emoticon";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { MAX_EMOTICON_PACK_NAME_LENGTH } from "@/shared/config";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(MAX_EMOTICON_PACK_NAME_LENGTH),
});

/**
 * Every pack in this user's own order (REQUIREMENTS.md § 13.1.).
 *
 * INFO: `?items=1` is what the § 13.6. picker asks for — every pack *with its
 * items*, since the picker needs both and a second round trip per pack would be one
 * request per tab. The management screen (§ 13.5.) takes the default, which carries
 * no items.
 *
 * WARN: § 13.8. Both answers carry hidden packs, and the picker is what filters them
 * out of its tabs. This used to be `?enabled=1` and the filter was here — which made
 * a hidden pack's items unreachable by search as well as by tab, and § 13.9.'s
 * 따라하기 undeliverable for exactly the emoticon that needs it most.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const hasItems = new URL(request.url).searchParams.get("items") === "1";

  return NextResponse.json({
    packs: hasItems ? await listEmoticonPacksWithItems(user.id) : await listEmoticonPacks(user.id),
  });
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
