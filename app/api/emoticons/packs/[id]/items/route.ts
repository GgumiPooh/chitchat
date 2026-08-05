import { getEmoticonPack, registerEmoticon, setEmoticonItemOrder } from "@/entities/emoticon";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const paramsSchema = z.object({ id: z.uuid() });

const orderSchema = z.object({ itemIds: z.array(z.uuid()).min(1) });

const bodySchema = z.object({
  stillKey: z.string().min(1),
  // INFO: REQUIREMENTS.md § 13.2. The still's own size, read off the decoded image in the browser. The animation shares this box rather than measuring its own.
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  animatedKey: z.string().min(1).nullish(),
  audioKey: z.string().min(1).nullish(),
});

/**
 * Registers an item whose objects the browser has already uploaded (§ 13.3.).
 * Until this succeeds they are unreachable — nothing in the app addresses R2 by
 * key, only through `GET /api/emoticons/items/{id}/asset`.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!params.success || !body.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!(await getEmoticonPack(params.data.id, user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const emoticon = await registerEmoticon({
    packId: params.data.id,
    uploaderId: user.id,
    ...body.data,
  });

  // INFO: An object is missing, or its stored type or size failed § 14., or a key was not this uploader's to claim. Either way there is nothing to write a row for.
  if (!emoticon) {
    return NextResponse.json({ error: "unprocessable" }, { status: 422 });
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
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = paramsSchema.safeParse(await context.params);
  const body = orderSchema.safeParse(await request.json().catch(() => null));

  if (!params.success || !body.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!(await getEmoticonPack(params.data.id, user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // INFO: The list is stale — the other participant added or deleted an item since this screen loaded (§ 13.1.), so there is no order to write.
  if (!(await setEmoticonItemOrder(params.data.id, body.data.itemIds))) {
    return NextResponse.json({ error: "conflict" }, { status: 409 });
  }

  return new NextResponse(null, { status: 204 });
}
