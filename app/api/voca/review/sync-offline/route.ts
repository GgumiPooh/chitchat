import "server-only";

import { submitVocaReview, type Rating } from "@/entities/voca";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { VocaCardId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

const syncReviewsSchema = z.object({
  reviews: z.array(
    z.object({
      cardId: snowflakeSchema<VocaCardId>(),
      rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
      timeSpentMs: z.number().int().nonnegative().default(0),
      reviewedAt: z.string().datetime(),
    }),
  ),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const json = await request.json().catch(() => null);
  const parsed = syncReviewsSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("invalid_request");
  }

  const results = [];
  for (const item of parsed.data.reviews) {
    try {
      const result = await submitVocaReview({
        userId: user.id,
        cardId: item.cardId,
        rating: item.rating as Rating,
        timeSpentMs: item.timeSpentMs,
        now: new Date(item.reviewedAt),
      });
      results.push({ cardId: item.cardId, success: true, nextInterval: result.nextInterval });
    } catch (error) {
      console.error(`[sync-offline] Failed review for card ${item.cardId}:`, error);
      results.push({ cardId: item.cardId, success: false });
    }
  }

  return NextResponse.json({ synced: results.length, results });
}
