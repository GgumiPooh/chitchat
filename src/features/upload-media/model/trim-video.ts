import {
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  WEBM,
} from "mediabunny";

// INFO: REQUIREMENTS.md § 12.1. The trimmer always writes MP4, whatever the source container was — it is the one thing every browser the app runs in can play back.
const TRIMMED_MIME = "video/mp4";

/**
 * WARN: Named one by one rather than `ALL_FORMATS`, and that is a bundle decision.
 * `mediabunny` ships a demuxer per container and tree-shakes to whatever this list
 * names — `ALL_FORMATS` pulls in every one of them, including the audio-only
 * containers this app never sees.
 *
 * INFO: Exactly `ALLOWED_VIDEO_MIMES` (`shared/config`): MP4, QuickTime (the `.mov`
 * an iPhone produces) and WebM. A format missing here is refused by `validateFile`
 * long before it reaches the trimmer.
 */
const INPUT_FORMATS = [MP4, QTFF, WEBM];

export type TrimRange = {
  /** Seconds from the start of the source. */
  start: number;
  end: number;
};

/**
 * Cuts `range` out of a video, in the browser, and answers the result as a `File`
 * ready for the § 9. upload pipeline.
 *
 * INFO: REQUIREMENTS.md § 12.1. `mediabunny` copies the encoded samples straight
 * across whenever the source codec already fits the output container, so an iPhone
 * clip is re-muxed rather than re-encoded — no generation loss and no long wait.
 *
 * WARN: The audio track is discarded, and that is not only a size decision. A
 * background plays `muted` (nothing else autoplays on iOS), so the track would
 * never be heard — and dropping it means the whole operation needs only WebCodecs'
 * **video** interfaces, which Safari has had since 16.4. The audio interfaces
 * landed in Safari 26, so keeping the track would raise the app's floor by ten
 * major versions to ship silence.
 */
export async function trimVideo(file: File, range: TrimRange): Promise<File> {
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const conversion = await Conversion.init({
    input: new Input({ source: new BlobSource(file), formats: INPUT_FORMATS }),
    output,
    audio: { discard: true },
    trim: { start: range.start, end: range.end },
  });

  // INFO: A source whose video track this browser cannot decode at all. It is reported rather than thrown as an opaque failure, because the caller's copy has to tell it apart from a network error.
  if (!conversion.isValid) {
    throw new Error("video track cannot be converted");
  }

  await conversion.execute();

  const buffer = output.target.buffer;

  if (!buffer) {
    throw new Error("conversion produced no output");
  }

  return new File([buffer], toTrimmedName(file.name), { type: TRIMMED_MIME });
}

/** Whether this clip is already inside `maxDurationMs` and needs no trim at all. */
export function isWithinDuration(durationMs: number, maxDurationMs: number): boolean {
  return durationMs <= maxDurationMs;
}

function toTrimmedName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.mp4`;
}
