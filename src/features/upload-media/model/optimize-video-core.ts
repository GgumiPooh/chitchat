import {
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  Quality,
  WEBM,
} from "mediabunny";
import { fitWithin } from "./canvas";
import { unoptimized, type EncodeProgress, type OptimizedMedia } from "./optimize-result";

const OPTIMIZED_MIME = "video/mp4";

// INFO: `trimVideo`'s list and its bundle argument, unchanged — a demuxer per container, tree-shaken to `ALLOWED_VIDEO_MIMES`.
const INPUT_FORMATS = [MP4, QTFF, WEBM];

// INFO: Long edge cap for a chat-attached clip — the same 1920 a background caps at (`BACKGROUND_MAX_EDGE`), applied to the whole frame rather than a crop.
export const VIDEO_MAX_LONG_EDGE = 1920;

// INFO: Resolution-dependent H.264 ceilings, so a 480p clip is not re-encoded up toward a 1080p budget it never needed.
export const VIDEO_BITRATE_CEILING_1080P = 8_000_000;
export const VIDEO_BITRATE_CEILING_720P = 5_000_000;
export const VIDEO_BITRATE_CEILING_SD = 2_500_000;

/** The H.264 ceiling a clip of this long edge is written at, shared with `cropVideo` so a background and an attachment are cut to one policy. */
export function bitrateCeilingFor(longEdge: number): number {
  if (longEdge >= 1920) {
    return VIDEO_BITRATE_CEILING_1080P;
  }
  if (longEdge >= 1280) {
    return VIDEO_BITRATE_CEILING_720P;
  }
  return VIDEO_BITRATE_CEILING_SD;
}

/**
 * The actual mediabunny conversion, DOM-free so it runs identically on
 * `video-encoder.worker.ts` or, as a fallback, on the main thread. Never
 * throws — every failure and every case where optimizing would not help
 * answers `unoptimized(file)`.
 *
 * WARN: The audio track is never touched here, unlike `trimVideo`/`cropVideo` — an
 * attachment's sound is the point of it. Leaving `audio` unset asks mediabunny to
 * copy its encoded samples straight into the MP4 output rather than decode and
 * re-encode them, which is what keeps this on WebCodecs' **video** interfaces
 * (Safari 16.4+) instead of raising the floor to Safari 26 for audio.
 *
 * WARN: `conversion.isValid` alone does not prove the audio survived — a discarded
 * track can still leave the remaining ones "valid" (mediabunny's own doc for the
 * field). `discardedTracks` is checked separately so a source whose audio cannot be
 * passed through (e.g. non-AAC audio into MP4) skips instead of shipping silently.
 */
export async function runVideoConversion(
  file: File,
  onProgress?: EncodeProgress,
): Promise<OptimizedMedia> {
  try {
    const input = new Input({ source: new BlobSource(file), formats: INPUT_FORMATS });
    const videoTrack = await input.getPrimaryVideoTrack();

    if (!videoTrack) {
      return unoptimized(file);
    }

    const [width, height, sourceBitrate] = await Promise.all([
      videoTrack.getDisplayWidth(),
      videoTrack.getDisplayHeight(),
      videoTrack.getBitrate(),
    ]);

    const size = fitWithin(width, height, VIDEO_MAX_LONG_EDGE);
    const ceiling = bitrateCeilingFor(Math.max(size.width, size.height));
    const needsResize = size.width !== width || size.height !== height;
    const needsBitrateReduction = sourceBitrate != null && sourceBitrate > ceiling;

    if (!needsResize && !needsBitrateReduction) {
      return unoptimized(file);
    }

    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      video: {
        width: size.width,
        height: size.height,
        // WARN: `fit: "fill"` and not `cover`, for `cropVideo`'s reason — the box is the source's own aspect ratio, so there is nothing to letterbox or trim off.
        fit: "fill",
        codec: "avc",
        quality: new Quality({ bitrate: ceiling }),
      },
    });

    conversion.onProgress = onProgress;

    const audioDiscarded = conversion.discardedTracks.some((discarded) =>
      discarded.track.isAudioTrack(),
    );

    if (!conversion.isValid || audioDiscarded) {
      return unoptimized(file);
    }

    await conversion.execute();

    const buffer = output.target.buffer;

    if (!buffer) {
      return unoptimized(file);
    }

    const optimized = new File([buffer], toOptimizedName(file.name), { type: OPTIMIZED_MIME });

    return optimized.size < file.size
      ? { file: optimized, width: size.width, height: size.height }
      : unoptimized(file);
  } catch {
    return unoptimized(file);
  }
}

function toOptimizedName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.mp4`;
}
