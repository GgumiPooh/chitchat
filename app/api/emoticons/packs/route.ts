import {
  createEmoticonPack,
  listEmoticonPacks,
  listEnabledEmoticonPacks,
} from "@/entities/emoticon";
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
 * INFO: `?enabled=1` is what the § 13.6. picker asks for — the enabled packs *with
 * their items*, since the picker needs both and a second round trip per pack would
 * be one request per tab. The management screen (§ 13.5.) takes the default, which
 * includes hidden packs and carries no items.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isEnabledOnly = new URL(request.url).searchParams.get("enabled") === "1";

  return NextResponse.json({
    packs: isEnabledOnly
      ? await listEnabledEmoticonPacks(user.id)
      : await listEmoticonPacks(user.id),
  });
}

/** REQUIREMENTS.md § 13.4. A title is the whole form — items and a thumbnail come later. */
export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const pack = await createEmoticonPack(body.data.name, user.id);

  return NextResponse.json({ pack }, { status: 201 });
}
