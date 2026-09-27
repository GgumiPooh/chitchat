import "server-only";

import { recommendVocaWords } from "@/entities/voca";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const recommendSchema = z.object({
  tag: z.string().optional(),
  grade: z.enum(["essential", "core", "killer"]).optional(),
  customTopic: z.string().optional(),
  count: z.number().int().min(1).max(20).optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const json = await request.json().catch(() => ({}));
  const parsed = recommendSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("invalid_request");
  }

  const { tag, grade, customTopic, count } = parsed.data;

  try {
    const items = await recommendVocaWords({
      userId: user.id,
      tag: tag || "전체",
      grade: grade || "core",
      customTopic,
      count: count || 8,
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("[api/voca/recommend] Error generating recommendations:", error);
    return apiError("unavailable");
  }
}
