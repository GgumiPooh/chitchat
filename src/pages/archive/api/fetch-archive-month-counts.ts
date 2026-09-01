import type { ArchiveMonthCount } from "@/entities/media";
import { request } from "@/shared/api";
import {
  ARCHIVE_MONTH_COUNTS_PATH,
  type ArchiveModeFilter,
  type LibraryShelf,
} from "@/shared/config";

/** REQUIREMENTS.md § 10. One shelf's month totals under one 보기 옵션 mode, for the `lg` panel. */
export async function fetchArchiveMonthCounts(
  shelf: LibraryShelf,
  modeFilter: ArchiveModeFilter,
): Promise<ArchiveMonthCount[]> {
  const query = new URLSearchParams({ shelf, modeFilter });
  const response = await request(`${ARCHIVE_MONTH_COUNTS_PATH}?${query}`);

  if (!response.ok) {
    throw new Error(`GET ${ARCHIVE_MONTH_COUNTS_PATH} responded ${response.status}`);
  }

  const { months } = (await response.json()) as { months: ArchiveMonthCount[] };

  return months;
}
