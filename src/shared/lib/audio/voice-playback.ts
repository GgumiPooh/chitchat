"use client";

import { useCallback, useSyncExternalStore } from "react";
import { A_SECOND } from "../date/time";
import type { Nullable } from "../nullish";
import { declareRestingAudioSession } from "./session";

/**
 * One `Audio` element for every voice message in the app, beside the Web Audio
 * player of REQUIREMENTS.md § 13.6.
 *
 * INFO: An element rather than that context because a voice note is minutes long and is seeked and paused, which an `AudioBufferSourceNode` cannot be — and the two must not cut each other off, where `playSound` stops whatever it was playing.
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
  /**
   * What the element itself resolved the track's length to, or `0` before
   * `loadedmetadata` and for a container that never reports one.
   *
   * INFO: The exact figure, preferred over `media.duration_ms` wherever it is finite — § 9.3.'s stored value is wall-clock and runs long by the recorder's start and flush latency. It is also all an **attached** audio file (§ 9.1.) ever has: `validateMediaUpload` nulls `duration_ms` for a file, and extracting one would mean decoding a clip with no § 9.3. length cap.
   */
  elementDurationMs: number;
};

// INFO: One frozen object for every bubble that is not the active one, so a snapshot compared by identity never re-renders the rest of the list while one of them plays.
const IDLE: VoiceSnapshot = {
  isActive: false,
  isPlaying: false,
  positionMs: 0,
  elementDurationMs: 0,
};

let snapshot: VoiceSnapshot = IDLE;

// INFO: REQUIREMENTS.md § 8.3. The clock is quantised rather than published per frame — a bubble lives inside the virtualizer, and 60 renders a second of a row it is measuring buys smoothness nobody can see on a 220px waveform.
const POSITION_STEP = A_SECOND / 20;

export type VoicePlayback = VoiceSnapshot & {
  /** `0`–`1`, against whichever length `resolvedDurationMs` settled on. */
  progress: number;
  /** The element's own length once metadata reports one, and the stored figure until then. */
  resolvedDurationMs: number;
  toggle: () => void;
  seekToRatio: (ratio: number) => void;
};

/**
 * REQUIREMENTS.md § 13.6. Drives one voice bubble off the shared element.
 *
 * `durationMs` is § 9.3.'s stored wall-clock figure, which runs long — it counts the
 * recorder's start-up and stop-flush latency, so a cursor drawn against it lags the
 * audible position and a tap lands ahead of where it aimed. The element's own
 * duration is exact and wins once `loadedmetadata` reports a finite one; the stored
 * figure covers a clip not yet adopted, and a `MediaRecorder` webm, which reports
 * `Infinity` until it has been played to the end. An attached audio file (§ 9.1.)
 * stores no `duration_ms` at all and passes `0`, so its row draws no progress
 * before its first tap.
 */
export function useVoicePlayback(src: Nullable<string>, durationMs: number): VoicePlayback {
  const state = useSyncExternalStore(
    subscribe,
    () => readSnapshot(src),
    () => IDLE,
  );
  const resolvedDurationMs = state.elementDurationMs > 0 ? state.elementDurationMs : durationMs;

  const toggle = useCallback(() => {
    if (src) {
      toggleVoice(src);
    }
  }, [src]);

  const seekToRatio = useCallback(
    (ratio: number) => {
      if (src) {
        seekVoice(src, clamp(ratio) * resolvedDurationMs);
      }
    },
    [src, resolvedDurationMs],
  );

  return {
    ...state,
    progress: resolvedDurationMs > 0 ? clamp(state.positionMs / resolvedDurationMs) : 0,
    resolvedDurationMs,
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
    publish({ isActive: true, isPlaying: !audio.paused, positionMs, elementDurationMs: 0 });
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

/**
 * Throws the shared element away, so the next playback mints a fresh one.
 *
 * WARN: REQUIREMENTS.md § 5.3. What a capture owes this module on every exit path, and putting the page back in the resting category is **not** enough on its own: the category is page-wide, but WebKit fixes an element's own at its first playback — so a player minted before the session moved to `play-and-record` keeps that category however the page is redeclared afterwards, and its next tap mints an iOS Now Playing entry and stops the user's music instead of ducking it.
 * WARN: It stops whatever is playing and takes **no** `isVoiceActive` guard, unlike every other caller of `stopVoice`. A note still playing when the microphone was asked for is cut off by this, including on the path where permission was refused and no recording ever happened. That is not collateral to be guarded away: being alive across the switch is exactly what poisons the element, and one cannot be discarded without being stopped. Orphaning it instead — dropping the reference and letting it play on — is worse, since the store is keyed to it and the bubble would lose its pause and its clock.
 * INFO: Only this element is discarded, never § 13.6.'s emoticon player: that context is resumed by `unlockSound` on every gesture, and a replacement would sit suspended until the next one, leaving an arriving emoticon unable to sound at all. Voice playback starts from a tap on the play control every time, so a fresh element is always inside the gesture iOS wants to see.
 */
export function discardVoicePlayer(): void {
  const audio = element;

  if (!audio) {
    return;
  }

  stopVoice();
  audio.removeEventListener("play", syncPlayState);
  audio.removeEventListener("pause", syncPlayState);
  audio.removeEventListener("ended", handleEnded);
  audio.removeEventListener("timeupdate", syncPosition);
  audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
  element = null;
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
  publish({ isActive: true, isPlaying: false, positionMs: 0, elementDurationMs: 0 });
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
  audio.addEventListener("loadedmetadata", handleLoadedMetadata);
  element = audio;

  return audio;
}

function syncPlayState(): void {
  const audio = element;

  if (!audio || activeSrc === null) {
    return;
  }

  publish({
    isActive: true,
    isPlaying: !audio.paused,
    positionMs: toPositionMs(audio),
    elementDurationMs: toElementDurationMs(audio),
  });

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

  publish({
    isActive: true,
    isPlaying: !audio.paused,
    positionMs,
    elementDurationMs: toElementDurationMs(audio),
  });
}

// INFO: The track stays adopted rather than released, so the bubble that just finished keeps its own controls instead of handing them back to a row the user is no longer looking at.
function handleEnded(): void {
  stopTicking();
  // INFO: Read fresh rather than off the snapshot — reaching the end is the moment a headerless container's `duration` finally resolves.
  publish({
    isActive: true,
    isPlaying: false,
    positionMs: 0,
    elementDurationMs: element ? toElementDurationMs(element) : snapshot.elementDurationMs,
  });

  if (element) {
    element.currentTime = 0;
  }
}

/**
 * WARN: REQUIREMENTS.md § 9.1. It publishes whether or not a seek was waiting. This
 * is the first moment `audio.duration` is readable, and an attached audio file has
 * no stored duration to fall back on — returning early here left such a row's
 * progress pinned at zero until the position happened to cross a `POSITION_STEP`.
 */
function handleLoadedMetadata(): void {
  const audio = element;

  if (!audio) {
    return;
  }

  if (pendingSeekMs !== null) {
    audio.currentTime = pendingSeekMs / A_SECOND;
    pendingSeekMs = null;
  }

  // INFO: A container with no length header (any MediaRecorder output — REQUIREMENTS.md § 9.3.'s stored rows predating the measured figure) answers `Infinity` here for the whole playback, leaving progress on the stored wall-clock figure that runs long.
  if (!Number.isFinite(audio.duration) && activeSrc !== null) {
    probeDuration(activeSrc);
  }

  publish({
    isActive: true,
    isPlaying: !audio.paused,
    positionMs: toPositionMs(audio),
    elementDurationMs: toElementDurationMs(audio),
  });
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

// INFO: What a probe has resolved a source's length to, kept for the session so a replay never probes twice.
const probedDurationsMs = new Map<string, number>();

const probingSrcs = new Set<string>();

// INFO: Past any real clip's end, so the probe's seek clamps to it and forces the engine to resolve a headerless container's length (the crbug.com/642012 workaround).
const PROBE_SEEK_S = Number.MAX_SAFE_INTEGER;

/**
 * Learns the real length of a source whose container carries none, off to the side.
 *
 * WARN: A separate muted element, never a seek bounced off the shared one — that one is already playing under the user's tap, and riding its `currentTime` to the end to force the length out would fire `ended` and drop the position mid-listen.
 * INFO: It only ever seeks and never plays, so WebKit fixes no audio-session category on it (`discardVoicePlayer`'s concern) and no gesture is needed.
 */
function probeDuration(src: string): void {
  if (probedDurationsMs.has(src) || probingSrcs.has(src)) {
    return;
  }

  probingSrcs.add(src);

  const probe = new Audio();

  const teardown = () => {
    probingSrcs.delete(src);
    probe.removeEventListener("durationchange", settle);
    probe.removeEventListener("loadedmetadata", seekPastEnd);
    probe.removeEventListener("error", teardown);
    probe.removeAttribute("src");
    probe.load();
  };

  // INFO: `durationchange` also fires alongside `loadedmetadata` with `Infinity` — the guard is what makes only the resolved figure settle.
  const settle = () => {
    if (!Number.isFinite(probe.duration)) {
      return;
    }

    probedDurationsMs.set(src, probe.duration * A_SECOND);
    teardown();
    syncProbedDuration(src);
  };

  const seekPastEnd = () => {
    if (!Number.isFinite(probe.duration)) {
      probe.currentTime = PROBE_SEEK_S;
    }
  };

  probe.muted = true;
  probe.preload = "metadata";
  probe.addEventListener("durationchange", settle);
  probe.addEventListener("loadedmetadata", seekPastEnd);
  probe.addEventListener("error", teardown);
  probe.src = src;
}

// INFO: A probe settling mid-playback republishes on its own — while paused nothing else would, and the bubble would keep drawing against the wall-clock figure until the next tap.
function syncProbedDuration(src: string): void {
  const audio = element;

  if (!audio || activeSrc !== src) {
    return;
  }

  publish({
    isActive: true,
    isPlaying: !audio.paused,
    positionMs: toPositionMs(audio),
    elementDurationMs: toElementDurationMs(audio),
  });
}

// WARN: REQUIREMENTS.md § 9.1. A headerless `MediaRecorder` container reports `Infinity` here until it has played to its end, and one with no duration at all reports `NaN` — the probe's figure answers for the first, and what remains reads as "unknown" rather than reaching a progress bar.
function toElementDurationMs(audio: HTMLAudioElement): number {
  if (Number.isFinite(audio.duration)) {
    return audio.duration * A_SECOND;
  }

  return activeSrc === null ? 0 : (probedDurationsMs.get(activeSrc) ?? 0);
}

function toPositionMs(audio: HTMLAudioElement): number {
  return audio.currentTime * A_SECOND;
}

function clamp(ratio: number): number {
  return Math.min(Math.max(ratio, 0), 1);
}
