"use client";

import { useEffect } from "react";
import { A_MEGABYTE } from "../bytes";
import type { Nullable } from "../nullish";
import { safelyRun } from "../run/safely";
import { declareRestingAudioSession } from "./session";

// INFO: One element for the whole page: a second sound cuts the first off instead of layering over it, and the gesture that approves this element approves every sound that follows.
let player: Nullable<HTMLAudioElement> = null;

let isUnlocked = false;

/**
 * How a sound behaves when the shared player is already sounding.
 *
 * INFO: REQUIREMENTS.md § 13.6. `"secondary"` is the 전송음, which announces a message that has no sound of its own and must never cut short one that does.
 */
export type SoundPriority = "primary" | "secondary";

// INFO: § 13.6. The element refetches on every `src` assignment, so a source is read once into an object URL and every play after that starts from memory rather than from a round trip into R2.
const cache = new Map<string, { objectUrl: string; size: number }>();

// INFO: The in-flight warm itself, so a caller waiting on a source someone else already asked for joins that fetch rather than starting a second one.
const warming = new Map<string, Promise<void>>();

// WARN: § 13.6. The same ceiling `warmEmoticonImages` holds its own fetches to, and for the same reason — the § 13.3. asset route is a session check, a row read and a presign per hit, and a room scrolled back through a month of sounding emoticons would hand it every one of them at once.
const WARM_CONCURRENCY = 4;

let warmsInFlight = 0;

const waiting: (() => void)[] = [];

let cachedBytes = 0;

// INFO: § 13.6. The whole of what bounds the warm — a caller warms what its screen holds and this decides how much of it is kept, so no call site has to price an emoticon's 2MB ceiling itself.
const MAX_CACHED_BYTES = 8 * A_MEGABYTE;

let playingSrc: Nullable<string> = null;

let playingPriority: SoundPriority = "secondary";

/**
 * Reads `src` into memory so a later `playSound` starts from it with no round trip.
 *
 * WARN: § 13.6. This is what lines a sound up with the picture beside it. An
 * emoticon's image is warmed and decoded long before it is drawn, and its sound was
 * fetched at the tap — the image was instant and the sound arrived a beat later.
 *
 * WARN: Resolves when the source is in memory **or has failed**, never rejects. A
 * caller holding a picture back for it (`EmoticonBubble`) must be released by a sound
 * that will not arrive, not left waiting on it.
 */
export function warmSound(src: string): Promise<void> {
  // INFO: A local draft's own `blob:`/`data:` source is already in memory, and holding a second copy of it would outlive the URL the caller revokes.
  if (!isCacheable(src) || cache.has(src)) {
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
 * Hands the shared player the user gesture a browser requires before code may
 * start it.
 *
 * WARN: Must run synchronously inside a real gesture handler — iOS approves the
 * element from that call stack alone, and what it approves is the element, not
 * the source, which is why there is exactly one of them.
 */
export function unlockSound(): void {
  if (isUnlocked) {
    return;
  }

  isUnlocked = true;
  // WARN: `load()` rather than `play()` — an element with no source rejects `play()`, and a rejected call approves nothing.
  safelyRun(() => getPlayer().load());
}

/**
 * Plays `src`, cutting off whatever the shared player was playing — unless this is
 * a `"secondary"` sound and what is playing is not.
 */
export function playSound(src: string, priority: SoundPriority = "primary"): void {
  const audio = getPlayer();

  // INFO: § 13.6. Only a *primary* sound holds the player — two 전송음s in a row still cut over, as every pair of sounds did before this.
  if (priority === "secondary" && playingPriority === "primary" && isSounding(audio)) {
    return;
  }

  const cached = cache.get(src);

  playingSrc = src;
  playingPriority = priority;
  // INFO: A play is what the eviction order is meant to be about, so a hit is moved to the head — warmed-and-never-played is what a tab's warm leaves behind, and it is what should go first.
  if (cached) {
    cache.delete(src);
    cache.set(src, cached);
  }

  audio.src = cached?.objectUrl ?? src;
  // INFO: A rejection is the expected outcome on a page that has never seen a gesture, and a sound that does not play is not worth surfacing.
  void audio.play().catch(() => undefined);
  // WARN: A miss pays for the source **twice** — the element's own media load here, and the CORS `fetch` below, which the browser caches under a separate key (`CLAUDE.md § 5.3.`). It is spent deliberately and only on a miss: the element refetches on every `src` assignment, so the alternative is paying that download again on every later play of the same sound.
  void warmSound(src);
}

/**
 * Stops the shared player and lets go of its source, so a caller may revoke the
 * object URL it handed over.
 *
 * WARN: `removeAttribute` and not `src = ""` — an empty source resolves against
 * the document URL, and the element goes on to fetch the page itself as media.
 */
export function stopSound(): void {
  const audio = player;

  if (!audio) {
    return;
  }

  playingSrc = null;
  playingPriority = "secondary";
  audio.pause();
  audio.removeAttribute("src");
  // INFO: The element stays approved through this — `unlockSound` grants the gesture to the element, and a sourceless `load()` is what it does itself.
  safelyRun(() => audio.load());
}

/** Arms `unlockSound` on the first gesture anywhere in the page. */
export function useSoundUnlock(): void {
  useEffect(() => {
    // INFO: Capture phase, so a handler that stops propagation cannot swallow the one gesture this is waiting for.
    const options = { once: true, capture: true } as const;

    document.addEventListener("pointerdown", unlockSound, options);
    document.addEventListener("keydown", unlockSound, options);

    return () => {
      document.removeEventListener("pointerdown", unlockSound, options);
      document.removeEventListener("keydown", unlockSound, options);
    };
  }, []);
}

// WARN: Not `currentTime > 0` — `play()` clears `paused` synchronously but the clock only moves once the media has buffered, so a sound still loading would read as silence and be cut off by the very 전송음 this defers.
function isSounding(audio: HTMLAudioElement): boolean {
  return !audio.paused && !audio.ended;
}

async function readIntoCache(src: string): Promise<void> {
  if (warmsInFlight >= WARM_CONCURRENCY) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }

  warmsInFlight++;

  try {
    const response = await fetch(src);
    const blob = response.ok ? await response.blob() : null;

    if (blob) {
      retain(src, blob);
    }
  } catch {
    // INFO: A sound that cannot be read is a sound that does not play, which is not worth surfacing — and the caller is released either way (see `warmSound`).
  } finally {
    warmsInFlight--;
    waiting.shift()?.();
  }
}

function isCacheable(src: string): boolean {
  return !src.startsWith("blob:") && !src.startsWith("data:");
}

/**
 * WARN: Least-recently-played — `playSound` moves a hit to the head, so a tab's warm
 * cannot evict a sound the reader keeps tapping. The source the player is holding is
 * never evicted either: revoking an object URL mid-playback ends the sound.
 */
function retain(src: string, blob: Blob): void {
  cache.set(src, { objectUrl: URL.createObjectURL(blob), size: blob.size });
  cachedBytes += blob.size;

  for (const oldest of cache.keys()) {
    if (cachedBytes <= MAX_CACHED_BYTES) {
      return;
    }

    if (oldest !== src && oldest !== playingSrc) {
      release(oldest);
    }
  }
}

function release(src: string): void {
  const entry = cache.get(src);

  if (!entry) {
    return;
  }

  URL.revokeObjectURL(entry.objectUrl);
  cache.delete(src);
  cachedBytes -= entry.size;
}

function getPlayer(): HTMLAudioElement {
  if (!player) {
    // WARN: REQUIREMENTS.md § 13.6. Before the element exists, because the `auto` session an `<audio>` element would otherwise settle into is `playback` — the category that mints iOS's Now Playing entry.
    declareRestingAudioSession();
    player = new Audio();
    // INFO: Or the last sound of a session stays pinned against eviction (`retain`) for as long as the page is open.
    player.addEventListener("ended", () => {
      playingSrc = null;
    });
  }

  return player;
}
