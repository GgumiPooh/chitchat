import "server-only";

import { submitVocaReview, type Rating } from "@/entities/voca";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { VocaCardId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

const reviewSchema = z.object({
  cardId: snowflakeSchema<VocaCardId>(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  timeSpentMs: z.number().int().nonnegative().optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const json = await request.json().catch(() => null);
  const parsed = reviewSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("invalid_request");
  }

  const { cardId, rating, timeSpentMs } = parsed.data;

  try {
    const result = await submitVocaReview({
      userId: user.id,
      cardId,
      rating: rating as Rating,
      timeSpentMs,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[voca/review] Failed to submit review:", error);
    return apiError("not_found");
  }
}
