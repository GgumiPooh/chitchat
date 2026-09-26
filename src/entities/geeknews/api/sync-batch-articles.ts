import "server-only";

import { geeknewsArticles, getDb, nextSnowflake, type GeeknewsArticle } from "@/shared/db";
import { type NewsArticleId } from "@/shared/lib";
import { count, inArray } from "drizzle-orm";

export type IngestArticleInput = {
  geeknewsId: string;
  title: string;
  url: string;
  geeknewsUrl: string;
  summary: string;
  publishedAt: string;
};

export type SyncArticlesResult = {
  inserted: GeeknewsArticle[];
  isInitialBackfill: boolean;
};

function stripHtmlAndCdata(text: string): string {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/<[^>]*>?/gm, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Syncs a batch of parsed GeekNews articles into PostgreSQL.
 *
 * Deduplicates by `geeknews_id`. If the database is currently empty (initial run),
 * inserts all incoming articles as backfill and reports `isInitialBackfill: true`.
 * Returns the newly inserted articles for caller orchestration (e.g. push notification dispatch).
 */
export async function syncBatchArticles(
  articles: IngestArticleInput[],
): Promise<SyncArticlesResult> {
  if (articles.length === 0) {
    return { inserted: [], isInitialBackfill: false };
  }

  const db = getDb();
  const candidateIds = articles.map((a) => a.geeknewsId);

  const existingRows = await db
    .select({ geeknewsId: geeknewsArticles.geeknewsId })
    .from(geeknewsArticles)
    .where(inArray(geeknewsArticles.geeknewsId, candidateIds));

  const existingSet = new Set(existingRows.map((r) => r.geeknewsId));
  const newCandidates = articles.filter((a) => !existingSet.has(a.geeknewsId));

  if (newCandidates.length === 0) {
    return { inserted: [], isInitialBackfill: false };
  }

  const [countRow] = await db.select({ total: count() }).from(geeknewsArticles);
  const isInitialBackfill = (countRow?.total ?? 0) === 0;

  // INFO: Sort chronologically ascending so snowflake IDs order naturally with publication time.
  const sortedCandidates = [...newCandidates].sort(
    (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
  );

  const rowsToInsert = sortedCandidates.map((item) => {
    const title = stripHtmlAndCdata(item.title);
    const summary = stripHtmlAndCdata(item.summary);
    const geeknewsUrl = item.geeknewsUrl || `https://news.hada.io/topic?id=${item.geeknewsId}`;
    const url = item.url || geeknewsUrl;
    const publishedAt = new Date(item.publishedAt);

    return {
      id: nextSnowflake<NewsArticleId>(),
      geeknewsId: item.geeknewsId,
      title,
      url,
      geeknewsUrl,
      summary,
      publishedAt: isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
    };
  });

  const inserted = await db
    .insert(geeknewsArticles)
    .values(rowsToInsert)
    .onConflictDoNothing({ target: geeknewsArticles.geeknewsId })
    .returning();

  return { inserted, isInitialBackfill };
}
