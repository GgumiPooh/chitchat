import "server-only";

import { revertVocaReview } from "@/entities/voca";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { VocaCardId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

const undoSchema = z.object({
  cardId: snowflakeSchema<VocaCardId>(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const json = await request.json().catch(() => null);
  const parsed = undoSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("invalid_request");
  }

  const card = await revertVocaReview(user.id, parsed.data.cardId);
  if (!card) {
    return apiError("not_found");
  }

  return NextResponse.json({ card });
}
