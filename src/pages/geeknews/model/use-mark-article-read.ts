"use client";

import { request } from "@/shared/api";
import type { NewsArticleId } from "@/shared/lib";
import { useCallback } from "react";

export function useMarkArticleRead() {
  const markArticleRead = useCallback(async (articleId: NewsArticleId): Promise<boolean> => {
    try {
      const response = await request("/api/geeknews/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  return Object.assign(markArticleRead, {
    markArticleRead,
    markRead: markArticleRead,
  });
}
