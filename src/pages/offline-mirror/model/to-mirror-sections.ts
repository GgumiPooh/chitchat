import type { ArchiveMedia } from "@/entities/media";
import { formatYearMonth, idToDate, toDayKey } from "@/shared/lib";

export type MirrorSection = {
  monthKey: string;
  label: string;
  media: ArchiveMedia[];
};

/**
 * 보관함's month sections (DESIGN.md § 7.10.), grouped for a list that is not
 * virtualized — the mirror holds one page, so a section carries its own rows rather
 * than an index into a flat track.
 *
 * WARN: The instant comes off the id, which is the order the shelf is already in, and
 * the month off `toDayKey` so a tile sent at 00:30 KST falls under the month it was
 * actually sent in.
 */
export function toMirrorSections(media: ArchiveMedia[]): MirrorSection[] {
  const sections: MirrorSection[] = [];

  media.forEach((item) => {
    const monthKey = toDayKey(idToDate(item.id)).slice(0, 7);
    const current = sections.at(-1);

    if (current?.monthKey === monthKey) {
      current.media.push(item);

      return;
    }

    sections.push({ monthKey, label: formatYearMonth(idToDate(item.id)), media: [item] });
  });

  return sections;
}
