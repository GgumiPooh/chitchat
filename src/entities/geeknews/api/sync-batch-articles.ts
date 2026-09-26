import "server-only";

import { geeknewsArticles, getDb, nextSnowflake, type GeeknewsArticle } from "@/shared/db";
import { type NewsArticleId } from "@/shared/lib";
import { count, eq, inArray } from "drizzle-orm";

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
 * Resolves the real external article URL from the GeekNews topic page.
 *
 * GeekNews's RSS feed only carries `https://news.hada.io/topic?id=...`.
 * For link-type topics, the real source URL (e.g. bloomberg, github) lives inside
 * `<a class="... topic-title-link" href="...">`. For self-posts, returns null.
 */
async function fetchOriginalUrl(geeknewsId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://news.hada.io/topic?id=${geeknewsId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return null;
    }
    const html = await res.text();
    const match =
      html.match(/<a\s+[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*topic-title-link/i) ||
      html.match(/class=["'][^"']*topic-title-link[^"']*["'][^>]*href=["']([^"']+)["']/i);
    if (!match) {
      return null;
    }
    const rawUrl = match[1]?.trim();
    if (!rawUrl) {
      return null;
    }
    if (rawUrl.startsWith("/")) {
      return `https://news.hada.io${rawUrl}`;
    }
    return rawUrl;
  } catch {
    return null;
  }
}

/**
 * Syncs a batch of parsed GeekNews articles into PostgreSQL.
 *
 * Deduplicates by `geeknews_id`. If the database is currently empty (initial run),
 * inserts all incoming articles as backfill and reports `isInitialBackfill: true`.
 * Resolves the genuine external article URL (Bloomberg, GitHub, etc.) from the topic page
 * so "원문 기사 읽기" points to the real source rather than the discussion page.
 * Also self-heals any existing articles whose stored `url` equals their `geeknews_url`.
 */
export async function syncBatchArticles(
  articles: IngestArticleInput[],
): Promise<SyncArticlesResult> {
  const db = getDb();

  // INFO: Self-heal stored rows whose `url` was previously set to `geeknews_url`.
  const unlinkedExisting = await db
    .select({
      id: geeknewsArticles.id,
      geeknewsId: geeknewsArticles.geeknewsId,
      url: geeknewsArticles.url,
      geeknewsUrl: geeknewsArticles.geeknewsUrl,
    })
    .from(geeknewsArticles)
    .where(eq(geeknewsArticles.url, geeknewsArticles.geeknewsUrl))
    .limit(50);

  if (unlinkedExisting.length > 0) {
    await Promise.all(
      unlinkedExisting.map(async (row) => {
        const fetchedUrl = await fetchOriginalUrl(row.geeknewsId);
        if (fetchedUrl && fetchedUrl !== row.geeknewsUrl) {
          await db
            .update(geeknewsArticles)
            .set({ url: fetchedUrl })
            .where(eq(geeknewsArticles.id, row.id));
        }
      }),
    );
  }

  if (articles.length === 0) {
    return { inserted: [], isInitialBackfill: false };
  }

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

  const resolvedCandidates = await Promise.all(
    sortedCandidates.map(async (item) => {
      const geeknewsUrl = item.geeknewsUrl || `https://news.hada.io/topic?id=${item.geeknewsId}`;
      let resolvedUrl = item.url;
      if (!resolvedUrl || resolvedUrl === geeknewsUrl) {
        const fetchedUrl = await fetchOriginalUrl(item.geeknewsId);
        if (fetchedUrl) {
          resolvedUrl = fetchedUrl;
        }
      }
      return {
        ...item,
        url: resolvedUrl || geeknewsUrl,
        geeknewsUrl,
      };
    }),
  );

  const rowsToInsert = resolvedCandidates.map((item) => {
    const title = stripHtmlAndCdata(item.title);
    const summary = stripHtmlAndCdata(item.summary);
    const publishedAt = new Date(item.publishedAt);

    return {
      id: nextSnowflake<NewsArticleId>(),
      geeknewsId: item.geeknewsId,
      title,
      url: item.url,
      geeknewsUrl: item.geeknewsUrl,
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
