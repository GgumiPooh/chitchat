import type { ArchiveMedia } from "@/entities/media";
import { toArchiveSections } from "./to-archive-sections";

/** DESIGN.md § 7.10. The mobile default — three tiles abreast, before the first pinch. AGENTS.md § 4.1. Mobile ranges 1–7 by pinch, desktop fixed at 5; `ArchiveGrid` resolves the actual stride and hands it to `toArchiveRows` below. */
export const ARCHIVE_GRID_COLUMNS = 3;

/**
 * One virtualized row of the 갤러리 grid — a month label, or one line of up to
 * `ARCHIVE_GRID_COLUMNS` tiles (REQUIREMENTS.md § 8.3., DESIGN.md § 7.10.). A row
 * of tiles rather than a tile is what keeps the month header scrolling with the
 * grid rather than floating over it.
 */
export type ArchiveGridRow =
  | { key: string; kind: "month"; label: string }
  | { key: string; kind: "tiles"; startIndex: number; count: number };

/**
 * The flat row list the virtualizer counts, built from § 7.10.'s month sections.
 *
 * WARN: REQUIREMENTS.md § 8.3. Every key is derived from content — the month, or the
 * first tile of the line — and never from an index. The window is replaced whole by
 * § 10.'s position jump and grows at the front when an upload prepends, and an
 * index-based key makes every existing row a different row to the virtualizer.
 */
export function toArchiveRows(media: ArchiveMedia[], columns: number): ArchiveGridRow[] {
  const rows: ArchiveGridRow[] = [];

  for (const section of toArchiveSections(media)) {
    rows.push({ kind: "month", key: `month:${section.monthKey}`, label: section.label });

    for (let offset = 0; offset < section.count; offset += columns) {
      const startIndex = section.startIndex + offset;
      const first = media[startIndex];

      if (!first) {
        continue;
      }

      rows.push({
        kind: "tiles",
        key: `tiles:${first.id}`,
        startIndex,
        count: Math.min(columns, section.count - offset),
      });
    }
  }

  return rows;
}
