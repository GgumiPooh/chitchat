import { deleteEmoticonItem } from "@/entities/emoticon";
import { getCurrentUser } from "@/shared/auth";
import { deleteObjects } from "@/shared/storage";
import { NextResponse } from "next/server";
import { z } from "zod";

const paramsSchema = z.object({ id: z.uuid() });

/**
 * INFO: REQUIREMENTS.md § 13.2. A pack whose thumbnail was this item keeps
 * existing — the FK is `ON DELETE SET NULL` and the picker falls back to the
 * pack's first item.
 *
 * WARN: An item already sent in chat is referenced by `messages.emoticon_item_id`,
 * which carries no cascade, so this answers 409 rather than letting Postgres
 * surface a foreign-key error as a 500. Deleting the item would otherwise have to
 * decide what an already-sent bubble becomes, which is § 18. #1's question.
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = paramsSchema.safeParse(await context.params);

  if (!params.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await deleteEmoticonItem(params.data.id);

  if (result.status === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (result.status === "in_use") {
    return NextResponse.json({ error: "in_use" }, { status: 409 });
  }

  // INFO: REQUIREMENTS.md § 9. Cleanup behind a row that is already gone; `deleteObjects` never throws.
  await deleteObjects(result.orphanedKeys);

  return new NextResponse(null, { status: 204 });
}
