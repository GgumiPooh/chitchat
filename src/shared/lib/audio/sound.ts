"use client";

import { useEffect } from "react";
import { A_MEGABYTE } from "../bytes";
import { A_SECOND } from "../date/time";
import type { Nullable } from "../nullish";
import { safelyRun } from "../run/safely";
import { declareRestingAudioSession } from "./session";

// INFO: REQUIREMENTS.md § 13.6. One context for the whole page: a second sound cuts the first off instead of layering over it, and the gesture that resumes this context resumes every sound that follows.
let context: Nullable<AudioContext> = null;

/**
 * How a sound behaves when the shared player is already sounding.
 *
 * INFO: REQUIREMENTS.md § 13.6. `"secondary"` is the 전송음, which announces a message that has no sound of its own and must never cut short one that does.
 */
export type SoundPriority = "primary" | "secondary";

export type PlaySoundOptions = {
  priority?: SoundPriority;
  /** REQUIREMENTS.md § 13.6. How long after the call the sound is scheduled on the audio clock, so a caller can line it up with a paint it has yet to make. */
  delayMs?: number;
};

// INFO: § 13.6. Decoded once into PCM, so every play after that is a `start()` on the audio clock rather than a fetch, a decode, or an element spinning up.
const cache = new Map<string, AudioBuffer>();

// INFO: The in-flight warm itself, so a caller waiting on a source someone else already asked for joins that fetch rather than starting a second one.
const warming = new Map<string, Promise<void>>();

// WARN: § 13.6. The same ceiling `warmEmoticonImages` holds its own fetches to, and for the same reason — the § 13.3. asset route is a session check, a row read and a presign per hit, and a room scrolled back through a month of sounding emoticons would hand it every one of them at once.
const WARM_CONCURRENCY = 4;

let warmsInFlight = 0;

const waiting: (() => void)[] = [];

let cachedBytes = 0;

// INFO: § 13.6. Counted in decoded PCM, which is what a buffer actually holds — roughly 350KB per stereo second, so this is a screen's worth of two-second emoticons, least-recently-played out first.
const MAX_CACHED_BYTES = 32 * A_MEGABYTE;

const BYTES_PER_SAMPLE = 4;

let playing: Nullable<AudioBufferSourceNode> = null;

let playingSrc: Nullable<string> = null;

let playingPriority: SoundPriority = "secondary";

let playRun = 0;

/**
 * Decodes `src` into memory so a later `playSound` starts from it on the audio
 * clock with no round trip.
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
  // INFO: A local draft's own `blob:`/`data:` source is decoded at the play that auditions it, since the URL is revoked as soon as the draft moves on.
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
 * Hands the shared context the user gesture a browser requires before code may
 * start it — and hands it again after iOS has interrupted it.
 *
 * WARN: Must run synchronously inside a real gesture handler — iOS resumes the
 * context from that call stack alone. A phone call or a spell in the background
 * leaves the context `interrupted`, which is why this is armed on every gesture
 * rather than the first.
 */
export function unlockSound(): void {
  const audio = getContext();

  if (audio.state !== "running") {
    void audio.resume().catch(() => undefined);
  }
}

/**
 * How long a sound started now takes to reach the speaker, in ms.
 *
 * INFO: § 13.6. The whole reason the player is Web Audio: an `<audio>` element reports that it started and nothing about when the sound is heard, where the context states both halves of the pipeline — its own buffer and the output device's.
 */
export function getSoundLatency(): number {
  const audio = getContext();

  return (audio.baseLatency + (audio.outputLatency ?? 0)) * A_SECOND;
}

/**
 * Plays `src`, cutting off whatever the shared player was playing — unless this is
 * a `"secondary"` sound and what is playing is not.
 *
 * WARN: A cached source starts synchronously, at `delayMs` on the audio clock, so
 * a caller can put it on the frame it is about to paint. A miss decodes first and
 * starts when it can; a later call in the meantime wins.
 */
export function playSound(
  src: string,
  { priority = "primary", delayMs = 0 }: PlaySoundOptions = {},
): void {
  const audio = getContext();

  // INFO: § 13.6. Only a *primary* sound holds the player — two 전송음s in a row still cut over, as every pair of sounds did before this.
  if (priority === "secondary" && playingPriority === "primary" && playing) {
    return;
  }

  const run = ++playRun;
  const cached = cache.get(src);

  if (cached) {
    start(audio, src, cached, priority, delayMs);

    return;
  }

  void loadBuffer(src).then((buffer) => {
    if (buffer && run === playRun) {
      start(audio, src, buffer, priority, 0);
    }
  });
}

/**
 * Stops the shared player, so nothing is sounding when a draft revokes the object
 * URL its audition came from.
 */
export function stopSound(): void {
  playRun++;
  stopPlaying();
}

/** Arms `unlockSound` on every gesture anywhere in the page. */
export function useSoundUnlock(): void {
  useEffect(() => {
    // INFO: Capture phase, so a handler that stops propagation cannot swallow the gesture this is waiting for.
    const options = { capture: true } as const;

    document.addEventListener("pointerdown", unlockSound, options);
    document.addEventListener("keydown", unlockSound, options);

    return () => {
      document.removeEventListener("pointerdown", unlockSound, options);
      document.removeEventListener("keydown", unlockSound, options);
    };
  }, []);
}

function start(
  audio: AudioContext,
  src: string,
  buffer: AudioBuffer,
  priority: SoundPriority,
  delayMs: number,
): void {
  stopPlaying();

  const source = audio.createBufferSource();

  source.buffer = buffer;
  source.connect(audio.destination);
  source.addEventListener("ended", () => {
    if (playing === source) {
      playing = null;
      // INFO: Or the last sound of a session stays pinned against eviction (`retain`) for as long as the page is open.
      playingSrc = null;
      playingPriority = "secondary";
    }
  });

  playing = source;
  playingSrc = src;
  playingPriority = priority;
  // INFO: A play is what the eviction order is meant to be about, so a hit is moved to the head — warmed-and-never-played is what a tab's warm leaves behind, and it is what should go first.
  if (cache.has(src)) {
    cache.delete(src);
    cache.set(src, buffer);
  }

  // INFO: A context that has never seen a gesture, or was interrupted, is resumed on the next one (`unlockSound`); the start is queued against its clock either way and plays from wherever that clock is when it runs.
  safelyRun(() => source.start(audio.currentTime + delayMs / A_SECOND));
}

function stopPlaying(): void {
  const source = playing;

  if (!source) {
    return;
  }

  playing = null;
  playingSrc = null;
  playingPriority = "secondary";
  safelyRun(() => source.stop());
  source.disconnect();
}

async function loadBuffer(src: string): Promise<Nullable<AudioBuffer>> {
  if (isCacheable(src)) {
    await warmSound(src);

    return cache.get(src) ?? null;
  }

  return decode(src);
}

async function readIntoCache(src: string): Promise<void> {
  if (warmsInFlight >= WARM_CONCURRENCY) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }

  warmsInFlight++;

  try {
    const buffer = await decode(src);

    if (buffer) {
      retain(src, buffer);
    }
  } finally {
    warmsInFlight--;
    waiting.shift()?.();
  }
}

async function decode(src: string): Promise<Nullable<AudioBuffer>> {
  try {
    const response = await fetch(src);

    if (!response.ok) {
      return null;
    }

    return await getContext().decodeAudioData(await response.arrayBuffer());
  } catch {
    // INFO: A sound that cannot be read or decoded is a sound that does not play, which is not worth surfacing — and the caller is released either way (see `warmSound`).
    return null;
  }
}

function isCacheable(src: string): boolean {
  return !src.startsWith("blob:") && !src.startsWith("data:");
}

/**
 * WARN: Least-recently-played — `playSound` moves a hit to the head, so a tab's warm
 * cannot evict a sound the reader keeps tapping. The source the player is holding is
 * never evicted either, so its buffer stays at the head for the next tap.
 */
function retain(src: string, buffer: AudioBuffer): void {
  cache.set(src, buffer);
  cachedBytes += toBytes(buffer);

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
  const buffer = cache.get(src);

  if (!buffer) {
    return;
  }

  cache.delete(src);
  cachedBytes -= toBytes(buffer);
}

function toBytes(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * BYTES_PER_SAMPLE;
}

function getContext(): AudioContext {
  if (!context) {
    // WARN: REQUIREMENTS.md § 13.6. Before the context exists, because the session is fixed from the page's first audio and `auto` would settle into a category that mints iOS's Now Playing entry.
    declareRestingAudioSession();
    context = new AudioContext();
  }

  return context;
}
