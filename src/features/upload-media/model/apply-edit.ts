import type { MediaDraft } from "@/entities/media";
import { ensure } from "@/shared/lib";
import {
  EDITED_MAX_EDGE,
  OUTPUT_MIME,
  createCanvas,
  fitWithin,
  loadImage,
  renderThumbnail,
  supportsCanvasFilter,
  toBlob,
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
export async function applyEdit(
  draft: MediaDraft,
  crop: CropArea,
  filter: MediaFilter = DEFAULT_FILTER,
): Promise<MediaDraft> {
  const sourceUrl = URL.createObjectURL(draft.file);

  try {
    const image = await loadImage(sourceUrl);
    const size = fitWithin(crop.width, crop.height, EDITED_MAX_EDGE);
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

    const blob = await toBlob(canvas);
    const thumbnail = await renderThumbnail(canvas, size.width, size.height);

    return {
      id: draft.id,
      file: new File([blob], toEditedName(draft.file.name), { type: OUTPUT_MIME }),
      thumbnail,
      previewUrl: URL.createObjectURL(thumbnail),
      mime: OUTPUT_MIME,
      width: size.width,
      height: size.height,
      durationMs: null,
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function toEditedName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.jpg`;
}
