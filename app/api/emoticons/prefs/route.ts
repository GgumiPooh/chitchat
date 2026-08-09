import {
  listEmoticonPacks,
  setEmoticonPackEnabled,
  setEmoticonPackOrder,
} from "@/entities/emoticon";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

// WARN: REQUIREMENTS.md § 13.7.1. jandh-emoticons mirrors this handler, and the browser reaches whichever copy the switch names. Both sides change together — a fix landed here alone is one this app stops running the moment the switch is on.

const orderSchema = z.object({ packIds: z.array(z.uuid()).min(1) });

const enabledSchema = z.object({ packId: z.uuid(), enabled: z.boolean() });

/**
 * REQUIREMENTS.md § 13.5. The whole ordered list, because `sort_order` is
 * positional — moving one pack renumbers every pack after it.
 *
 * INFO: This writes `user_emoticon_prefs`, not `users`, so it deliberately raises
 * no `user_changed` event (§ 8.4.). The preference is per-user by definition; the
 * same user's second device picks it up on its next load.
 */
export async function PUT(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = orderSchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  const known = new Set((await listEmoticonPacks(user.id)).map((pack) => pack.id));

  // WARN: Every id must be a real pack. `user_emoticon_prefs.pack_id` is a foreign key, so an unknown one would surface as a 500 rather than a 400.
  if (body.data.packIds.some((packId) => !known.has(packId))) {
    return apiError("invalid_request");
  }

  await setEmoticonPackOrder(user.id, body.data.packIds);

  return new NextResponse(null, { status: 204 });
}

/** REQUIREMENTS.md § 13.5. Hiding is per-user — the pack is untouched and the other participant is unaffected. */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = enabledSchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  const packs = await listEmoticonPacks(user.id);

  if (!packs.some((pack) => pack.id === body.data.packId)) {
    return apiError("not_found");
  }

  // INFO: § 13.1. The list as this user currently sees it, so hiding a pack records the order it already had rather than inventing one.
  await setEmoticonPackEnabled(
    user.id,
    body.data.packId,
    body.data.enabled,
    packs.map((pack) => pack.id),
  );

  return new NextResponse(null, { status: 204 });
}
