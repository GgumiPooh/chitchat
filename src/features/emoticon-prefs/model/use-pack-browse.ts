"use client";

import type { EmoticonPackSummary } from "@/entities/emoticon";
import type { EmoticonPackId } from "@/shared/lib";
import { A_MINUTE, A_SECOND, type Nullable } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useInfiniteQuery } from "@tanstack/react-query";
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
 * REQUIREMENTS.md § 13.5. The 이모티콘그룹 검색 tab's data — the whole library, one
 * cursor page at a time, with this user's switches applied on top.
 *
 * WARN: A toggle is held here rather than written into the query cache. The key
 * carries the word that was asked, so a cache edit reaches the one page list the user
 * happens to be looking at and leaves every other word's cached answer holding the
 * switch as it was before the tap.
 */
export function usePackBrowse(query: string, onEnabledChange: () => void): PackBrowse {
  const debounced = useDebounced(query);
  const [switches, setSwitches] = useState<Record<string, boolean>>({});
  const { data, isPending, isFetchingNextPage, hasNextPage, isError, fetchNextPage } =
    useInfiniteQuery({
      queryKey: ["emoticon-pack-browse", debounced] as const,
      queryFn: ({ pageParam }) => fetchEmoticonPackPage(debounced, pageParam),
      initialPageParam: null as Nullable<string>,
      getNextPageParam: (page) => page.nextCursor,
      // INFO: The library is written from § 13.4.'s own screens, which are routes this tab is not on — so backspacing to a word already asked costs nothing.
      staleTime: A_MINUTE,
    });
  const packs = useMemo(
    () =>
      (data?.pages ?? []).flatMap((page) =>
        page.packs.map((pack) =>
          pack.id in switches ? { ...pack, isEnabled: switches[pack.id] } : pack,
        ),
      ),
    [data, switches],
  );
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
    setSwitches((current) => ({ ...current, [packId]: isEnabled }));
    // INFO: § 13.5. The other tab is seeded by the server and cannot hear this write, so it is told to re-read before it is next looked at.
    onEnabledChange();

    void saveEmoticonPackEnabled(packId, isEnabled).catch(() => {
      setSwitches((current) => ({ ...current, [packId]: !isEnabled }));
      toast.error("설정을 저장하지 못했어요");
    });
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
