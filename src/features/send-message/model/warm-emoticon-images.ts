"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { mapPooled } from "@/shared/lib";

// INFO: REQUIREMENTS.md § 13.6. Wide enough that a pack is warm in a few round trips, narrow enough that the § 13.3. route is not handed the whole library at once — each hit is a session check, an item read and a presign.
// WARN: This is not what keeps the conversation's own images ahead of the warm. Over HTTP/2 there is one connection and no queue to be at the front of; `fetchPriority` is the mechanism, and `warmImage` is where it is set.
const WARM_CONCURRENCY = 4;

// INFO: § 13.6. The warm covers a tab rather than the library, so this is a guard against an unusually large pack — a hand-authored pack is a few dozen items and never reaches it. Past it a cell is loaded by being scrolled to, which is what every cell did before the warm existed.
export const MAX_WARMED_PER_TAB = 120;

// INFO: § 13.6. Three tabs' worth: the open one and the two a swipe reaches, which is exactly what is warmed.
const MAX_WARMED_IMAGES = 3 * MAX_WARMED_PER_TAB;

const warmedImages = new Map<string, HTMLImageElement>();

/**
 * Lets go of every held element, leaving the bytes to the browser's own caches.
 *
 * WARN: Called when the room unmounts, and it has to be. These are live elements held
 * for the document's lifetime otherwise, and pinning three packs' decoded images inside
 * an iOS tab that is already carrying the conversation's own media is how that tab gets
 * reloaded out from under the reader.
 */
export function releaseWarmedImages(): void {
  warmedImages.clear();
}

/**
 * REQUIREMENTS.md § 13.6. Puts a tab's still images in the browser's cache, and
 * keeps them there.
 *
 * INFO: Every task resolves, so one asset the § 13.3. route refuses cannot stop the queue on the rest of the tab.
 */
export function warmEmoticonImages(items: Emoticon[], isCancelled: () => boolean): Promise<void> {
  const urls = items
    .slice(0, MAX_WARMED_PER_TAB)
    .map((item) => toEmoticonAssetUrl(item.id, "still-image", item.version));

  return mapPooled(urls, (url) => (isCancelled() ? Promise.resolve() : warmImage(url)), {
    limit: WARM_CONCURRENCY,
  }).then(() => undefined);
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
  const held = warmedImages.get(url);

  if (held) {
    retainWarmedImage(url, held);

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

/**
 * WARN: Least-recently-warmed, and a URL already held is re-inserted rather than left
 * where it is — insertion order alone evicted a tab that was still in the working set.
 * A swipe warms the neighbours of where it lands, which includes the tab it came from,
 * so touching on a hit is what tells the two apart: land on P3 from P2 and the arriving
 * P4 evicts P1, where before it evicted the P2 a swipe back was about to draw.
 */
function retainWarmedImage(url: string, image: HTMLImageElement): void {
  warmedImages.delete(url);
  warmedImages.set(url, image);

  while (warmedImages.size > MAX_WARMED_IMAGES) {
    const oldest = warmedImages.keys().next().value;

    if (oldest === undefined) {
      return;
    }

    warmedImages.delete(oldest);
  }
}
