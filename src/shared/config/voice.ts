import { A_MEGABYTE, A_MINUTE, A_SECOND, type Nullable } from "@/shared/lib";

/**
 * The container types a voice message may be recorded into, **in preference
 * order** (REQUIREMENTS.md § 9.3.).
 *
 * WARN: Negotiated at runtime through `MediaRecorder.isTypeSupported`, never
 * hardcoded. No single type is both recordable and playable everywhere: WebKit
 * records only MP4/AAC and cannot play WebM at all, while Firefox records only
 * WebM/Opus. Picking one at build time silently produces a message the other
 * participant's phone refuses.
 *
 * WARN: MP4 leads deliberately, even though Opus is the better codec. AAC-in-MP4
 * is the one combination every engine in the pair's reach can *play*, and what
 * matters here is the receiving device — a recording nobody can hear is worse than
 * a slightly larger one.
 */
export const VOICE_RECORDING_MIMES = [
  // INFO: AAC-LC named explicitly, so an engine that supports several MP4 audio codecs cannot settle on one the receiver has no decoder for.
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
] as const;

/**
 * The base types a recorded voice message is **stored** as.
 *
 * WARN: The codecs parameter is stripped before the mime reaches R2 or a `media`
 * row. `MIME_PATTERN` in `./media` refuses a `;`, so `audio/webm;codecs=opus`
 * would fail `isFileMime` and be rejected at registration — after the bytes had
 * already landed in the bucket.
 */
export const VOICE_MIMES = ["audio/mp4", "audio/webm"] as const;

export type VoiceMime = (typeof VOICE_MIMES)[number];

/**
 * How long a single voice message may run.
 *
 * INFO: The ceiling is legibility, not bytes — `VOICE_WAVEFORM_PEAKS` is a fixed
 * count, so a longer clip buys nothing but a coarser bar per peak, and a recording
 * past this length is a file rather than a turn in a conversation.
 */
export const MAX_VOICE_DURATION = 2 * A_MINUTE;

/**
 * Below this a recording is discarded rather than staged.
 *
 * INFO: A press released immediately is a mis-tap, and staging it puts a bubble in
 * the conversation the sender has to go back and delete.
 */
export const MIN_VOICE_DURATION = A_SECOND;

/**
 * The bytes a voice message may reach.
 *
 * WARN: A ceiling on a *malformed* recording, not a policy on length —
 * `MAX_VOICE_DURATION` is what actually bounds this, and AAC at the recorder's
 * default bitrate puts two minutes comfortably under a megabyte. It exists because
 * a presigned PUT enforces no size at all (§ 9.), so registration needs a number.
 */
export const MAX_VOICE_SIZE = 8 * A_MEGABYTE;

/**
 * How many amplitude peaks a stored waveform carries.
 *
 * INFO: Fixed rather than per-second, so every voice bubble draws the same number
 * of bars whatever its length — the § 8.3. estimate then resolves a voice row's
 * height without reading the array at all, and the player renders one layout.
 *
 * INFO: 56 bars at 2px over a 1px gap is 167px, which fits inside the 220px
 * `MEDIA_EDGE` a media bubble is drawn at (DESIGN.md § 6.5.) with the play control
 * and the running time beside it.
 */
export const VOICE_WAVEFORM_PEAKS = 56;

/**
 * The value a stored peak is normalized against.
 *
 * WARN: Peaks are `smallint`, so they are integers `0`–`VOICE_PEAK_SCALE`, never
 * floats. A float array would double the row's width for precision no 2px bar can
 * show.
 */
export const VOICE_PEAK_SCALE = 100;

/** How often the recorder samples the input's amplitude while it runs. */
export const VOICE_SAMPLE_INTERVAL = 0.05 * A_SECOND;

/**
 * How many of the most recent samples the live level meter keeps.
 *
 * WARN: A window, not the whole recording. The meter says the microphone is
 * hearing something; keeping every sample would grow an array — and the array
 * React re-renders on — for two minutes to draw the same two dozen bars.
 */
export const VOICE_LEVEL_WINDOW = 24;

/**
 * The container the recorder should use here, or `null` where this engine cannot
 * record at all (REQUIREMENTS.md § 9.3.).
 *
 * WARN: Answers the **full** candidate string, codecs parameter included — that is
 * what `MediaRecorder` has to be handed. `toStoredVoiceMime` is what turns it into
 * the type the object is stored under.
 */
export function pickVoiceRecordingMime(): Nullable<string> {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }

  return VOICE_RECORDING_MIMES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? null;
}

/**
 * The type an object recorded as `mime` is stored under.
 *
 * @see VOICE_MIMES for why the codecs parameter cannot survive.
 */
export function toStoredVoiceMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

/** Whether a stored object is one of the containers § 9.3. records into. */
export function isVoiceMime(mime: string): mime is VoiceMime {
  return (VOICE_MIMES as readonly string[]).includes(mime);
}

/**
 * Resamples the amplitudes taken while recording into the fixed-width array the
 * row stores (REQUIREMENTS.md § 9.3.).
 *
 * INFO: Each output bucket takes the **maximum** of its inputs rather than the
 * mean. A mean flattens a sentence into a uniform band, because speech is mostly
 * silence between syllables; the peak is what makes the shape read as speech.
 */
export function toWaveformPeaks(amplitudes: number[]): number[] {
  const peaks: number[] = [];
  const loudest = Math.max(...amplitudes, 0);
  // INFO: Normalized against the recording's own loudest moment, so a quiet microphone still draws a full-height waveform instead of a flat line.
  const scale = loudest > 0 ? VOICE_PEAK_SCALE / loudest : 0;

  for (let index = 0; index < VOICE_WAVEFORM_PEAKS; index += 1) {
    const from = Math.floor((index * amplitudes.length) / VOICE_WAVEFORM_PEAKS);
    const to = Math.floor(((index + 1) * amplitudes.length) / VOICE_WAVEFORM_PEAKS);
    // WARN: `to` equals `from` for a recording with fewer samples than the peak count, and `Math.max()` of nothing is `-Infinity` — the widened slice and the trailing zero are what keep that out of the row.
    const bucket = amplitudes.slice(from, Math.max(to, from + 1));

    peaks.push(Math.round(Math.max(...bucket, 0) * scale));
  }

  return peaks;
}

/**
 * The stored waveform as everything above the wire wants it (REQUIREMENTS.md § 9.3.).
 *
 * WARN: The **one** place the storage scale is converted. The column and the wire
 * carry `smallint` integers against `VOICE_PEAK_SCALE`, because a float array
 * doubles the row's width for precision no 2px bar can show; every reader — the
 * chat projection and the optimistic cell mapper alike — works in `0`–`1`.
 *
 * WARN: Answers `null`, never `{ peaks: [] }`, for anything that is not a voice
 * message. This value is a discriminator every reader tests for truthiness, so an
 * empty track draws a photo bubble as a voice card.
 *
 * WARN: The answer is keyed on the source array, because identity is the contract.
 * `toCellsFromDrafts` runs unmemoized on every room render, and `VoicePlayer` memoises
 * its 112 bar spans on `peaks` — a fresh array each call defeats that memo inside the
 * virtualizer, on a bubble that re-renders with every upload-progress tick.
 */
export function toVoiceTrack(peaks: Nullable<number[]>): Nullable<{ peaks: number[] }> {
  if (peaks === null) {
    return null;
  }

  const cached = tracks.get(peaks);

  if (cached) {
    return cached;
  }

  const track = { peaks: peaks.map((peak) => peak / VOICE_PEAK_SCALE) };

  tracks.set(peaks, track);

  return track;
}

// INFO: Weak, so a retired draft's peaks are collected with it — this is a cache keyed on identity, never a registry of every recording the session has seen.
const tracks = new WeakMap<number[], { peaks: number[] }>();

/**
 * Whether a peak array is one this app could have written.
 *
 * WARN: REQUIREMENTS.md § 9.3. Enforced at registration. The array is the one
 * thing on a voice row the client supplies outright, and it is also the
 * discriminator every reader branches on — so an array of the wrong width, or with
 * a value out of range, must not become a row.
 */
export function isWaveformPeaks(peaks: number[]): boolean {
  return (
    peaks.length === VOICE_WAVEFORM_PEAKS &&
    peaks.every((peak) => Number.isInteger(peak) && peak >= 0 && peak <= VOICE_PEAK_SCALE)
  );
}
