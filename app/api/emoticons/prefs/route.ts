import {
  findKnownPackIds,
  setEmoticonPackEnabled,
  setEmoticonPackOrder,
} from "@/entities/emoticon";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { EmoticonPackId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

// WARN: REQUIREMENTS.md § 13.7.1. jandh-emoticons mirrors this handler, and the browser reaches whichever copy the switch names. Both sides change together — a fix landed here alone is one this app stops running the moment the switch is on.

const orderSchema = z
  .object({
    packId: snowflakeSchema<EmoticonPackId>(),
    after: snowflakeSchema<EmoticonPackId>().nullable(),
  })
  // INFO: A pack cannot land behind itself — the midpoint would be bisected against its own position and the move would answer 204 having changed nothing.
  .refine((body) => body.after !== body.packId);

const enabledSchema = z.object({
  packId: snowflakeSchema<EmoticonPackId>(),
  enabled: z.boolean(),
});

/**
 * REQUIREMENTS.md § 13.5. One move, not the list: the pack that moved and the pack
 * it landed behind, `null` for the front.
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

  const { packId, after } = body.data;
  // INFO: § 13.5. The two ids this move names and nothing else — the write is one row, so reading the library to validate it is the O(library) request the sparse key exists to have removed.
  const known = await findKnownPackIds(after === null ? [packId] : [packId, after]);

  // WARN: Both ids must be a real pack. `user_emoticon_prefs.pack_id` is a foreign key, so an unknown one would surface as a 500 rather than a 400 — and an unknown neighbour would silently read as the front of the list.
  if (!known.has(packId) || (after !== null && !known.has(after))) {
    return apiError("invalid_request");
  }

  await setEmoticonPackOrder(user.id, packId, after);

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

  const known = await findKnownPackIds([body.data.packId]);

  if (!known.has(body.data.packId)) {
    return apiError("not_found");
  }

  await setEmoticonPackEnabled(user.id, body.data.packId, body.data.enabled);

  return new NextResponse(null, { status: 204 });
}
