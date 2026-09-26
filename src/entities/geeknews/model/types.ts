import type { NewsArticleId, Nullable } from "@/shared/lib";

export type GeeknewsFeedArticle = {
  geeknewsId: string;
  title: string;
  url: string;
  sourceUrl: Nullable<string>;
  summary: string;
  publishedAt: Date;
  isRead: boolean;
  id: NewsArticleId;
};
