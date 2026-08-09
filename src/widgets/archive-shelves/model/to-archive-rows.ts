import type { ArchiveMedia } from "@/entities/media";
import { toArchiveSections } from "./to-archive-sections";

/** DESIGN.md § 7.10. Three tiles abreast — the grid's own column count, and the stride the flat cell list is cut into rows on. */
export const ARCHIVE_GRID_COLUMNS = 3;

/**
 * One virtualized row of the 사진 grid — a month label, or one line of up to
 * `ARCHIVE_GRID_COLUMNS` tiles (REQUIREMENTS.md § 8.3., DESIGN.md § 7.10.).
 *
 * INFO: A row of tiles rather than a tile, so a month header is a row of the same
 * list rather than a band floating over it. That is what keeps the header scrolling
 * with the grid, which DESIGN.md § 7.10. requires and `sticky` got wrong.
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
export function toArchiveRows(media: ArchiveMedia[]): ArchiveGridRow[] {
  const rows: ArchiveGridRow[] = [];

  for (const section of toArchiveSections(media)) {
    rows.push({ kind: "month", key: `month:${section.monthKey}`, label: section.label });

    for (let offset = 0; offset < section.count; offset += ARCHIVE_GRID_COLUMNS) {
      const startIndex = section.startIndex + offset;
      const first = media[startIndex];

      if (!first) {
        continue;
      }

      rows.push({
        kind: "tiles",
        key: `tiles:${first.id}`,
        startIndex,
        count: Math.min(ARCHIVE_GRID_COLUMNS, section.count - offset),
      });
    }
  }

  return rows;
}
