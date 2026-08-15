"use client";

import type { Emoticon } from "@/entities/emoticon";
import { A_SECOND, runWhenIdle } from "@/shared/lib";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { RECENTS_TAB, isPackTabId } from "./emoticon-tabs";
import { toEmoticonPackItemsQuery } from "./pack-items-query";
import { MAX_DECODED_DISTANCE, warmEmoticonImages, warmEmoticonUrls } from "./warm-emoticon-images";

// INFO: § 13.6. Far shorter than the room's own warm, because this starts from a tap rather than from a screen loading — what it is waiting out is the panel's 200ms open, not a first paint.
const OUTWARD_WARM_IDLE_DELAY = A_SECOND;

/**
 * How many tabs out from the open one the walk goes before it stops.
 *
 * INFO: § 13.6. Wider than the strip is today — nineteen enabled packs, so twenty-one tabs — which makes this "all of them, nearest first" for the library as it stands, at roughly 8.5MB of stills once per browser per § 13.3. cache window.
 * WARN: A bound all the same, and it must stay one. § 13.5. puts no ceiling on packs, so what this refuses is a library that has grown an order of magnitude being fetched entirely in the background of one panel open.
 * INFO: Past the retention cap a warmed tab is evicted from the map but its bytes stay in the browser's own cache, so the far end of this walk is a disk read rather than a round trip — which the deferred skeleton covers.
 */
const MAX_WARM_DISTANCE = 15;

export type OutwardTabWarmOptions = {
  /** WARN: The warm runs from the **open**, never from the room. A user who does not reach for emoticons pays nothing for the tabs beside the one they would have landed on. */
  isOpen: boolean;
  activeTab: string;
  /** The strip's own order, which is the order a swipe steps through. */
  tabIds: string[];
  /** REQUIREMENTS.md § 13.6. 최근 사용's items, which the panel already holds — the tab is ids alone and has no list of its own to fetch. */
  recents: Emoticon[];
  /** § 13.6. The strip's own thumbnails, one per pack. Warmed before the walk, since the whole row is on screen from the moment the panel is. */
  tabThumbnailUrls: string[];
};

/**
 * REQUIREMENTS.md § 13.6. Warms outward from the open tab — the tab itself, then the
 * two a swipe reaches, then the two past those, each pair starting only once the pair
 * before it has finished.
 *
 * INFO: The room's warm covers the tab that opens (`useEmoticonPreload`) and stops there, which left every swipe landing on a grid of skeletons — the neighbour's items had not been asked for and its images had never been seen.
 */
export function useOutwardTabWarm({
  isOpen,
  activeTab,
  tabIds,
  recents,
  tabThumbnailUrls,
}: OutwardTabWarmOptions): void {
  const queryClient = useQueryClient();
  // WARN: A ref rather than a dependency: `recents` is a fresh array on every render, so listing it would re-schedule the warm on each one.
  const recentsRef = useRef(recents);

  useEffect(() => {
    recentsRef.current = recents;
  });

  const activeIndex = tabIds.indexOf(activeTab);
  // INFO: A dependency the array identity cannot break, since `tabIds` is rebuilt every render.
  const tabKey = tabIds.join();
  // INFO: A dependency the array identity cannot break, as `tabKey` is.
  const thumbnailKey = tabThumbnailUrls.join();
  // WARN: A dependency because 최근 사용 has no request of its own to wait on here — read once from the ref a second after the open, an unresolved list warms nothing and nothing would ever ask again.
  const recentsCount = recents.length;

  useEffect(() => {
    if (!isOpen || activeIndex < 0) {
      return;
    }

    let isCancelled = false;
    const cancelIdle = runWhenIdle(() => void warmOutward(), OUTWARD_WARM_IDLE_DELAY);

    return () => {
      isCancelled = true;
      cancelIdle();
    };

    /**
     * WARN: Strictly one tab at a time, and the awaits are the whole design. Started together they would interleave at the pool's width and the tab one swipe away would finish behind a tab four away — the near ones are what a gesture reaches first, so they have to be warm first.
     * WARN: The walk restarts from wherever the reader lands, since a tab change re-runs this effect. What was already warmed is skipped by `warmImage` on the URL, so re-centring costs the list lookups and nothing else.
     */
    async function warmOutward() {
      const tabs = tabKey.split(",");

      // INFO: § 13.6. Before the walk and decoded, because the whole strip is on screen for as long as the panel is — a thumbnail arriving late is a row of empty plates under the reader's thumb, where a cold *tab* is at least a place they have not gone yet.
      await warmEmoticonUrls(thumbnailKey ? thumbnailKey.split(",") : [], () => isCancelled, true);
      for (let distance = 0; distance <= MAX_WARM_DISTANCE; distance++) {
        for (const tab of toTabsAtDistance(tabs, distance)) {
          if (isCancelled) {
            return;
          }

          await warmEmoticonImages(
            await fetchTabItems(tab),
            () => isCancelled,
            distance <= MAX_DECODED_DISTANCE,
          );
        }
      }
    }

    // INFO: Both sides of the active tab, and the one tab itself at zero — warming where the reader already is costs nothing it has not fetched and is what keeps it at the head of the retention order.
    function toTabsAtDistance(tabs: string[], distance: number): string[] {
      const sides = distance === 0 ? [0] : [-distance, distance];

      return sides
        .map((offset) => tabs[activeIndex + offset])
        .filter((tab): tab is string => tab !== undefined);
    }

    async function fetchTabItems(tab: string): Promise<Emoticon[]> {
      if (tab === RECENTS_TAB) {
        return recentsRef.current;
      }

      // INFO: § 13.8. The search tab answers nothing until a word is typed, so it is the one tab with nothing to warm.
      if (!isPackTabId(tab)) {
        return [];
      }

      return queryClient.fetchQuery(toEmoticonPackItemsQuery(tab)).catch(() => []);
    }
  }, [activeIndex, isOpen, queryClient, recentsCount, tabKey, thumbnailKey]);
}
