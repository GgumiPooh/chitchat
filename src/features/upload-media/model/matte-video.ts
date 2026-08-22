import { ensure } from "@/shared/lib";
import { BlobSource, Input, MP4, QTFF, VideoSampleSink, WEBM } from "mediabunny";
import { OUTPUT_MIME, TRANSPARENT_OUTPUT_MIME } from "./canvas";
import { matteOffThread } from "./cutout-worker-client";
import type { EncodeProgress } from "./optimize-result";

// INFO: `trimVideo`'s list — a demuxer per container, tree-shaken to `ALLOWED_VIDEO_MIMES`.
const INPUT_FORMATS = [MP4, QTFF, WEBM];

// INFO: What the colour goes to ffmpeg as. Footage is noise, and noise is what PNG cannot compress — 72 matted 420px frames measured 22MB of RGBA PNG against ~3MB of JPEG beside ~1MB of alpha.
const COLOR_QUALITY = 0.92;

/** One frame as ffmpeg is handed it: the picture and its matte, to be joined by `alphamerge`. */
export type MattedFrame = { color: Blob; alpha: Blob };

/**
 * REQUIREMENTS.md § 13.4.2. Every frame of a clip at `fps`, with its matte, ready to
 * be written into ffmpeg's file system.
 *
 * WARN: Frames are decoded here and matted one at a time through the cutout worker
 * — `matteOffThread` serialises, and the decode is cheap beside the inference, so
 * nothing is gained by running ahead of it.
 *
 * WARN: The colour and the matte are two sequences from the **same** decoded
 * frames, never the clip plus a matte sequence — ffmpeg's `fps` and mediabunny's
 * `samplesAtTimestamps` pick a frame per slot by different rules, and a matte one
 * frame off its picture is a halo on every move.
 */
export async function matteVideoFrames(
  file: File,
  fps: number,
  size: { width: number; height: number },
  onProgress: EncodeProgress,
): Promise<MattedFrame[]> {
  const input = new Input({ source: new BlobSource(file), formats: INPUT_FORMATS });

  try {
    const track = ensure(await input.getPrimaryVideoTrack(), "video has no track");
    const count = Math.max(1, Math.round((await track.computeDuration()) * fps));
    const sink = new VideoSampleSink(track);
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = ensure(
      canvas.getContext("2d", { willReadFrequently: true }),
      "offscreen canvas has no 2d context",
    );
    const frames: MattedFrame[] = [];
    const timestamps = Array.from({ length: count }, (_, index) => index / fps);

    for await (const sample of sink.samplesAtTimestamps(timestamps)) {
      // INFO: `null` is a timestamp ahead of the first decodable frame; the sequence simply starts at the next one.
      if (!sample) {
        continue;
      }

      sample.draw(context, 0, 0, size.width, size.height);
      sample.close();

      const color = await canvas.convertToBlob({ type: OUTPUT_MIME, quality: COLOR_QUALITY });
      const alpha = await matteOffThread(
        context.getImageData(0, 0, size.width, size.height),
        "video",
      );
      const gray = new Uint8ClampedArray(alpha.length * 4);

      for (let index = 0; index < alpha.length; index++) {
        gray[index * 4] = gray[index * 4 + 1] = gray[index * 4 + 2] = alpha[index];
        gray[index * 4 + 3] = 255;
      }

      context.putImageData(new ImageData(gray, size.width, size.height), 0, 0);
      frames.push({
        color,
        alpha: await canvas.convertToBlob({ type: TRANSPARENT_OUTPUT_MIME }),
      });
      onProgress(frames.length / count);
    }

    return frames;
  } finally {
    input.dispose();
  }
}
