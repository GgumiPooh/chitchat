import { toggleReaction } from "@/entities/message";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { EmoticonItemId, MessageId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

const idSchema = snowflakeSchema<MessageId>();
const bodySchema = z.discriminatedUnion("reactionType", [
  z.object({
    reactionType: z.literal("emoji"),
    emoji: z.string().min(1).max(32),
  }),
  z.object({
    reactionType: z.literal("emoticon"),
    emoticonItemId: snowflakeSchema<EmoticonItemId>(),
  }),
]);

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const id = idSchema.safeParse((await params).id);
  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!id.success || !body.success) {
    return apiError("invalid_request");
  }

  const result = await toggleReaction(id.data, user.id, body.data);

  return NextResponse.json(result);
}
