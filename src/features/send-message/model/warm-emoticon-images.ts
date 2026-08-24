"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl, type EmoticonPackType } from "@/shared/config";
import { mapPooled } from "@/shared/lib";

// INFO: REQUIREMENTS.md § 13.6. Wide enough that a pack is warm in a few round trips, narrow enough that the § 13.3. route is not handed the whole library at once — each hit is a session check, an item read and a presign.
// WARN: This is not what keeps the conversation's own images ahead of the warm. Over HTTP/2 there is one connection and no queue to be at the front of; `fetchPriority` is the mechanism, and `warmImage` is where it is set.
const WARM_CONCURRENCY = 4;

// INFO: § 13.6. The warm covers a tab rather than the library, so this is a guard against an unusually large pack — a hand-authored pack is a few dozen items and never reaches it. Past it a cell is loaded by being scrolled to, which is what every cell did before the warm existed.
export const MAX_WARMED_PER_TAB = 120;

/**
 * How far out a warmed tab is **decoded** as well as fetched.
 *
 * WARN: § 13.6. Decoding is what makes a warmed tab behave like one the reader has already seen, and it is also the expensive half — a decoded still is its pixels, roughly 700KB at `EMOTICON_MAX_EDGE`, against 17KB of PNG. At two either way that is five tabs, some 130 pictures; the whole walk (`MAX_WARM_DISTANCE`) would be an order of magnitude more, inside an iOS tab already carrying the conversation's media.
 * INFO: Two is what a swipe reaches without waiting. Past it a tab is bytes in the cache, which is a disk read rather than a round trip — the case the deferred skeleton covers.
 */
export const MAX_DECODED_DISTANCE = 2;

/**
 * WARN: § 13.6. The decoded working set and not the walk, which reaches fifteen tabs
 * either way — **and only decoded tabs are ever put in here**, which is what keeps the
 * two the same size. Holding the far end as well made eviction actively harmful: one
 * walk inserts strictly near to far, so the oldest entries are always the thumbnails
 * and the open tab, and the first overflow threw out precisely the decoded tabs to keep
 * undecoded ones nobody had walked to yet.
 * INFO: A far tab is released to the collector and its bytes stay in the browser's own cache, which is the state that end of the walk is meant to be in.
 */
const MAX_WARMED_IMAGES = (2 * MAX_DECODED_DISTANCE + 1) * MAX_WARMED_PER_TAB;

const warmedImages = new Map<string, HTMLImageElement>();

// INFO: § 13.6. Held apart from the map above, because a URL can be warm without having been decoded — the near tabs are decoded and the far ones are only fetched.
const decodedUrls = new Set<string>();

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
  decodedUrls.clear();
}

/**
 * REQUIREMENTS.md § 13.6. Puts a tab's images in the browser's cache, and keeps
 * them there.
 *
 * INFO: Every task resolves, so one asset the § 13.3. route refuses cannot stop the queue on the rest of the tab.
 *
 * WARN: § 13. `kind` picks the **slot**, not just what the cell later draws — a mini
 * tab is warmed at `animated-image` and never touches `still-image` at all, since a
 * mini item is only ever drawn animated (`toEmoticonAssetUrl`'s own fallback still
 * answers a still-only mini with its still). Warming both would fetch a slot a mini
 * grid never requests.
 */
export function warmEmoticonImages(
  items: Emoticon[],
  isCancelled: () => boolean,
  decodes = false,
  kind: EmoticonPackType = "emoticon",
): Promise<void> {
  const slot = kind === "mini" ? "animated-image" : "still-image";
  const urls = items
    .slice(0, MAX_WARMED_PER_TAB)
    .map((item) => toEmoticonAssetUrl(item.id, slot, item.version));

  return warmEmoticonUrls(urls, isCancelled, decodes);
}

/**
 * REQUIREMENTS.md § 13.6. The same warm for a list of URLs that are not one tab's
 * items — the strip's own pack thumbnails, which are `still-image` assets like any
 * other and were the one row nothing warmed.
 *
 * WARN: Uncapped, deliberately, where `warmEmoticonImages` slices. The strip is one row of one asset per pack, so the caller's own list is already the bound; slicing it at a tab's cap would leave the packs past that drawing from cold.
 */
export function warmEmoticonUrls(
  urls: string[],
  isCancelled: () => boolean,
  decodes = false,
): Promise<void> {
  return mapPooled(urls, (url) => (isCancelled() ? Promise.resolve() : warmImage(url, decodes)), {
    limit: WARM_CONCURRENCY,
  }).then(() => undefined);
}

/**
 * WARN: Never rejects, for `mapPooled`'s reason — and never clears `src` on the way
 * out either. An empty source resolves against the document URL and the element
 * fetches the page itself as an image, which is the trap `stopVoice` documents.
 *
 * WARN: `fetchPriority` is what actually keeps this behind the conversation. The whole app is one HTTP/2 connection, so a narrow pool only limits how many requests are outstanding — it does not put the room's own images in front of them. An out-of-DOM `new Image()` is dispatched at default priority without this.
 *
 * WARN: The loaded element is **held**, and dropping it is what left the panel opening on skeletons — a released `Image` takes the resource out of the memory cache with it, so a warm the network never repeated still cost the cell a disk read and a decode, both asynchronous and both after `PreloadImage` had already committed its placeholder.
 *
 * WARN: `decodes` is what separates a warm tab from one the reader has actually seen, and it is why a tab that was warmed still opened on skeletons. A detached `Image` puts the **bytes** in the cache and nothing more — the picture has never been in a render tree, so nothing has decoded it, and WebKit in particular keeps no decoded copy for an element it never painted. `decode()` here is the step that closes that, and it is rationed by distance for the reason `MAX_DECODED_DISTANCE` states.
 */
function warmImage(url: string, decodes: boolean): Promise<void> {
  const held = warmedImages.get(url);

  if (held) {
    retainWarmedImage(url, held);

    // INFO: Held means decoded (see `MAX_WARMED_IMAGES`), so a re-warm at any distance has nothing left to do but keep it at the head of the order.
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      if (!decodes) {
        resolve();

        return;
      }

      retainWarmedImage(url, image);
      void decodeWarmedImage(url, image).then(resolve);
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
    decodedUrls.delete(oldest);
  }
}

/**
 * WARN: Swallows its own failure. A decode that cannot complete — a truncated object, or a tab the OS has pushed out of memory — costs this tab its head start and must never fail the walk behind it.
 * INFO: Recorded per URL so a tab re-reached at a decoding distance is not decoded twice; eviction and `releaseWarmedImages` clear both sides together.
 */
async function decodeWarmedImage(url: string, image: HTMLImageElement): Promise<void> {
  if (decodedUrls.has(url)) {
    return;
  }

  try {
    await image.decode();

    // WARN: Only if the element is still the held one. A decode in flight when its URL is evicted would otherwise land after the eviction's own `delete`, leaving the set claiming a decode for an element nobody holds — and every later re-warm then returns early and never decodes it again.
    if (warmedImages.get(url) === image) {
      decodedUrls.add(url);
    }
  } catch {
    // INFO: The tab stays warm in bytes, which is the state every tab past `MAX_DECODED_DISTANCE` is left in deliberately.
  }
}
