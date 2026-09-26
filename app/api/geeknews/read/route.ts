import "server-only";

import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import { geeknewsReads, getDb } from "@/shared/db";
import type { NewsArticleId } from "@/shared/lib";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const readActionSchema = z.object({
  articleId: snowflakeSchema<NewsArticleId>(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const db = getDb();
  const rows = await db
    .select({ articleId: geeknewsReads.articleId })
    .from(geeknewsReads)
    .where(eq(geeknewsReads.userId, user.id));

  return NextResponse.json({ readArticleIds: rows.map((r) => r.articleId) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const body = await request.json().catch(() => null);
  const parsed = readActionSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("invalid_request");
  }

  const { articleId } = parsed.data;
  const db = getDb();

  await db
    .insert(geeknewsReads)
    .values({
      userId: user.id,
      articleId,
    })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const url = new URL(request.url);
  const queryArticleId = url.searchParams.get("articleId");
  let targetArticleId: NewsArticleId | null = null;

  if (queryArticleId) {
    const parsed = snowflakeSchema<NewsArticleId>().safeParse(queryArticleId);
    if (!parsed.success) {
      return apiError("invalid_request");
    }
    targetArticleId = parsed.data;
  } else {
    const body = await request.json().catch(() => null);
    const parsed = readActionSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalid_request");
    }
    targetArticleId = parsed.data.articleId;
  }

  const db = getDb();
  await db
    .delete(geeknewsReads)
    .where(and(eq(geeknewsReads.userId, user.id), eq(geeknewsReads.articleId, targetArticleId)));

  return NextResponse.json({ ok: true });
}
