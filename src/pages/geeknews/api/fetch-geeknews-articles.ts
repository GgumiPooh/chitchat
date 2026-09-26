import type { GeeknewsFeedArticle } from "@/entities/geeknews";
import { request } from "@/shared/api";
import { GEEKNEWS_ARTICLES_PATH } from "@/shared/config";
import type { NewsArticleId } from "@/shared/lib";

export type FetchGeeknewsArticlesParams = {
  before?: NewsArticleId;
  limit?: number;
};

export async function fetchGeeknewsArticles({
  before,
  limit,
}: FetchGeeknewsArticlesParams = {}): Promise<GeeknewsFeedArticle[]> {
  const query = new URLSearchParams();

  if (before) {
    query.set("before", before);
  }

  if (limit !== undefined) {
    query.set("limit", String(limit));
  }

  const queryString = query.toString();
  const url = queryString ? `${GEEKNEWS_ARTICLES_PATH}?${queryString}` : GEEKNEWS_ARTICLES_PATH;

  const response = await request(url);

  if (!response.ok) {
    throw new Error(`GET ${GEEKNEWS_ARTICLES_PATH} responded ${response.status}`);
  }

  const data = (await response.json()) as {
    articles: Array<Omit<GeeknewsFeedArticle, "publishedAt"> & { publishedAt: string }>;
  };

  return data.articles.map((article) => ({
    ...article,
    publishedAt: new Date(article.publishedAt),
  }));
}
