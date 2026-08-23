import { A_SECOND, ensure, type Nullable } from "@/shared/lib";
import type { CropRectangle, Rotation } from "mediabunny";
import {
  ATTEMPTS,
  AnimateVideoError,
  CUTOUT_ATTEMPTS,
  MATTE_SHARE,
  encodeAnimation,
  toEncodedFrames,
  type EncodeSource,
} from "./animate-encode";
import { fitWithin } from "./canvas";
import { toEvenEdge } from "./ffmpeg-runtime";
import { matteFrames, type DrawMatteFrame } from "./matte-video";
import type { EncodeProgress, OptimizedMedia } from "./optimize-result";

// INFO: A GIF that declares no delay is played at this by every browser, and an animated WebP frame carries its own duration in every case.
const DEFAULT_FRAME_DURATION = A_SECOND / 10;

// INFO: `VideoFrame.duration` is microseconds, and `@/shared/lib`'s durations stop at the millisecond.
const MICROS_PER_MILLISECOND = 1_000;

export type AnimateImageOptions = {
  /** REQUIREMENTS.md § 13.4.2. Matte every frame before encoding. */
  cutout?: boolean;
};

/**
 * REQUIREMENTS.md § 13.4.1. Re-crops, re-turns and — where asked — cuts the
 * background out of an animation that is already an animation, without ever
 * flattening it to the single frame a canvas re-encode would give.
 *
 * `crop` is in the source animation's own pixels and already even (`toEvenCrop`);
 * `null` keeps the whole frame.
 *
 * WARN: The crop is folded into this one encode rather than taken as a pass of its
 * own — an animated WebP is lossy, so a separate crop would spend a whole extra
 * generation on bytes that already are one.
 *
 * WARN: The frames go through `ImageDecoder` whether or not they are matted. The
 * bundled ffmpeg is 5.1.4, whose WebP decoder ignores `ANMF` — handed the animation's
 * own bytes it keeps frame 0 alone, which is the flattening § 13.4.1. forbids.
 */
export async function animateImage(
  file: File,
  maxEdge: number,
  crop: Nullable<CropRectangle>,
  rotate: Rotation = 0,
  onProgress?: EncodeProgress,
  { cutout = false }: AnimateImageOptions = {},
): Promise<OptimizedMedia> {
  const decoder = toDecoder(file, new Uint8Array(await file.arrayBuffer()));

  try {
    const timeline = await readTimeline(decoder);
    const region = crop ?? { left: 0, top: 0, width: timeline.width, height: timeline.height };
    const turned =
      rotate % 180 === 0
        ? { width: region.width, height: region.height }
        : { width: region.height, height: region.width };
    const fitted = fitWithin(turned.width, turned.height, maxEdge);
    const size = { width: toEvenEdge(fitted.width), height: toEvenEdge(fitted.height) };
    const source = await toFrameSource(decoder, timeline, region, rotate, size, cutout, onProgress);

    return await encodeAnimation(file, source, size, timeline.seconds, onProgress, {
      matted: cutout,
    });
  } finally {
    decoder.close();
  }
}

function toDecoder(file: File, bytes: Uint8Array): ImageDecoder {
  // WARN: No fall back to frame 0 — that is a picture, and § 13.4. is explicit that a picture is not what the animated slot holds.
  if (typeof ImageDecoder === "undefined") {
    throw new AnimateVideoError("decode", "this browser cannot decode an animation's frames");
  }

  return new ImageDecoder({ data: bytes, type: file.type });
}

type Timeline = {
  /** The cumulative end of each source frame, in seconds — an animation is variable-delay and the encode is not. */
  ends: number[];
  seconds: number;
  width: number;
  height: number;
};

// INFO: A decoding pass of its own because `ImageDecoder` carries a duration only on a decoded frame, and `matteFrames` needs the total ahead of the frames to report progress against.
async function readTimeline(decoder: ImageDecoder): Promise<Timeline> {
  await decoder.completed;

  const frameCount = decoder.tracks.selectedTrack?.frameCount ?? 1;
  const ends: number[] = [];
  let seconds = 0;
  let size: Nullable<{ width: number; height: number }> = null;

  for (let index = 0; index < frameCount; index++) {
    const { image } = await decoder.decode({ frameIndex: index });

    try {
      const milliseconds =
        image.duration != null ? image.duration / MICROS_PER_MILLISECOND : DEFAULT_FRAME_DURATION;

      seconds += milliseconds / A_SECOND;
      ends.push(seconds);
      size ??= { width: image.displayWidth, height: image.displayHeight };
    } finally {
      image.close();
    }
  }

  const { width, height } = ensure(size, "the animation decoded no frame");

  return { ends, seconds, width, height };
}

async function toFrameSource(
  decoder: ImageDecoder,
  timeline: Timeline,
  crop: CropRectangle,
  rotate: Rotation,
  size: { width: number; height: number },
  cutout: boolean,
  onProgress?: EncodeProgress,
): Promise<EncodeSource> {
  const fps = (cutout ? CUTOUT_ATTEMPTS : ATTEMPTS)[0].fps;
  const count = Math.max(1, Math.round(timeline.seconds * fps));
  const matted = await matteFrames(
    {
      count,
      frames: toResampledFrames(decoder, timeline, count, fps, toFrameDraw(crop, rotate, size)),
    },
    size,
    // INFO: Unmatted, the walk is a draw per frame — far too fast to be worth the share of the bar the encode then reports 0 → 1 across.
    cutout ? (ratio) => onProgress?.(ratio * MATTE_SHARE) : () => undefined,
    { matte: cutout },
  );

  return { kind: "frames", frames: await toEncodedFrames(matted), fps };
}

/** INFO: One decode per source frame however many output slots it fills, since `t` only ever moves forward. */
async function* toResampledFrames(
  decoder: ImageDecoder,
  timeline: Timeline,
  count: number,
  fps: number,
  draw: (context: OffscreenCanvasRenderingContext2D, frame: VideoFrame) => void,
): AsyncGenerator<Nullable<DrawMatteFrame>> {
  let decodedIndex = -1;
  let decoded: Nullable<VideoFrame> = null;

  try {
    for (let index = 0; index < count; index++) {
      const sourceIndex = toSourceIndex(timeline.ends, index / fps);

      if (sourceIndex !== decodedIndex) {
        decoded?.close();
        decoded = (await decoder.decode({ frameIndex: sourceIndex })).image;
        decodedIndex = sourceIndex;
      }

      const frame = ensure(decoded, "the animation decoded no frame");

      yield (context) => draw(context, frame);
    }
  } finally {
    decoded?.close();
  }
}

function toSourceIndex(ends: number[], seconds: number): number {
  const index = ends.findIndex((end) => seconds < end);

  return index === -1 ? ends.length - 1 : index;
}

/**
 * WARN: A five-argument `drawImage` offsetting the whole frame, for `cropVideo`'s
 * reason — WebKit ignores the source rectangle of the nine-argument form, of
 * `createImageBitmap` and of `visibleRect` alike on a decoder-produced `VideoFrame`,
 * which is exactly what `ImageDecoder` hands back.
 */
function toFrameDraw(
  crop: CropRectangle,
  rotate: Rotation,
  size: { width: number; height: number },
) {
  const upright = rotate % 180 === 0;
  const scaleX = (upright ? size.width : size.height) / crop.width;
  const scaleY = (upright ? size.height : size.width) / crop.height;
  const origin = {
    0: { x: 0, y: 0 },
    90: { x: size.width, y: 0 },
    180: { x: size.width, y: size.height },
    270: { x: 0, y: size.height },
  }[rotate];

  return (context: OffscreenCanvasRenderingContext2D, frame: VideoFrame) => {
    context.save();
    context.translate(origin.x, origin.y);
    context.rotate((rotate * Math.PI) / 180);
    context.drawImage(
      frame,
      -crop.left * scaleX,
      -crop.top * scaleY,
      frame.displayWidth * scaleX,
      frame.displayHeight * scaleY,
    );
    context.restore();
  };
}
