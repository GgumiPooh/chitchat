import type { MediaDraft } from "@/entities/media";
import { ensure } from "@/shared/lib";
import {
  EDITED_AVIF_QUALITY,
  EDITED_MAX_EDGE,
  STILL_IMAGE_MAX_EDGE,
  createCanvas,
  encodeCanvas,
  encodeCanvasLossless,
  fitWithin,
  loadImage,
  renderThumbnail,
  supportsCanvasFilter,
  toExtension,
} from "./canvas";
import { DEFAULT_FILTER, type MediaFilter } from "./filters";

/** A clockwise quarter-turn count, in degrees — what both editors' 회전 steps through. */
export type Rotation = 0 | 90 | 180 | 270;

export const ROTATION_STEP = 90;

export function toNextRotation(rotate: Rotation): Rotation {
  return ((rotate + ROTATION_STEP) % 360) as Rotation;
}

/** The crop rectangle in the **rotated** image's pixels — `react-advanced-cropper` reports `getCoordinates()` against the image as turned, width and height swapped at 90° and 270°. */
export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Bakes the crop and the filter into a new JPEG and re-derives everything that
 * hangs off the pixels — dimensions and thumbnail both, since a crop changes the
 * aspect ratio the bubble reserves its box from (REQUIREMENTS.md § 8.3.).
 *
 * WARN: The caller owns the old draft's `previewUrl` and must revoke it — this
 * returns a new object rather than mutating, so nothing here can reach it.
 */
export type ApplyEditOptions = {
  filter?: MediaFilter;
  // WARN: REQUIREMENTS.md § 13.4. Set by the emoticon editor alone, to `image/png` so the crop keeps its alpha — every other caller leaves it unset and takes the § 9. still-image format, which is AVIF wherever the browser can encode one.
  outputMime?: string;
  maxEdge?: number;
  rotate?: Rotation;
  // INFO: REQUIREMENTS.md § 13.4. The emoticon crop writes PNG outright, so no number of crops adds a generation — its lossy pass is at 저장.
  lossless?: boolean;
};

export async function applyEdit(
  draft: MediaDraft,
  crop: CropArea,
  {
    filter = DEFAULT_FILTER,
    outputMime,
    maxEdge = STILL_IMAGE_MAX_EDGE,
    rotate = 0,
    lossless = false,
  }: ApplyEditOptions = {},
): Promise<MediaDraft> {
  const sourceUrl = URL.createObjectURL(draft.file);

  try {
    const image = await loadImage(sourceUrl);
    // WARN: `EDITED_MAX_EDGE` is applied over whatever the caller asked for, never instead of it — it is the iOS canvas-pixel ceiling, so a caller's own cap may be smaller but must never exceed it.
    const size = fitWithin(crop.width, crop.height, Math.min(maxEdge, EDITED_MAX_EDGE));
    const canvas = createCanvas(size.width, size.height);
    const context = ensure(canvas.getContext("2d"), "2d context unavailable");

    if (filter.value !== "none" && supportsCanvasFilter(context)) {
      context.filter = filter.value;
    }

    // INFO: The turn is a context transform rather than an intermediate canvas — a full-size copy of the source would meet `EDITED_MAX_EDGE`'s ceiling before the crop ever shrank it.
    context.scale(size.width / crop.width, size.height / crop.height);
    context.translate(-crop.x, -crop.y);
    rotateContext(context, rotate, image.naturalWidth, image.naturalHeight);
    context.drawImage(image, 0, 0);

    // WARN: A named mime is the **fallback**, not the target — a caller that wants PNG outright says `lossless`.
    const edited = lossless
      ? await encodeCanvasLossless(canvas)
      : await encodeCanvas(canvas, EDITED_AVIF_QUALITY, false, outputMime);
    const {
      blob: thumbnail,
      blurhash,
      mime: thumbnailMime,
    } = await renderThumbnail(canvas, size.width, size.height, outputMime);

    return {
      id: draft.id,
      file: new File([edited.blob], toEditedName(draft.file.name, edited.mime), {
        type: edited.mime,
      }),
      thumbnail,
      thumbnailMime,
      previewUrl: URL.createObjectURL(thumbnail),
      mime: edited.mime,
      width: size.width,
      height: size.height,
      durationMs: null,
      // WARN: Re-derived with the rest, never carried over from `draft`. A crop or a filter is a different picture, and a stale hash blurs to the one the user edited away from.
      blurhash,
      filename: null,
      waveformPeaks: null,
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

/** Maps the source's pixels onto the rotated image's space — the one `CropArea` is measured in — so a clockwise turn lands the source's top-left corner at the rotated image's top-right. */
function rotateContext(
  context: CanvasRenderingContext2D,
  rotate: Rotation,
  width: number,
  height: number,
) {
  if (rotate === 90) {
    context.translate(height, 0);
  } else if (rotate === 180) {
    context.translate(width, height);
  } else if (rotate === 270) {
    context.translate(0, width);
  }

  context.rotate((rotate * Math.PI) / 180);
}

function toEditedName(name: string, mime: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.${toExtension(mime)}`;
}
