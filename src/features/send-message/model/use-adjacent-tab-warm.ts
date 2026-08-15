"use client";

import type { Emoticon } from "@/entities/emoticon";
import { A_SECOND, runWhenIdle } from "@/shared/lib";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { RECENTS_TAB, isPackTabId } from "./emoticon-tabs";
import { toEmoticonPackItemsQuery } from "./pack-items-query";
import { warmEmoticonImages } from "./warm-emoticon-images";

// INFO: § 13.6. Far shorter than the room's own warm, because this starts from a tap rather than from a screen loading — what it is waiting out is the panel's 200ms open, not a first paint.
const ADJACENT_WARM_IDLE_DELAY = A_SECOND;

export type AdjacentTabWarmOptions = {
  /** WARN: The warm runs from the **open**, never from the room. A user who does not reach for emoticons pays nothing for the tabs beside the one they would have landed on. */
  isOpen: boolean;
  activeTab: string;
  /** The strip's own order, which is the order a swipe steps through. */
  tabIds: string[];
  /** REQUIREMENTS.md § 13.6. 최근 사용's items, which the panel already holds — the tab is ids alone and has no list of its own to fetch. */
  recents: Emoticon[];
};

/**
 * REQUIREMENTS.md § 13.6. Warms the two tabs a swipe reaches from the open one.
 *
 * INFO: The room's warm covers the tab that opens (`useEmoticonPreload`) and stops there, which left every swipe landing on a grid of skeletons — the neighbour's items had not been asked for and its images had never been seen.
 */
export function useAdjacentTabWarm({
  isOpen,
  activeTab,
  tabIds,
  recents,
}: AdjacentTabWarmOptions): void {
  const queryClient = useQueryClient();
  // WARN: A ref rather than a dependency: `recents` is a fresh array on every render, so listing it would re-schedule the warm on each one.
  const recentsRef = useRef(recents);

  useEffect(() => {
    recentsRef.current = recents;
  });

  const activeIndex = tabIds.indexOf(activeTab);
  const neighbours = [tabIds[activeIndex - 1], tabIds[activeIndex + 1]].filter(
    (tab): tab is string => tab !== undefined,
  );
  // INFO: A dependency the array identity cannot break, since `neighbours` is rebuilt every render.
  const neighbourKey = neighbours.join();

  useEffect(() => {
    if (!isOpen || activeIndex < 0) {
      return;
    }

    let isCancelled = false;
    const cancelIdle = runWhenIdle(() => void warmNeighbours(), ADJACENT_WARM_IDLE_DELAY);

    return () => {
      isCancelled = true;
      cancelIdle();
    };

    // INFO: One after the other, so the near neighbour is warm before the far one starts rather than the two interleaving at the pool's width.
    async function warmNeighbours() {
      for (const tab of neighbourKey ? neighbourKey.split(",") : []) {
        if (isCancelled) {
          return;
        }

        await warmEmoticonImages(await fetchTabItems(tab), () => isCancelled);
      }
    }

    async function fetchTabItems(tab: string): Promise<Emoticon[]> {
      if (tab === RECENTS_TAB) {
        return recentsRef.current;
      }

      // INFO: § 13.8. The search tab answers nothing until a word is typed, so it is the one neighbour with nothing to warm.
      if (!isPackTabId(tab)) {
        return [];
      }

      return queryClient.fetchQuery(toEmoticonPackItemsQuery(tab)).catch(() => []);
    }
  }, [activeIndex, isOpen, neighbourKey, queryClient]);
}
