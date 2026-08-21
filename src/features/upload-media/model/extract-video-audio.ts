import type { Nullable } from "@/shared/lib";
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
import type { TrimRange } from "./trim-video";

const EXTRACTED_MIME = "audio/mp4";

// INFO: `trimVideo`'s list and its bundle argument, unchanged — a demuxer per container, tree-shaken to `ALLOWED_VIDEO_MIMES`.
const INPUT_FORMATS = [MP4, QTFF, WEBM];

/**
 * REQUIREMENTS.md § 13.4.1. The sound under a trimmed range, as the emoticon's
 * audio slot takes it.
 *
 * INFO: Answers `null` rather than throwing for every reason a clip may have no
 * usable sound — no track, an engine that cannot re-encode one (Safari's audio
 * WebCodecs landed only in 26), a container this build cannot demux. The sound is
 * an offer here, so a failure leaves the emoticon silent rather than unmade.
 *
 * WARN: Run against the **source**, not against `trimVideo`'s output — that one
 * discards the audio track outright, and for a reason it states.
 *
 * WARN: No `audio` codec is named, so `mediabunny` copies the encoded samples
 * wherever the source is already AAC. Naming one would re-encode every clip through
 * an `AudioEncoder` half the point of this is avoiding.
 */
export async function extractVideoAudio(file: File, range: TrimRange): Promise<Nullable<File>> {
  try {
    const input = new Input({ source: new BlobSource(file), formats: INPUT_FORMATS });

    if (!(await input.getPrimaryAudioTrack())) {
      return null;
    }

    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      video: { discard: true },
      trim: { start: range.start, end: range.end },
    });

    if (!conversion.isValid) {
      return null;
    }

    await conversion.execute();

    const buffer = output.target.buffer;

    return buffer ? new File([buffer], toAudioName(file.name), { type: EXTRACTED_MIME }) : null;
  } catch {
    return null;
  }
}

function toAudioName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.m4a`;
}
