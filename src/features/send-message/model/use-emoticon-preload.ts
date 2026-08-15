"use client";

import type { Emoticon, EmoticonPackSummary } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { A_MINUTE, A_SECOND, mapPooled, runWhenIdle } from "@/shared/lib";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useStorageState } from "synced-storage/react";
import { ACTIVE_TAB_KEY, RECENTS_TAB, isPackTabId } from "./emoticon-tabs";
import { toEmoticonsByIdsQuery } from "./emoticons-query";
import { toEmoticonKeywordsQuery } from "./keywords-query";
import { toEmoticonPackItemsQuery } from "./pack-items-query";
import { toEmoticonPacksQuery } from "./packs-query";
import { useRecentEmoticons } from "./use-recent-emoticons";

// INFO: REQUIREMENTS.md § 13.6. Wide enough that a pack is warm in a few round trips, narrow enough that the § 13.3. route is not handed the whole library at once — each hit is a session check, an item read and a presign.
// WARN: This is not what keeps the conversation's own images ahead of the warm. Over HTTP/2 there is one connection and no queue to be at the front of; `fetchPriority` is the mechanism, and `warmImage` is where it is set.
const PRELOAD_CONCURRENCY = 4;

// INFO: § 13.6. The warm covers the one tab that will open rather than the library, so this is a guard against an unusually large pack rather than the ceiling it used to be — a hand-authored pack is a few dozen items and never reaches it. Past it a cell is loaded by being scrolled to, which is what every cell did before the warm existed.
const MAX_PRELOADED_EMOTICONS = 120;

// INFO: The ceiling the idle callback is given, and the whole delay where there is none — iOS Safari only shipped `requestIdleCallback` in 17, and the packs may as well warm a second late there as never.
const PRELOAD_IDLE_DELAY = 2 * A_SECOND;

// INFO: How long a warmed list is taken on trust, so walking between tabs does not re-ask for it on every return to the room. Longer than it was, because the list is summaries now — an edit to a pack's items does not change it, only § 13.5.'s own screens do.
const PRELOAD_STALE_TIME = 5 * A_MINUTE;

/**
 * REQUIREMENTS.md § 13.6. Warms the panel's first open — the pack list, then the
 * items and images of the one tab that open will land on.
 *
 * WARN: § 8.3. Deferred to an idle callback rather than started on mount. Both halves compete with the conversation for exactly the wrong frames otherwise: the list is one more round trip against a room already making several, and a pack of images is decode work landing while the first screenful of bubbles is still being measured.
 * WARN: This is what withdrew "a user who never opens the panel never fetches the packs". The cost is one list request, one tab's items and one tab's images per visit to the room, spent on an affordance one tap from the composer — against a first open that showed an empty panel for a round trip and then filled in cell by cell.
 */
export function useEmoticonPreload(): void {
  const queryClient = useQueryClient();
  // INFO: § 13.6. The same storage the panel reopens on, so the warm heats the tab that will actually be drawn rather than a guess at it.
  const [storedTab] = useStorageState<string>(ACTIVE_TAB_KEY, RECENTS_TAB, {
    strategy: "localStorage",
  });
  const { recentIds } = useRecentEmoticons();
  /**
   * WARN: Held in a ref rather than listed as a dependency, and both halves of that
   * matter. `recentIds` is a fresh array every render, so a dependency would
   * re-schedule the warm on each one; and read at *setup* instead of inside the
   * callback, `storedTab` is still the hydration fallback — the trap the panel
   * documents on its own `useStorageState`. The idle callback lands well after both
   * have settled.
   */
  const openingTabRef = useRef({ storedTab, recentIds });

  useEffect(() => {
    openingTabRef.current = { storedTab, recentIds };
  });

  useEffect(() => {
    let isCancelled = false;
    const cancelIdle = runWhenIdle(() => void warmOpeningTab(), PRELOAD_IDLE_DELAY);

    return () => {
      isCancelled = true;
      cancelIdle();
    };

    async function warmOpeningTab() {
      // WARN: § 13.8. The composer's underline is fed from here rather than from a query of its own, and this callback is the whole reason. `MessageComposer` mounts with the room, so asking there put `?keywords=1` on every room entry — the moment this hook exists to keep clear.
      // INFO: `prefetchQuery`, unlike the list below — nothing here is chosen against the answer, and the composer reads it out of the cache whenever it lands.
      void queryClient.prefetchQuery(toEmoticonKeywordsQuery());

      // INFO: `fetchQuery` rather than `prefetchQuery` — the tab below is chosen against this answer, and a prefetch answers nothing.
      // WARN: The `staleTime` is the preload's alone and must not move onto the descriptor. Leaving the room and coming back remounts this, and at the descriptor's own `0` — declared explicitly there, against `getQueryClient`'s minute — every return would re-ask for a list nothing has changed; the panel keeps that `0` deliberately, since its mount is the moment § 13.5. edits have to land.
      const packs = await queryClient
        .fetchQuery({ ...toEmoticonPacksQuery(), staleTime: PRELOAD_STALE_TIME })
        .catch(() => []);

      if (isCancelled) {
        return;
      }

      const items = await fetchOpeningTabItems(packs);

      if (isCancelled) {
        return;
      }

      const urls = items
        .slice(0, MAX_PRELOADED_EMOTICONS)
        .map((item) => toEmoticonAssetUrl(item.id, "still-image", item.version));

      // INFO: Every task resolves (`warmImage`), so one asset the § 13.3. route refuses cannot stop the queue on the rest of the tab.
      await mapPooled(urls, (url) => (isCancelled ? Promise.resolve() : warmImage(url)), {
        limit: PRELOAD_CONCURRENCY,
      });
    }

    /**
     * INFO: § 13.6. The panel falls back to 최근 사용 when the remembered pack has
     * been deleted or hidden since, and this has to make the same choice — warming
     * the pack the panel resolves away from heats a tab that never opens and leaves
     * the one that does cold.
     */
    async function fetchOpeningTabItems(packs: EmoticonPackSummary[]): Promise<Emoticon[]> {
      const { storedTab: tab, recentIds: ids } = openingTabRef.current;

      if (isPackTabId(tab) && packs.some((pack) => pack.id === tab && pack.isEnabled)) {
        return queryClient.fetchQuery(toEmoticonPackItemsQuery(tab)).catch(() => []);
      }

      // INFO: § 13.8. The search tab is never remembered, so it is not a case here — an empty 최근 사용 is, and it has nothing to ask for.
      if (ids.length === 0) {
        return [];
      }

      return queryClient.fetchQuery(toEmoticonsByIdsQuery(ids)).catch(() => []);
    }
  }, [queryClient]);
}

/**
 * WARN: Never rejects, for `mapPooled`'s reason — and never clears `src` on the way
 * out either. An empty source resolves against the document URL and the element
 * fetches the page itself as an image, which is the trap `stopSound` documents.
 *
 * WARN: `fetchPriority` is what actually keeps this behind the conversation. The whole app is one HTTP/2 connection, so a narrow pool only limits how many requests are outstanding — it does not put the room's own images in front of them. An out-of-DOM `new Image()` is dispatched at default priority without this.
 *
 * WARN: The loaded element is **held**, and dropping it is what left the panel opening on skeletons — a released `Image` takes the resource out of the memory cache with it, so a warm the network never repeated still cost the cell a disk read and a decode, both asynchronous and both after `PreloadImage` had already committed its placeholder.
 */
function warmImage(url: string): Promise<void> {
  if (warmedImages.has(url)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      retainWarmedImage(url, image);
      resolve();
    };
    image.onerror = () => resolve();
    image.decoding = "async";
    image.fetchPriority = "low";
    image.src = url;
  });
}

// INFO: § 13.6. Two tabs' worth, so walking to a pack and back does not evict the one the panel will reopen on.
const MAX_WARMED_IMAGES = 2 * MAX_PRELOADED_EMOTICONS;

const warmedImages = new Map<string, HTMLImageElement>();

// WARN: Eviction is insertion order, which is the oldest warm only because `warmImage` returns early on a URL already held — re-inserting one would move it to the end and evict a tab still in use instead.
function retainWarmedImage(url: string, image: HTMLImageElement): void {
  warmedImages.set(url, image);

  while (warmedImages.size > MAX_WARMED_IMAGES) {
    const oldest = warmedImages.keys().next().value;

    if (oldest === undefined) {
      return;
    }

    warmedImages.delete(oldest);
  }
}
