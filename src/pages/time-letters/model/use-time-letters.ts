"use client";

import type { TimeLetter } from "@/entities/time-letter";
import type { Nullable, TimeLetterId } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useRef, useState } from "react";
import { cancelTimeLetterRequest, fetchTimeLetters } from "../api/fetch-time-letters";

export type TimeLetterFilter = "all" | "received" | "sent";

export type UseTimeLettersParams = {
  initialLetters: TimeLetter[];
  initialNextCursor?: Nullable<string>;
  initialHasMore?: boolean;
};

export function useTimeLetters({
  initialLetters,
  initialNextCursor = null,
  initialHasMore = false,
}: UseTimeLettersParams) {
  const [letters, setLetters] = useState<TimeLetter[]>(initialLetters);
  const [filter, setFilter] = useState<TimeLetterFilter>("all");
  const [cursor, setCursor] = useState<Nullable<string>>(initialNextCursor);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isFilterLoading, setIsFilterLoading] = useState<boolean>(false);
  const isLoadingRef = useRef(false);
  const filterRequestIdRef = useRef(0);

  const loadMore = useCallback(async () => {
    if (isLoadingRef.current || !hasMore || !cursor) {
      return;
    }
    isLoadingRef.current = true;
    setIsLoadingMore(true);

    try {
      const response = await fetchTimeLetters({
        filter,
        cursor,
        limit: 20,
      });

      setCursor(response.nextCursor);
      setHasMore(response.hasMore);

      if (response.items.length > 0) {
        setLetters((prev) => {
          const existing = new Set(prev.map((l) => l.id));
          const fresh = response.items.filter((l) => !existing.has(l.id));
          return [...prev, ...fresh];
        });
      }
    } catch {
      toast("편지를 더 불러오지 못했어요");
    } finally {
      isLoadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [cursor, filter, hasMore]);

  const refresh = useCallback(
    async (newFilter: TimeLetterFilter = filter) => {
      setIsRefreshing(true);
      try {
        const response = await fetchTimeLetters({
          filter: newFilter,
          limit: 20,
        });
        setLetters(response.items);
        setCursor(response.nextCursor);
        setHasMore(response.hasMore);
      } catch {
        toast("편지 목록을 새로고침하지 못했어요");
      } finally {
        setIsRefreshing(false);
      }
    },
    [filter],
  );

  const handleFilterChange = useCallback(
    async (newFilter: TimeLetterFilter) => {
      if (newFilter === filter && !isFilterLoading) {
        return;
      }
      setFilter(newFilter);
      setIsFilterLoading(true);
      const requestId = ++filterRequestIdRef.current;

      try {
        const response = await fetchTimeLetters({
          filter: newFilter,
          limit: 20,
        });
        if (requestId !== filterRequestIdRef.current) {
          return;
        }
        setLetters(response.items);
        setCursor(response.nextCursor);
        setHasMore(response.hasMore);
      } catch {
        if (requestId === filterRequestIdRef.current) {
          toast("편지 목록을 불러오지 못했어요");
        }
      } finally {
        if (requestId === filterRequestIdRef.current) {
          setIsFilterLoading(false);
        }
      }
    },
    [filter, isFilterLoading],
  );

  const cancelLetter = useCallback(async (id: TimeLetterId) => {
    try {
      await cancelTimeLetterRequest(id);
      setLetters((prev) => prev.filter((l) => l.id !== id));
      toast("편지 봉인이 취소되고 파기되었어요");
      return true;
    } catch {
      toast("편지 봉인 취소에 실패했어요");
      return false;
    }
  }, []);

  const addLetterOptimistic = useCallback((letter: TimeLetter) => {
    setLetters((prev) => [letter, ...prev.filter((l) => l.id !== letter.id)]);
  }, []);

  const updateLetterOptimistic = useCallback((letter: TimeLetter) => {
    setLetters((prev) => prev.map((l) => (l.id === letter.id ? letter : l)));
  }, []);

  return {
    letters,
    filter,
    hasMore,
    isLoadingMore,
    isRefreshing,
    isFilterLoading,
    loadMore,
    refresh,
    handleFilterChange,
    cancelLetter,
    addLetterOptimistic,
    updateLetterOptimistic,
  };
}
