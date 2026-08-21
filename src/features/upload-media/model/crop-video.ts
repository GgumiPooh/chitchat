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
): Promise<File> {
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  // INFO: § 12.1.'s ceiling applied to the crop rather than to the source, so a rectangle taken out of a 4K clip is stored at the size a background is drawn at.
  const size = fitWithin(crop.width, crop.height, maxEdge);
  const conversion = await Conversion.init({
    input: new Input({ source: new BlobSource(file), formats: INPUT_FORMATS }),
    output,
    audio: { discard: true },
    // WARN: `fit: "fill"` and not `cover`. The box below is the crop's own aspect ratio, so there is nothing to letterbox or to trim off — but `cover` would re-crop a box that rounding left a pixel out of.
    // INFO: § 9. The same ceiling an attachment is cut to — this is already a full re-encode, so bounding the bitrate costs nothing further.
    video: {
      crop,
      width: size.width,
      height: size.height,
      fit: "fill",
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
 * The crop rectangle in the source video's own pixels.
 *
 * WARN: Every field is rounded to an even number. A crop is a re-encode, and the
 * 4:2:0 chroma planes every codec here writes are half-resolution — an odd width or
 * an odd offset is rejected outright by some encoders and silently shifts the colour
 * planes by half a pixel in the rest.
 */
export function toEvenCrop(rectangle: CropRectangle): CropRectangle {
  return {
    left: toEven(rectangle.left),
    top: toEven(rectangle.top),
    width: Math.max(2, toEven(rectangle.width)),
    height: Math.max(2, toEven(rectangle.height)),
  };
}

function toEven(value: number): number {
  return Math.round(value / 2) * 2;
}

function toCroppedName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.mp4`;
}
