import { BACKGROUND_MAX_EDGE } from "@/shared/config";
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
  type CropRectangle,
  type Rotation,
  type VideoSample,
} from "mediabunny";
import { fitWithin } from "./canvas";
import { bitrateCeilingFor } from "./optimize-video";

// INFO: REQUIREMENTS.md § 12.1. MP4 whatever the source was, for `trimVideo`'s reason — it is the one container every browser the app runs in plays back.
const CROPPED_MIME = "video/mp4";

// INFO: `trimVideo`'s list and its bundle argument, unchanged — a demuxer per container, tree-shaken to `ALLOWED_VIDEO_MIMES`.
const INPUT_FORMATS = [MP4, QTFF, WEBM];

/**
 * Cuts a rectangle out of a video, in the browser, and answers the result as a
 * `File` ready for the § 9. upload pipeline (REQUIREMENTS.md § 12.1.).
 *
 * WARN: This costs what `trimVideo` does not. A trim copies the encoded samples
 * across whenever the source codec fits the output container; a spatial crop rewrites
 * every frame, so it is a full decode-and-re-encode — slower, and lossy where the trim
 * is not. It stays affordable only because § 12.1.'s caps bound the source at 30s and
 * 20MB before this is ever reached.
 *
 * WARN: The audio track is discarded for `trimVideo`'s reason, and it is not only a
 * size decision — a background plays `muted`, and dropping the track keeps the whole
 * operation on WebCodecs' video interfaces, which Safari has had since 16.4.
 */
export async function cropVideo(
  file: File,
  crop: CropRectangle,
  maxEdge: number = BACKGROUND_MAX_EDGE,
  rotate: Rotation = 0,
): Promise<File> {
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  // INFO: § 12.1.'s ceiling applied to the crop rather than to the source, so a rectangle taken out of a 4K clip is stored at the size a background is drawn at.
  const size = fitWithin(crop.width, crop.height, maxEdge);
  const conversion = await Conversion.init({
    input: new Input({ source: new BlobSource(file), formats: INPUT_FORMATS }),
    output,
    audio: { discard: true },
    // WARN: Cropped in `process`, never through the `crop` option — REQUIREMENTS.md § 12.1. names the WebKit bug that returns the whole frame otherwise.
    // INFO: § 9. The same ceiling an attachment is cut to — this is already a full re-encode, so bounding the bitrate costs nothing further.
    video: {
      rotate,
      process: toCropProcessor(crop, size),
      processedWidth: size.width,
      processedHeight: size.height,
      quality: new Quality({ bitrate: bitrateCeilingFor(Math.max(size.width, size.height)) }),
    },
  });

  // INFO: `trimVideo`'s check. A source whose video track this browser cannot decode is reported rather than thrown as an opaque failure.
  if (!conversion.isValid) {
    throw new Error("video track cannot be converted");
  }

  await conversion.execute();

  const buffer = output.target.buffer;

  if (!buffer) {
    throw new Error("conversion produced no output");
  }

  return new File([buffer], toCroppedName(file.name), { type: CROPPED_MIME });
}

/**
 * Draws each frame into a canvas of the crop's own box and hands that back, which is
 * how the rectangle is applied without ever naming a source rectangle.
 *
 * WARN: A five-argument `drawImage`, and that is the whole fix. For a decoder-produced
 * `VideoFrame`, WebKit ignores the source rectangle of the nine-argument form, of
 * `createImageBitmap` and of `visibleRect` alike — every one draws the full frame
 * scaled into the destination, which is what `mediabunny`'s own `crop` came out as on
 * Safari and every iOS browser. Offsetting the whole frame gives it nothing to ignore.
 *
 * INFO: The frame arrives already turned: `Conversion` applies the track's own
 * rotation and the `rotate` option in `transform` before `process` is handed the
 * sample, so `crop` is measured against the rotated poster and nothing here turns.
 *
 * INFO: One canvas for the whole clip — `mediabunny` copies a returned canvas into a
 * `VideoSample` synchronously, before the next frame is handed in.
 */
function toCropProcessor(crop: CropRectangle, size: { width: number; height: number }) {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("offscreen canvas has no 2d context");
  }

  const scaleX = size.width / crop.width;
  const scaleY = size.height / crop.height;

  return (sample: VideoSample) => {
    sample.draw(
      context,
      -crop.left * scaleX,
      -crop.top * scaleY,
      sample.displayWidth * scaleX,
      sample.displayHeight * scaleY,
    );

    return canvas;
  };
}

/**
 * The crop rectangle in the source video's own pixels.
 *
 * WARN: Every field is rounded to an even number. A crop is a re-encode, and the
 * 4:2:0 chroma planes every codec here writes are half-resolution — an odd width or
 * an odd offset is rejected outright by some encoders and silently shifts the colour
 * planes by half a pixel in the rest.
 *
 * WARN: Rounded up, a full-frame stencil on an odd `frame` lands outside it — which
 * a canvas draw clamped away but ffmpeg's `crop` refuses outright (`animateImage`).
 */
export function toEvenCrop(
  rectangle: CropRectangle,
  frame: { width: number; height: number },
): CropRectangle {
  const bounds = { width: toEvenDown(frame.width), height: toEvenDown(frame.height) };
  const width = clamp(toEven(rectangle.width), 2, bounds.width);
  const height = clamp(toEven(rectangle.height), 2, bounds.height);

  return {
    left: clamp(toEven(rectangle.left), 0, bounds.width - width),
    top: clamp(toEven(rectangle.top), 0, bounds.height - height),
    width,
    height,
  };
}

function toEven(value: number): number {
  return Math.round(value / 2) * 2;
}

function toEvenDown(value: number): number {
  return Math.floor(value / 2) * 2;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

function toCroppedName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.mp4`;
}
