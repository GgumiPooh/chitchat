import {
  findKnownPackIds,
  listEmoticonPackItems,
  registerEmoticon,
  setEmoticonItemOrder,
} from "@/entities/emoticon";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import {
  MAX_EMOTICON_KEYWORD_LENGTH,
  MAX_EMOTICON_KEYWORDS,
  snowflakeSchema,
} from "@/shared/config";
import type { EmoticonItemId, EmoticonPackId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

// WARN: REQUIREMENTS.md § 13.7.1. jandh-emoticons mirrors this handler, and the browser reaches whichever copy the switch names. Both sides change together — a fix landed here alone is one this app stops running the moment the switch is on.

const paramsSchema = z.object({ id: snowflakeSchema<EmoticonPackId>() });

const orderSchema = z.object({ itemIds: z.array(snowflakeSchema<EmoticonItemId>()).min(1) });

const imageSchema = z.object({
  key: z.string().min(1),
  // INFO: REQUIREMENTS.md § 13.2. The image's own size, read off the decoded image in the browser — an animated one is measured from its first frame.
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const bodySchema = z
  .object({
    still: imageSchema.optional(),
    animated: imageSchema.optional(),
    audioKey: z.string().min(1).nullish(),
    // INFO: REQUIREMENTS.md § 13.8. Bounded here so an oversized body is refused; `normalizeKeywords` is what trims, folds and deduplicates what gets through.
    keywords: z
      .array(z.string().max(MAX_EMOTICON_KEYWORD_LENGTH))
      .max(MAX_EMOTICON_KEYWORDS)
      .optional(),
  })
  // INFO: § 5.2.'s CHECK, refused here as a `400` rather than reaching the database as a constraint violation.
  .refine((body) => body.still !== undefined || body.animated !== undefined);

/**
 * The pack's items in the shared authoring order (REQUIREMENTS.md § 13.1.).
 *
 * INFO: § 13.6. One tab's worth, which is what replaced `packs?items=1` — the picker
 * asks for the pack it is opening rather than for the library.
 *
 * INFO: § 13.1. A pack belongs to the conversation, so a signed-in user may read any
 * of them and the only check here is that there is one. An unknown id answers an
 * empty list rather than a `404`: this is the panel's per-tab call, and a pack read
 * to distinguish the two would be a second query on it for a case the strip cannot
 * reach.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const params = paramsSchema.safeParse(await context.params);

  if (!params.success) {
    return apiError("invalid_request");
  }

  return NextResponse.json({ items: await listEmoticonPackItems(params.data.id) });
}

/**
 * Registers an item whose objects the browser has already uploaded (§ 13.3.).
 * Until this succeeds they are unreachable — nothing in the app addresses R2 by
 * key, only through `GET /api/emoticons/items/{id}/asset`.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!params.success || !body.success) {
    return apiError("invalid_request");
  }

  if (!(await isKnownPack(params.data.id))) {
    return apiError("not_found");
  }

  const emoticon = await registerEmoticon({
    packId: params.data.id,
    uploaderId: user.id,
    ...body.data,
  });

  // INFO: An object is missing, or its stored type or size failed § 14., or a key was not this uploader's to claim. Either way there is nothing to write a row for.
  if (!emoticon) {
    return apiError("unprocessable");
  }

  return NextResponse.json({ emoticon }, { status: 201 });
}

/**
 * REQUIREMENTS.md § 13.1. The whole ordered list, because `sort_order` is
 * positional — moving one item renumbers every item after it.
 *
 * INFO: This order is shared by both participants (§ 13.1.), unlike the pack order
 * of § 13.5. The other user picks it up on their next load; nothing broadcasts,
 * for the same reason § 8.4.'s channel carries `users` changes only.
 */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const params = paramsSchema.safeParse(await context.params);
  const body = orderSchema.safeParse(await request.json().catch(() => null));

  if (!params.success || !body.success) {
    return apiError("invalid_request");
  }

  if (!(await isKnownPack(params.data.id))) {
    return apiError("not_found");
  }

  // INFO: The list is stale — the other participant added or deleted an item since this screen loaded (§ 13.1.), so there is no order to write.
  if (!(await setEmoticonItemOrder(params.data.id, body.data.itemIds))) {
    return apiError("conflict");
  }

  return new NextResponse(null, { status: 204 });
}

/**
 * WARN: § 13.1. `findKnownPackIds` and deliberately not `getEmoticonPack`, which the
 * two writes above used to ask. That function is the pack **screen's** read — a
 * lateral join and a `GROUP BY` for the thumbnail and the count, plus a second query
 * for every item in the pack — and all either write needs of it is that the id names
 * a row. § 13.5.'s prefs handlers were moved off the same pattern.
 */
async function isKnownPack(packId: EmoticonPackId): Promise<boolean> {
  return (await findKnownPackIds([packId])).has(packId);
}
