import "server-only";

import { geeknewsArticles, geeknewsReads, getDb } from "@/shared/db";
import type { UserId } from "@/shared/lib";
import { and, desc, eq } from "drizzle-orm";
import type { GeeknewsFeedArticle } from "../model/types";

export async function listGeeknewsArticles(
  currentUserId: UserId,
  limit = 50,
): Promise<GeeknewsFeedArticle[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: geeknewsArticles.id,
      geeknewsId: geeknewsArticles.geeknewsId,
      title: geeknewsArticles.title,
      url: geeknewsArticles.url,
      geeknewsUrl: geeknewsArticles.geeknewsUrl,
      summary: geeknewsArticles.summary,
      publishedAt: geeknewsArticles.publishedAt,
      readArticleId: geeknewsReads.articleId,
    })
    .from(geeknewsArticles)
    .leftJoin(
      geeknewsReads,
      and(
        eq(geeknewsReads.articleId, geeknewsArticles.id),
        eq(geeknewsReads.userId, currentUserId),
      ),
    )
    .orderBy(desc(geeknewsArticles.publishedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    geeknewsId: row.geeknewsId,
    title: row.title,
    url: row.url,
    geeknewsUrl: row.geeknewsUrl,
    summary: row.summary,
    publishedAt: row.publishedAt,
    isRead: row.readArticleId !== null,
  }));
}
