import {
  ADTS,
  BlobSource,
  BufferTarget,
  Conversion,
  FLAC,
  Input,
  MP3,
  MP4,
  Mp4OutputFormat,
  Output,
  Quality,
  WAVE,
  WEBM,
  canEncodeAudio,
} from "mediabunny";
import { unoptimized, type OptimizedMedia } from "./optimize-result";

const OPTIMIZED_MIME = "audio/mp4";

// INFO: A file attachment carries `FILE_ACCEPT = "*/*"` (`use-media-picker.tsx`), so unlike `trimVideo`/`cropVideo`'s three-container allow-list, an attached audio file's source container is unconstrained — named individually anyway, for the tree-shaking argument those two modules already make.
const INPUT_FORMATS = [MP4, MP3, WAVE, FLAC, WEBM, ADTS];

// INFO: A conservative AAC target for a spoken/attached clip — well below music-grade bitrates, since re-encoding above the source would only grow the file.
export const AUDIO_TARGET_BITRATE = 128_000;

/**
 * Re-encodes a chat-attached audio file to AAC/MP4, in the browser, ahead of the
 * § 9. upload pipeline. Falls back to the original `file` whenever optimizing
 * would not help or cannot be done safely — this must never fail an upload.
 *
 * Scope: user-attached audio files only. § 9.3.'s voice recordings are bounded by
 * `MAX_VOICE_DURATION` and already small, and must never be routed through here.
 *
 * WARN: Unlike `trimVideo`/`cropVideo`, this needs WebCodecs' **audio** interfaces,
 * which only landed in Safari 26 — the `AudioEncoder` check below is what keeps
 * this inert rather than throwing on the app's iOS 16.4 floor.
 */
export async function optimizeAudio(file: File): Promise<OptimizedMedia> {
  if (typeof AudioEncoder === "undefined") {
    return unoptimized(file);
  }

  try {
    const input = new Input({ source: new BlobSource(file), formats: INPUT_FORMATS });
    const audioTrack = await input.getPrimaryAudioTrack();

    if (!audioTrack) {
      return unoptimized(file);
    }

    const [sourceBitrate, numberOfChannels, sampleRate] = await Promise.all([
      audioTrack.getBitrate(),
      audioTrack.getNumberOfChannels(),
      audioTrack.getSampleRate(),
    ]);

    if (sourceBitrate != null && sourceBitrate <= AUDIO_TARGET_BITRATE) {
      return unoptimized(file);
    }

    const canEncode = await canEncodeAudio("aac", {
      numberOfChannels,
      sampleRate,
      bitrate: AUDIO_TARGET_BITRATE,
    });

    if (!canEncode) {
      return unoptimized(file);
    }

    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      video: { discard: true },
      audio: { codec: "aac", quality: new Quality({ bitrate: AUDIO_TARGET_BITRATE }) },
    });

    if (!conversion.isValid) {
      return unoptimized(file);
    }

    await conversion.execute();

    const buffer = output.target.buffer;

    if (!buffer) {
      return unoptimized(file);
    }

    const optimized = new File([buffer], toOptimizedName(file.name), { type: OPTIMIZED_MIME });

    return optimized.size < file.size ? unoptimized(optimized) : unoptimized(file);
  } catch {
    return unoptimized(file);
  }
}

function toOptimizedName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.m4a`;
}
