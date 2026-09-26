import "server-only";

import { GEEKNEWS_PAGE_SIZE } from "@/shared/config";
import { geeknewsArticles, geeknewsReads, getDb } from "@/shared/db";
import type { NewsArticleId, UserId } from "@/shared/lib";
import { and, desc, eq, lt, or, type SQL } from "drizzle-orm";
import type { GeeknewsFeedArticle } from "../model/types";

export type ListGeeknewsArticlesParams = {
  currentUserId: UserId;
  limit?: number;
  before?: NewsArticleId;
};

export async function listGeeknewsArticles(
  paramsOrUserId: ListGeeknewsArticlesParams | UserId,
  maybeLimit?: number,
): Promise<GeeknewsFeedArticle[]> {
  const {
    currentUserId,
    limit = GEEKNEWS_PAGE_SIZE,
    before,
  }: ListGeeknewsArticlesParams = typeof paramsOrUserId === "string"
    ? { currentUserId: paramsOrUserId, limit: maybeLimit }
    : paramsOrUserId;

  const db = getDb();

  let beforeCondition: SQL | undefined = undefined;
  if (before) {
    const [target] = await db
      .select({ publishedAt: geeknewsArticles.publishedAt })
      .from(geeknewsArticles)
      .where(eq(geeknewsArticles.id, before))
      .limit(1);

    if (!target) {
      return [];
    }

    beforeCondition = or(
      lt(geeknewsArticles.publishedAt, target.publishedAt),
      and(eq(geeknewsArticles.publishedAt, target.publishedAt), lt(geeknewsArticles.id, before)),
    );
  }

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
    .where(beforeCondition)
    .orderBy(desc(geeknewsArticles.publishedAt), desc(geeknewsArticles.id))
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
