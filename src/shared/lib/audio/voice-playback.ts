"use client";

import { useCallback, useSyncExternalStore } from "react";
import { A_SECOND } from "../date/time";
import type { Nullable } from "../nullish";
import { declareRestingAudioSession } from "./session";

/**
 * One `Audio` element for every voice message in the app, and a **second** one
 * beside the emoticon player of REQUIREMENTS.md § 13.6.
 *
 * INFO: Separate from the emoticon element because the two cut each other off — `playSound` overwrites `src`, so an emoticon arriving live would end a voice note mid-sentence, and `stopSound`'s `removeAttribute("src")` would take the track away outright.
 * WARN: The audio **session** is still the page's resting one (`session.ts`), and that is not a free choice: `navigator.audioSession.type` is a page-wide switch, so moving voice to `playback` for a lock-screen Now Playing entry would put every two-second emoticon ping there too — the regression § 13.6. exists to prevent — and `playback` stops the user's music where `transient` only ducks it. Revisiting it is a change to `RESTING_TYPE`, never a category named here.
 * INFO: No `unlockSound` twin is needed: playback only ever starts from a tap on the play control, which is already the gesture iOS wants to see.
 */
let element: Nullable<HTMLAudioElement> = null;

// INFO: REQUIREMENTS.md § 13.6.'s one-at-a-time rule, for free — one element cannot be parked on two sources.
let activeSrc: Nullable<string> = null;

let pendingSeekMs: Nullable<number> = null;

let frame = 0;

const listeners = new Set<() => void>();

/** What one bubble reads about itself: its own position, or nothing at all. */
export type VoiceSnapshot = {
  /** The shared element is parked on this source — playing, paused, or finished. */
  isActive: boolean;
  isPlaying: boolean;
  positionMs: number;
};

// INFO: One frozen object for every bubble that is not the active one, so a snapshot compared by identity never re-renders the rest of the list while one of them plays.
const IDLE: VoiceSnapshot = { isActive: false, isPlaying: false, positionMs: 0 };

let snapshot: VoiceSnapshot = IDLE;

// INFO: REQUIREMENTS.md § 8.3. The clock is quantised rather than published per frame — a bubble lives inside the virtualizer, and 60 renders a second of a row it is measuring buys smoothness nobody can see on a 220px waveform.
const POSITION_STEP = A_SECOND / 20;

export type VoicePlayback = VoiceSnapshot & {
  /** `0`–`1`, against the **stored** duration rather than the element's. */
  progress: number;
  toggle: () => void;
  seekToRatio: (ratio: number) => void;
};

/**
 * REQUIREMENTS.md § 13.6. Drives one voice bubble off the shared element.
 *
 * `durationMs` is the stored figure and not `audio.duration`, which a
 * `MediaRecorder` webm reports as `Infinity` until it has been played to the end.
 */
export function useVoicePlayback(src: Nullable<string>, durationMs: number): VoicePlayback {
  const state = useSyncExternalStore(
    subscribe,
    () => readSnapshot(src),
    () => IDLE,
  );

  const toggle = useCallback(() => {
    if (src) {
      toggleVoice(src);
    }
  }, [src]);

  const seekToRatio = useCallback(
    (ratio: number) => {
      if (src) {
        seekVoice(src, clamp(ratio) * durationMs);
      }
    },
    [src, durationMs],
  );

  return {
    ...state,
    progress: durationMs > 0 ? clamp(state.positionMs / durationMs) : 0,
    toggle,
    seekToRatio,
  };
}

/** Starts `src`, or pauses and resumes it where the shared element is already on it. */
export function toggleVoice(src: string): void {
  const audio = getPlayer();

  if (activeSrc === src) {
    if (audio.paused) {
      play(audio);
    } else {
      audio.pause();
    }

    return;
  }

  adopt(src);
  play(audio);
}

/** Moves `src` to `positionMs` and plays from there, adopting it first where it is not the active track. */
export function seekVoice(src: string, positionMs: number): void {
  const audio = getPlayer();

  if (activeSrc !== src) {
    adopt(src);
  }

  // INFO: `currentTime` is ignored before the element knows how long it is, so a seek made on the first tap of a message is held for `loadedmetadata` — and published anyway, or the waveform would not answer the tap until the file arrived.
  if (audio.readyState < 1) {
    pendingSeekMs = positionMs;
    publish({ isActive: true, isPlaying: !audio.paused, positionMs });
  } else {
    audio.currentTime = positionMs / A_SECOND;
    syncPosition();
  }

  play(audio);
}

/**
 * Whether the shared element is parked on `src`, playing or not.
 *
 * WARN: The guard `stopVoice` needs. Stopping is page-wide, so a caller clearing up
 * after its **own** source — an optimistic bubble about to revoke its object URL —
 * would otherwise cut off whichever other bubble happened to be playing.
 */
export function isVoiceActive(src: Nullable<string>): boolean {
  return src !== null && src === activeSrc;
}

/**
 * Stops playback and lets go of the source, so a caller may revoke the object URL
 * an optimistic bubble handed over.
 *
 * WARN: `removeAttribute` and not `src = ""` — an empty source resolves against the
 * document URL, and the element goes on to fetch the page itself as media.
 */
export function stopVoice(): void {
  const audio = element;

  if (!audio) {
    return;
  }

  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  activeSrc = null;
  pendingSeekMs = null;
  // WARN: Stopped here and not left to the `pause` listener. That event is queued, and `activeSrc` is already `null` by the time it lands — `syncPlayState` bails on exactly that, so the frame loop would go on re-arming itself forever over a source nothing is playing.
  stopTicking();
  publish(IDLE);
}

function readSnapshot(src: Nullable<string>): VoiceSnapshot {
  return isVoiceActive(src) ? snapshot : IDLE;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function publish(next: VoiceSnapshot): void {
  snapshot = next;

  for (const listener of listeners) {
    listener();
  }
}

function adopt(src: string): void {
  const audio = getPlayer();

  audio.pause();
  audio.src = src;
  activeSrc = src;
  pendingSeekMs = null;
  publish({ isActive: true, isPlaying: false, positionMs: 0 });
}

function play(audio: HTMLAudioElement): void {
  // INFO: A rejection is what an autoplay policy or a revoked blob URL looks like, and a voice note that will not start is already saying so by not moving.
  void audio.play().catch(() => undefined);
}

function getPlayer(): HTMLAudioElement {
  if (element) {
    return element;
  }

  declareRestingAudioSession();

  const audio = new Audio();

  // INFO: Metadata only — the element is minted inside the tap that is about to call `play()`, so the body is fetched a moment later anyway and `auto` would only race it.
  audio.preload = "metadata";
  audio.addEventListener("play", syncPlayState);
  audio.addEventListener("pause", syncPlayState);
  audio.addEventListener("ended", handleEnded);
  audio.addEventListener("timeupdate", syncPosition);
  audio.addEventListener("loadedmetadata", applyPendingSeek);
  element = audio;

  return audio;
}

function syncPlayState(): void {
  const audio = element;

  if (!audio || activeSrc === null) {
    return;
  }

  publish({ isActive: true, isPlaying: !audio.paused, positionMs: toPositionMs(audio) });

  if (audio.paused) {
    stopTicking();
  } else {
    startTicking();
  }
}

function syncPosition(): void {
  const audio = element;

  if (!audio || activeSrc === null) {
    return;
  }

  const positionMs = toPositionMs(audio);

  if (Math.round(positionMs / POSITION_STEP) === Math.round(snapshot.positionMs / POSITION_STEP)) {
    return;
  }

  publish({ isActive: true, isPlaying: !audio.paused, positionMs });
}

// INFO: The track stays adopted rather than released, so the bubble that just finished keeps its own controls instead of handing them back to a row the user is no longer looking at.
function handleEnded(): void {
  stopTicking();
  publish({ isActive: true, isPlaying: false, positionMs: 0 });

  if (element) {
    element.currentTime = 0;
  }
}

function applyPendingSeek(): void {
  const audio = element;

  if (!audio || pendingSeekMs === null) {
    return;
  }

  audio.currentTime = pendingSeekMs / A_SECOND;
  pendingSeekMs = null;
  syncPosition();
}

// WARN: `timeupdate` alone fires about four times a second, which reads as a waveform filling in steps. The frame loop runs only while something is playing, and `syncPosition` still quantises what it publishes.
function startTicking(): void {
  if (frame !== 0) {
    return;
  }

  frame = requestAnimationFrame(tick);
}

function tick(): void {
  frame = requestAnimationFrame(tick);
  syncPosition();
}

function stopTicking(): void {
  cancelAnimationFrame(frame);
  frame = 0;
}

function toPositionMs(audio: HTMLAudioElement): number {
  return audio.currentTime * A_SECOND;
}

function clamp(ratio: number): number {
  return Math.min(Math.max(ratio, 0), 1);
}
