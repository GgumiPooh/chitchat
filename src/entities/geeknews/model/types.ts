import type { NewsArticleId } from "@/shared/lib";

export type GeeknewsFeedArticle = {
  geeknewsId: string;
  title: string;
  url: string;
  geeknewsUrl: string;
  summary: string;
  publishedAt: Date;
  isRead: boolean;
  id: NewsArticleId;
};
