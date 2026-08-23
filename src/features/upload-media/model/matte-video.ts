import { ensure, type Nullable } from "@/shared/lib";
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

/** Draws one frame into the matte canvas, which is where a crop and a rotation belong — the source owns them, not this. */
export type DrawMatteFrame = (context: OffscreenCanvasRenderingContext2D) => void;

/** `count` is what progress is reported against, so it is stated ahead of the frames rather than counted from them. */
export type MatteFrameSource = {
  count: number;
  frames: AsyncIterable<Nullable<DrawMatteFrame>>;
};

export type MatteFramesOptions = {
  /** Off for an animation that declined 누끼 (REQUIREMENTS.md § 13.4.1.): the frames still need splitting into the two sequences `alphamerge` takes. */
  matte?: boolean;
};

/**
 * REQUIREMENTS.md § 13.4.2. Every frame of `source`, with its matte, ready to be
 * written into ffmpeg's file system.
 *
 * WARN: Frames are matted one at a time through the cutout worker — `matteOffThread`
 * serialises, and the decode is cheap beside the inference, so nothing is gained by
 * running ahead of it.
 *
 * WARN: The alpha is **multiplied into** whatever the frame already had, never
 * assigned over it — an emoticon animation arrives cut out already, where footage
 * does not.
 *
 * WARN: The colour is flattened to opaque before it is encoded. `convertToBlob`
 * composites a JPEG onto black, so a half-transparent edge would come back darkened
 * under an alpha plane that then makes it visible again.
 */
export async function matteFrames(
  source: MatteFrameSource,
  size: { width: number; height: number },
  onProgress: EncodeProgress,
  { matte = true }: MatteFramesOptions = {},
): Promise<MattedFrame[]> {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = ensure(
    canvas.getContext("2d", { willReadFrequently: true }),
    "offscreen canvas has no 2d context",
  );
  const frames: MattedFrame[] = [];

  for await (const draw of source.frames) {
    if (!draw) {
      continue;
    }

    context.clearRect(0, 0, size.width, size.height);
    draw(context);

    const pixels = context.getImageData(0, 0, size.width, size.height);
    // WARN: Copied before the matte, because `matteOffThread` transfers that buffer and detaches it here.
    const rgba = new Uint8ClampedArray(pixels.data);
    const alpha = matte ? await matteOffThread(pixels, "video") : null;
    const gray = new Uint8ClampedArray(rgba.length);

    for (let index = 0; index < rgba.length / 4; index++) {
      const carried = rgba[index * 4 + 3];
      const matted = alpha ? (carried * alpha[index]) / 255 : carried;

      gray[index * 4] = gray[index * 4 + 1] = gray[index * 4 + 2] = matted;
      gray[index * 4 + 3] = 255;
      rgba[index * 4 + 3] = 255;
    }

    context.putImageData(new ImageData(rgba, size.width, size.height), 0, 0);

    const color = await canvas.convertToBlob({ type: OUTPUT_MIME, quality: COLOR_QUALITY });

    context.putImageData(new ImageData(gray, size.width, size.height), 0, 0);
    frames.push({ color, alpha: await canvas.convertToBlob({ type: TRANSPARENT_OUTPUT_MIME }) });
    onProgress(frames.length / source.count);
  }

  return frames;
}

/**
 * A clip's frames at `fps`, matted.
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
    const timestamps = Array.from({ length: count }, (_, index) => index / fps);

    return await matteFrames(
      { count, frames: toClipFrames(sink, timestamps, size) },
      size,
      onProgress,
    );
  } finally {
    input.dispose();
  }
}

async function* toClipFrames(
  sink: VideoSampleSink,
  timestamps: number[],
  size: { width: number; height: number },
): AsyncGenerator<Nullable<DrawMatteFrame>> {
  for await (const sample of sink.samplesAtTimestamps(timestamps)) {
    // INFO: `null` is a timestamp ahead of the first decodable frame; the sequence simply starts at the next one.
    if (!sample) {
      yield null;

      continue;
    }

    try {
      // WARN: Closed inside the draw, not after the yield — iOS holds a decoder buffer per open sample, and § 13.4.2.'s crop step reached the memory limit keeping one alive across the inference.
      yield (context) => {
        sample.draw(context, 0, 0, size.width, size.height);
        sample.close();
      };
    } finally {
      sample.close();
    }
  }
}
