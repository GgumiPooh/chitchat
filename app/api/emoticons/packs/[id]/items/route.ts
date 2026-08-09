import { getEmoticonPack, registerEmoticon, setEmoticonItemOrder } from "@/entities/emoticon";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { MAX_EMOTICON_KEYWORDS, MAX_EMOTICON_KEYWORD_LENGTH } from "@/shared/config";
import { NextResponse } from "next/server";
import { z } from "zod";

// WARN: REQUIREMENTS.md § 13.7.1. jandh-emoticons mirrors this handler, and the browser reaches whichever copy the switch names. Both sides change together — a fix landed here alone is one this app stops running the moment the switch is on.

const paramsSchema = z.object({ id: z.uuid() });

const orderSchema = z.object({ itemIds: z.array(z.uuid()).min(1) });

const bodySchema = z.object({
  imageKey: z.string().min(1),
  // INFO: REQUIREMENTS.md § 13.2. The image's own size, read off the decoded image in the browser — an animated one is measured from its first frame.
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  audioKey: z.string().min(1).nullish(),
  // INFO: REQUIREMENTS.md § 13.8. Bounded here so an oversized body is refused; `normalizeKeywords` is what trims, folds and deduplicates what gets through.
  keywords: z
    .array(z.string().max(MAX_EMOTICON_KEYWORD_LENGTH))
    .max(MAX_EMOTICON_KEYWORDS)
    .optional(),
});

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

  if (!(await getEmoticonPack(params.data.id, user.id))) {
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

  if (!(await getEmoticonPack(params.data.id, user.id))) {
    return apiError("not_found");
  }

  // INFO: The list is stale — the other participant added or deleted an item since this screen loaded (§ 13.1.), so there is no order to write.
  if (!(await setEmoticonItemOrder(params.data.id, body.data.itemIds))) {
    return apiError("conflict");
  }

  return new NextResponse(null, { status: 204 });
}
