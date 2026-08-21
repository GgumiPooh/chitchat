import type { MediaDraft } from "@/entities/media";
import { ensure } from "@/shared/lib";
import {
  EDITED_AVIF_QUALITY,
  EDITED_MAX_EDGE,
  STILL_IMAGE_MAX_EDGE,
  createCanvas,
  encodeCanvas,
  fitWithin,
  loadImage,
  renderThumbnail,
  supportsCanvasFilter,
  toExtension,
} from "./canvas";
import { DEFAULT_FILTER, type MediaFilter } from "./filters";

/** The crop rectangle in the source image's own pixels, as `react-easy-crop` reports it. */
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
};

export async function applyEdit(
  draft: MediaDraft,
  crop: CropArea,
  { filter = DEFAULT_FILTER, outputMime, maxEdge = STILL_IMAGE_MAX_EDGE }: ApplyEditOptions = {},
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

    context.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      size.width,
      size.height,
    );

    // WARN: § 13.4. A named mime is the **fallback**, not the target — the emoticon editor names PNG so a failed AVIF keeps its alpha, and a crop that forced PNG outright would undo the AVIF the pick had already produced.
    const edited = await encodeCanvas(canvas, EDITED_AVIF_QUALITY, false, outputMime);
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

function toEditedName(name: string, mime: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.${toExtension(mime)}`;
}
