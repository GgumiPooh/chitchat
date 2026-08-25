import type { ArchiveMedia } from "@/entities/media";
import { formatYearMonth, idToDate, toDayKey } from "@/shared/lib";

/**
 * One month's worth of tiles, under the header of DESIGN.md § 7.10.
 *
 * INFO: A slice of the flat list rather than a copy of it. The viewer swipes
 * through the whole library, not through the month the user opened it in, so
 * every tile has to know its position in the flat order.
 */
export type ArchiveSection = {
  monthKey: string;
  label: string;
  startIndex: number;
  count: number;
};

// WARN: The month comes from `toDayKey`, not `Date.getMonth()` — it resolves in `TIME_ZONE`, so a photo sent at 00:30 KST on the first falls under the right month.
// INFO: The instant is read off the id, the same value the shelf is ordered by — a section boundary can never fall anywhere but between two tiles already in that order.
export function toArchiveSections(media: ArchiveMedia[]): ArchiveSection[] {
  const sections: ArchiveSection[] = [];

  media.forEach((item, index) => {
    const sentAt = idToDate(item.id);
    const monthKey = toDayKey(sentAt).slice(0, 7);
    const current = sections.at(-1);

    if (current?.monthKey === monthKey) {
      current.count += 1;

      return;
    }

    sections.push({
      monthKey,
      label: formatYearMonth(sentAt),
      startIndex: index,
      count: 1,
    });
  });

  return sections;
}

/** AGENTS.md § 4.1. `id` for a shelf's own month `<section>`, what the `lg` panel's month list scrolls to on a shelf with no virtualizer (파일, 음성). */
export function toMonthAnchorId(monthKey: string): string {
  return `archive-month-${monthKey}`;
}
