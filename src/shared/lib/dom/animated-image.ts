"use client";

import { A_MEGABYTE } from "../bytes";
import type { Nullable } from "../nullish";

// INFO: REQUIREMENTS.md § 13.6. Sized against `MAX_EMOTICON_IMAGE_SIZE` the way the sound cache is against the audio ceiling — a screen's worth of sounding emoticons, least-recently-played out first.
const MAX_CACHED_BYTES = 32 * A_MEGABYTE;

const cache = new Map<string, Blob>();

const warming = new Map<string, Promise<void>>();

// WARN: § 13.6. `warmSound`'s ceiling, for its reason — every warm is a hit on the § 13.3. asset route.
const WARM_CONCURRENCY = 4;

let warmsInFlight = 0;

const waiting: (() => void)[] = [];

let cachedBytes = 0;

/**
 * Reads an animated emoticon's bytes into memory, so `prepareAnimatedImage` can
 * mint a fresh object URL for it with no round trip.
 *
 * WARN: Resolves on failure too, for `warmSound`'s reason — a caller holding a
 * picture back for it is released by an asset that is not coming.
 */
export function warmAnimatedImage(src: string): Promise<void> {
  if (cache.has(src)) {
    return Promise.resolve();
  }

  const inFlight = warming.get(src);

  if (inFlight) {
    return inFlight;
  }

  const warmed = readIntoCache(src).finally(() => warming.delete(src));

  warming.set(src, warmed);

  return warmed;
}

/**
 * A decoded, not-yet-mounted `<img>` of `src` on an object URL of its own.
 *
 * INFO: REQUIREMENTS.md § 13.6. Every engine starts an animated image's clock when a
 * renderer first takes it — WebKit on attach, Blink and Gecko on first draw — never on
 * `decode()`, so the frame this returns is at 0 until the caller mounts it. The URL is
 * minted per call because WebKit keeps the clock on the URL, shared by every element
 * showing it; a fresh one is what makes the mount a restart rather than a resume.
 *
 * WARN: The caller owns the URL and releases it through `releaseAnimatedImage`.
 * Resolves `null` when the bytes are not in memory or will not decode.
 */
export async function prepareAnimatedImage(src: string): Promise<Nullable<HTMLImageElement>> {
  await warmAnimatedImage(src);

  const blob = cache.get(src);

  if (!blob) {
    return null;
  }

  cache.delete(src);
  cache.set(src, blob);

  const image = new Image();

  image.src = URL.createObjectURL(blob);

  try {
    await image.decode();

    return image;
  } catch {
    releaseAnimatedImage(image);

    return null;
  }
}

export function releaseAnimatedImage(image: HTMLImageElement): void {
  const url = image.src;

  image.remove();
  image.removeAttribute("src");
  URL.revokeObjectURL(url);
}

async function readIntoCache(src: string): Promise<void> {
  if (warmsInFlight >= WARM_CONCURRENCY) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }

  warmsInFlight++;

  try {
    const response = await fetch(src);

    if (response.ok) {
      retain(src, await response.blob());
    }
  } catch {
    // INFO: An asset that cannot be read falls back to the network `<img>` the caller already draws.
  } finally {
    warmsInFlight--;
    waiting.shift()?.();
  }
}

function retain(src: string, blob: Blob): void {
  cache.set(src, blob);
  cachedBytes += blob.size;

  for (const oldest of cache.keys()) {
    if (cachedBytes <= MAX_CACHED_BYTES) {
      return;
    }

    if (oldest !== src) {
      cachedBytes -= cache.get(oldest)?.size ?? 0;
      cache.delete(oldest);
    }
  }
}
