import "server-only";

import { listGeeknewsArticles } from "@/entities/geeknews";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { GEEKNEWS_PAGE_SIZE, MAX_GEEKNEWS_PAGE_SIZE, snowflakeSchema } from "@/shared/config";
import type { NewsArticleId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  before: snowflakeSchema<NewsArticleId>().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!query.success) {
    return apiError("invalid_request");
  }

  const { before, limit } = query.data;

  const articles = await listGeeknewsArticles({
    currentUserId: user.id,
    before,
    limit: Math.min(limit ?? GEEKNEWS_PAGE_SIZE, MAX_GEEKNEWS_PAGE_SIZE),
  });

  return NextResponse.json({ articles });
}
