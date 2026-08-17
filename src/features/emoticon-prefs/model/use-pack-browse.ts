"use client";

import type { EmoticonPackPage, EmoticonPackSummary } from "@/entities/emoticon";
import type { EmoticonPackType } from "@/shared/config";
import type { EmoticonPackId } from "@/shared/lib";
import { A_MINUTE, A_SECOND, type Nullable } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { type InfiniteData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchEmoticonPackPage } from "../api/browse-packs";
import { saveEmoticonPackEnabled } from "../api/write-prefs";

/**
 * INFO: REQUIREMENTS.md § 13.9.'s figure, for its reason — a Korean field commits a
 * jamo at a time, so `고민` is typed as `ㄱ`, `고`, `곰`, `고미`, `고민` and asks once
 * rather than five times.
 */
const SEARCH_DEBOUNCE = A_SECOND / 5;

export type PackBrowse = {
  packs: EmoticonPackSummary[];
  /** Nothing to draw yet for the word currently being asked — the skeleton's condition, and the sentinel's. */
  isPending: boolean;
  isLoadingMore: boolean;
  hasFailed: boolean;
  loadMore: () => void;
  toggle: (packId: EmoticonPackId, isEnabled: boolean) => void;
};

/**
 * REQUIREMENTS.md § 13.5. The 이모티콘 묶음 검색 tab's data — the whole library, one
 * cursor page at a time.
 *
 * WARN: A toggle is written straight into every cached page for this `type`, across
 * every word already asked — not just the one the user is currently looking at, and
 * not held in component state, which a tab switch would unmount and lose.
 */
export function usePackBrowse(
  type: EmoticonPackType,
  query: string,
  onEnabledChange: () => void,
): PackBrowse {
  const debounced = useDebounced(query);
  const queryClient = useQueryClient();
  const { data, isPending, isFetchingNextPage, hasNextPage, isError, fetchNextPage } =
    useInfiniteQuery({
      // WARN: § 13. The kind is part of the key. Shared, the two screens would page each other's cursors — the cursor is a position in one kind's ordering and means nothing in the other's.
      queryKey: ["emoticon-pack-browse", type, debounced] as const,
      queryFn: ({ pageParam }) => fetchEmoticonPackPage(type, debounced, pageParam),
      initialPageParam: null as Nullable<string>,
      getNextPageParam: (page) => page.nextCursor,
      // INFO: The library is written from § 13.4.'s own screens, which are routes this tab is not on — so backspacing to a word already asked costs nothing.
      staleTime: A_MINUTE,
    });
  const packs = useMemo(() => (data?.pages ?? []).flatMap((page) => page.packs), [data]);
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    packs,
    isPending,
    isLoadingMore: isFetchingNextPage,
    hasFailed: isError,
    loadMore,
    toggle,
  };

  function toggle(packId: EmoticonPackId, isEnabled: boolean) {
    setCachedEnabled(packId, isEnabled);
    // INFO: § 13.5. The other tab is seeded by the server and cannot hear this write, so it is told to re-read before it is next looked at.
    onEnabledChange();

    void saveEmoticonPackEnabled(packId, isEnabled).catch(() => {
      setCachedEnabled(packId, !isEnabled);
      toast.error("설정을 저장하지 못했어요");
    });
  }

  function setCachedEnabled(packId: EmoticonPackId, isEnabled: boolean) {
    queryClient.setQueriesData<InfiniteData<EmoticonPackPage>>(
      { queryKey: ["emoticon-pack-browse", type] },
      (data) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            packs: page.packs.map((pack) => (pack.id === packId ? { ...pack, isEnabled } : pack)),
          })),
        },
    );
  }
}

/** INFO: The field is the source and this trails it, so a keystroke is drawn immediately and asked for once. */
function useDebounced(query: string): string {
  const [settled, setSettled] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(query.trim()), SEARCH_DEBOUNCE);

    return () => clearTimeout(timer);
  }, [query]);

  return settled;
}
