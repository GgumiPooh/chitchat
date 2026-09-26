"use client";

import type { GeeknewsFeedArticle } from "@/entities/geeknews";
import { GEEKNEWS_PAGE_SIZE } from "@/shared/config";
import { toast } from "@/shared/ui";
import { useCallback, useRef, useState } from "react";
import { fetchGeeknewsArticles } from "../api/fetch-geeknews-articles";

export type GeeknewsArticlesResult = {
  articles: GeeknewsFeedArticle[];
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
};

export function useGeeknewsArticles(
  initialArticles: GeeknewsFeedArticle[],
): GeeknewsArticlesResult {
  const [articles, setArticles] = useState(initialArticles);
  const [prevInitialArticles, setPrevInitialArticles] = useState(initialArticles);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => initialArticles.length >= GEEKNEWS_PAGE_SIZE);

  const isLoadingRef = useRef(false);

  if (prevInitialArticles !== initialArticles) {
    setPrevInitialArticles(initialArticles);
    setArticles(initialArticles);
    setHasMore(initialArticles.length >= GEEKNEWS_PAGE_SIZE);
  }

  const loadMore = useCallback(async () => {
    const oldest = articles.at(-1);

    if (isLoadingRef.current || !hasMore || !oldest) {
      return;
    }

    isLoadingRef.current = true;
    setIsLoadingMore(true);

    try {
      const older = await fetchGeeknewsArticles({
        before: oldest.id,
        limit: GEEKNEWS_PAGE_SIZE,
      });

      setHasMore(older.length >= GEEKNEWS_PAGE_SIZE);

      if (older.length > 0) {
        setArticles((prev) => {
          const existingIds = new Set(prev.map((a) => a.id));
          const newItems = older.filter((a) => !existingIds.has(a.id));
          return newItems.length > 0 ? [...prev, ...newItems] : prev;
        });
      }
    } catch {
      toast("기사를 더 불러오지 못했어요");
    } finally {
      isLoadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [articles, hasMore]);

  return {
    articles,
    isLoadingMore,
    hasMore,
    loadMore,
  };
}
