"use client";

import type { VocaCard } from "@/entities/voca";
import type { VocaCardId } from "@/shared/lib";
import { useCallback, useEffect, useRef, useState } from "react";

export type UseVocaCardsOptions = {
  initialCards?: VocaCard[];
  initialNextCursor?: VocaCardId | null;
  initialHasMore?: boolean;
};

export function useVocaCards({
  initialCards = [],
  initialNextCursor = null,
  initialHasMore = false,
}: UseVocaCardsOptions = {}) {
  const [cards, setCards] = useState<VocaCard[]>(initialCards);
  const [nextCursor, setNextCursor] = useState<VocaCardId | null>(initialNextCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("");

  const isFirstRender = useRef(true);

  const fetchCards = useCallback(
    async (cursor: VocaCardId | null, isRefresh: boolean) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (cursor && !isRefresh) {
          params.set("before", cursor);
        }
        if (search.trim()) {
          params.set("query", search.trim());
        }
        if (stateFilter === "suspended") {
          params.set("suspended", "true");
        } else if (stateFilter !== "all") {
          params.set("state", stateFilter);
          params.set("suspended", "false");
        }
        if (tagFilter.trim()) {
          params.set("tag", tagFilter.trim());
        }
        params.set("limit", "30");

        const res = await fetch(`/api/voca/cards?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Failed to fetch cards: ${res.status}`);
        }

        const data = await res.json();
        setCards((prev) => (isRefresh ? data.items : [...prev, ...data.items]));
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
      } catch (err) {
        console.error("[useVocaCards] Fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [search, stateFilter, tagFilter],
  );

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore || !nextCursor) {
      return;
    }
    await fetchCards(nextCursor, false);
  }, [isLoading, hasMore, nextCursor, fetchCards]);

  const refresh = useCallback(async () => {
    await fetchCards(null, true);
  }, [fetchCards]);

  // Re-fetch when filter or search changes
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      void fetchCards(null, true);
    }, 250);

    return () => clearTimeout(timer);
  }, [search, stateFilter, tagFilter, fetchCards]);

  const updateCardLocally = useCallback((updated: VocaCard) => {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }, []);

  const removeCardLocally = useCallback((id: VocaCardId) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return {
    cards,
    isLoading,
    hasMore,
    search,
    stateFilter,
    tagFilter,
    setSearch,
    setStateFilter,
    setTagFilter,
    loadMore,
    refresh,
    updateCardLocally,
    removeCardLocally,
  };
}
