"use client";

import { toEmoticonAssetUrl } from "@/shared/config";
import { A_MINUTE, A_SECOND, mapPooled, type Nullable } from "@/shared/lib";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toEmoticonPacksQuery } from "./packs-query";

// INFO: REQUIREMENTS.md § 13.6. Wide enough that a pack is warm in a few round trips, narrow enough that the § 13.3. route is not handed the whole library at once — each hit is a session check, an item read and a presign.
// WARN: This is not what keeps the conversation's own images ahead of the warm. Over HTTP/2 there is one connection and no queue to be at the front of; `fetchPriority` is the mechanism, and `warmImage` is where it is set.
const PRELOAD_CONCURRENCY = 4;

// INFO: § 13.5. puts no ceiling on packs or on items per pack, so this is the one the warm imposes — past it a tab is loaded by being opened, which is exactly what every tab did before this existed.
const MAX_PRELOADED_EMOTICONS = 120;

// INFO: The ceiling the idle callback is given, and the whole delay where there is none — iOS Safari only shipped `requestIdleCallback` in 17, and the packs may as well warm a second late there as never.
const PRELOAD_IDLE_DELAY = 2 * A_SECOND;

// INFO: How long a warmed list is taken on trust, so walking between tabs does not re-ask for it on every return to the room.
const PRELOAD_STALE_TIME = A_MINUTE;

/**
 * REQUIREMENTS.md § 13.6. Warms the packs — the list, then every item's image — so
 * the panel's first open draws a full grid instead of assembling one.
 *
 * WARN: § 8.3. Deferred to an idle callback rather than started on mount. Both halves compete with the conversation for exactly the wrong frames otherwise: the list is one more round trip against a room already making several, and a pack of images is decode work landing while the first screenful of bubbles is still being measured.
 * WARN: This is what withdrew "a user who never opens the panel never fetches the packs". The cost is one list request and one pack of images per visit to the room, spent on an affordance one tap from the composer — against a first open that showed an empty panel for a round trip and then filled in cell by cell.
 */
export function useEmoticonPreload(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let isCancelled = false;
    let idleHandle: Nullable<number> = null;
    let timeoutHandle: Nullable<ReturnType<typeof setTimeout>> = null;
    const start = () => void warmEnabledPacks();

    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(start, { timeout: PRELOAD_IDLE_DELAY });
    } else {
      timeoutHandle = setTimeout(start, PRELOAD_IDLE_DELAY);
    }

    return () => {
      isCancelled = true;

      if (idleHandle !== null) {
        window.cancelIdleCallback(idleHandle);
      }

      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
    };

    async function warmEnabledPacks() {
      // INFO: `fetchQuery` rather than `prefetchQuery` — the items are what the image URLs are read off, and a prefetch answers nothing.
      // WARN: The `staleTime` is the preload's alone and must not move onto the descriptor. Leaving the room and coming back remounts this, and at the descriptor's own `0` every return would re-ask for a list nothing has changed; the panel keeps that `0` deliberately, since its mount is the moment § 13.5. edits have to land.
      const packs = await queryClient
        .fetchQuery({ ...toEmoticonPacksQuery(), staleTime: PRELOAD_STALE_TIME })
        .catch(() => []);

      if (isCancelled) {
        return;
      }

      // WARN: § 13.8. Visible packs first, because the cap below is what the order is for. The list now carries hidden packs too — they are reachable by search and by § 13.9.'s 따라하기 — and left in list order a hidden pack sitting early would spend the budget on cells no tab draws.
      const urls = [...packs]
        .sort((left, right) => Number(right.isEnabled) - Number(left.isEnabled))
        .flatMap((pack) =>
          pack.items.map((item) => toEmoticonAssetUrl(item.id, "image", item.version)),
        )
        .slice(0, MAX_PRELOADED_EMOTICONS);

      // INFO: Every task resolves (`warmImage`), so one asset the § 13.3. route refuses cannot stop the queue on the rest of the pack.
      await mapPooled(urls, (url) => (isCancelled ? Promise.resolve() : warmImage(url)), {
        limit: PRELOAD_CONCURRENCY,
      });
    }
  }, [queryClient]);
}

/**
 * WARN: Never rejects, for `mapPooled`'s reason — and never clears `src` on the way
 * out either. An empty source resolves against the document URL and the element
 * fetches the page itself as an image, which is the trap `stopSound` documents.
 *
 * WARN: `fetchPriority` is what actually keeps this behind the conversation. The whole app is one HTTP/2 connection, so a narrow pool only limits how many requests are outstanding — it does not put the room's own images in front of them. An out-of-DOM `new Image()` is dispatched at default priority without this.
 */
function warmImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.decoding = "async";
    image.fetchPriority = "low";
    image.src = url;
  });
}
