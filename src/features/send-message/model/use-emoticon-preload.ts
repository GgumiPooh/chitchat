"use client";

import type { Emoticon, EmoticonPackSummary } from "@/entities/emoticon";
import type { EmoticonPackType } from "@/shared/config";
import { A_MINUTE, A_SECOND, runWhenIdle } from "@/shared/lib";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useStorageState } from "synced-storage/react";
import {
  ACTIVE_TAB_KEY,
  MINI_ALL_TAB,
  MINI_RECENTS_TAB,
  RECENTS_TAB,
  isAllTabId,
  isPackTabId,
} from "./emoticon-tabs";
import { toEmoticonsByIdsQuery } from "./emoticons-query";
import { toEmoticonKeywordsQuery } from "./keywords-query";
import { toEmoticonPackItemsQuery } from "./pack-items-query";
import { toEmoticonPacksQuery } from "./packs-query";
import { useRecentEmoticons } from "./use-recent-emoticons";
import { releaseWarmedImages, warmEmoticonImages } from "./warm-emoticon-images";
import { warmEmoticonSounds } from "./warm-emoticon-sounds";

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
   * matter. `recentIds` is a fresh object every render, so a dependency would
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
      // WARN: The room's own lifetime is what bounds the retention — see `releaseWarmedImages`.
      releaseWarmedImages();
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

      const { items, kind } = await fetchOpeningTabItems(packs);

      if (isCancelled) {
        return;
      }

      await warmEmoticonImages(items, () => isCancelled, false, kind);

      if (!isCancelled) {
        warmEmoticonSounds(items);
      }
    }

    /**
     * INFO: § 13.6. The panel falls back to 최근 사용 when the remembered pack has
     * been deleted or hidden since, and this has to make the same choice — warming
     * the pack the panel resolves away from heats a tab that never opens and leaves
     * the one that does cold.
     *
     * INFO: § 13. `kind` travels with the items rather than being re-derived at the
     * warm call, since a pack tab's kind and a recents tab's kind (`MINI_RECENTS_TAB`
     * vs `RECENTS_TAB`) are resolved by two different branches here.
     */
    async function fetchOpeningTabItems(
      packs: EmoticonPackSummary[],
    ): Promise<{ items: Emoticon[]; kind: EmoticonPackType }> {
      const { storedTab: tab, recentIds: ids } = openingTabRef.current;
      const pack = packs.find((candidate) => candidate.id === tab);

      if (isPackTabId(tab) && pack?.isEnabled) {
        const items = await queryClient.fetchQuery(toEmoticonPackItemsQuery(tab)).catch(() => []);

        return { items, kind: pack.type };
      }

      // INFO: § 13.6. Each kind keeps its own 최근 사용 and 전체, and the remembered tab is what says which of the two this open will land on.
      const kind: EmoticonPackType =
        tab === MINI_RECENTS_TAB || tab === MINI_ALL_TAB ? "mini" : "emoticon";

      // INFO: § 13.6. 전체 opens on its first pack, so that pack is what the open will draw first.
      if (isAllTabId(tab)) {
        const first = packs.find((candidate) => candidate.type === kind && candidate.isEnabled);
        const items = first
          ? await queryClient.fetchQuery(toEmoticonPackItemsQuery(first.id)).catch(() => [])
          : [];

        return { items, kind };
      }

      const recents = kind === "mini" ? ids.mini : ids.emoticon;

      // INFO: § 13.8. The search tab is never remembered, so it is not a case here — an empty 최근 사용 is, and it has nothing to ask for.
      if (recents.length === 0) {
        return { items: [], kind };
      }

      const items = await queryClient.fetchQuery(toEmoticonsByIdsQuery(recents)).catch(() => []);

      return { items, kind };
    }
  }, [queryClient]);
}
