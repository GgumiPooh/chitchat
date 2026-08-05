import type { GalleryMedia } from "@/entities/media";
import { formatYearMonth, toDayKey } from "@/shared/lib";

/**
 * One month's worth of tiles, under the header of DESIGN.md § 7.10.
 *
 * INFO: A slice of the flat list rather than a copy of it. The viewer swipes
 * through the whole gallery, not through the month the user opened it in, so
 * every tile has to know its position in the flat order.
 */
export type GallerySection = {
  monthKey: string;
  label: string;
  startIndex: number;
  count: number;
};

/**
 * WARN: The month comes from `toDayKey`, not from `Date.getMonth()`. It resolves
 * in `TIME_ZONE`, so a photo sent at 00:30 KST on the first falls under the month
 * it was actually taken in rather than the previous one.
 */
export function toGallerySections(media: GalleryMedia[]): GallerySection[] {
  const sections: GallerySection[] = [];

  media.forEach((item, index) => {
    const monthKey = toDayKey(item.createdAt).slice(0, 7);
    const current = sections.at(-1);

    if (current?.monthKey === monthKey) {
      current.count += 1;

      return;
    }

    sections.push({
      monthKey,
      label: formatYearMonth(item.createdAt),
      startIndex: index,
      count: 1,
    });
  });

  return sections;
}
