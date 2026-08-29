"use client";

import type { Emoticon, EmoticonPackSummary } from "@/entities/emoticon";
import { useQueries } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toEmoticonPackItemsQuery } from "./pack-items-query";

// INFO: § 13.6. Enough packs to fill the first screen of the 전체 tab, so the sentinel below the last one is what asks for the rest.
const INITIAL_PACK_COUNT = 3;

const PACKS_PER_LOAD = 2;

export type AllPackSection = {
  pack: EmoticonPackSummary;
  items: Emoticon[];
  isPending: boolean;
};

export type AllPackSections = {
  sections: AllPackSection[];
  /**
   * Whether the sentinel that asks for the next packs should be drawn.
   *
   * WARN: False while any loaded pack is still pending, not only once every pack is in. A sentinel over sections that have not landed sits at the top of an empty tab, and an observer that fires on mount would walk the whole library in before one picture had arrived.
   */
  hasMore: boolean;
  loadMore: () => void;
};

/**
 * REQUIREMENTS.md § 13.6. The 전체 tab's sections — one per pack, in the user's order —
 * with a pack's items requested only once the reader has scrolled to it.
 *
 * WARN: Never every pack at once. § 13.6.'s warm refuses to fetch the library in the background of one open, and this tab is not the way around it.
 */
export function useAllPackSections(
  packs: EmoticonPackSummary[],
  isActive: boolean,
): AllPackSections {
  const [loadedCount, setLoadedCount] = useState(INITIAL_PACK_COUNT);
  const [wasActive, setWasActive] = useState(isActive);

  // WARN: Reset on leaving rather than kept, or a tab scrolled fifteen packs deep reopens — on either menu, since one instance serves both — with fifteen list requests at once.
  if (wasActive !== isActive) {
    setWasActive(isActive);
    setLoadedCount(INITIAL_PACK_COUNT);
  }

  const loadedPacks = isActive ? packs.slice(0, loadedCount) : [];

  const queries = useQueries({
    queries: loadedPacks.map((pack) => toEmoticonPackItemsQuery(pack.id)),
  });

  const loadMore = useCallback(() => {
    setLoadedCount((count) => count + PACKS_PER_LOAD);
  }, []);

  const sections = loadedPacks.map((pack, index) => ({
    pack,
    items: queries[index]?.data ?? [],
    isPending: queries[index]?.isPending ?? true,
  }));

  return {
    sections,
    hasMore:
      isActive && loadedCount < packs.length && sections.every((section) => !section.isPending),
    loadMore,
  };
}
