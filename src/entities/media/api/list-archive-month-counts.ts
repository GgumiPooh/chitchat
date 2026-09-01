import "server-only";

import type { ArchiveModeFilter, LibraryShelf } from "@/shared/config";
import { getDb, media } from "@/shared/db";
import { SNOWFLAKE_EPOCH, type UserId } from "@/shared/lib";
import { and, desc, sql } from "drizzle-orm";
import type { ArchiveMonthCount } from "../model/types";
import { isInLibrary, isOfShelf } from "./list-archive-media";

// INFO: REQUIREMENTS.md § 6. The id's own timestamp bits, decoded in SQL against the same `SNOWFLAKE_EPOCH` as `idToDate` — a row here and its client-side month header can never name a different month for the same id.
const MONTH_KEY = sql<string>`to_char(
  to_timestamp(((${media.id} >> 20) + ${sql.raw(SNOWFLAKE_EPOCH.toString())}) / 1000.0)
    AT TIME ZONE 'Asia/Seoul',
  'YYYY-MM'
)`;

/**
 * REQUIREMENTS.md § 10., AGENTS.md § 4.1. Every month a shelf has ever held a tile
 * in, newest first, with the shelf's own true count for each — the `lg` panel's
 * month list is built from this rather than from whatever `listArchiveMedia` has
 * paged in so far. Filters on the same predicate as `listArchiveMedia`
 * (`isInLibrary` + `isOfShelf`, `modeFilter` included), or a count could list a
 * month the grid can never actually show a tile from.
 */
export async function listArchiveMonthCounts(
  shelf: LibraryShelf,
  currentUserId: UserId,
  modeFilter: ArchiveModeFilter = "all",
): Promise<ArchiveMonthCount[]> {
  return getDb()
    .select({ monthKey: MONTH_KEY, count: sql<number>`count(*)::int` })
    .from(media)
    .where(and(isInLibrary(currentUserId, modeFilter), isOfShelf(shelf)))
    .groupBy(MONTH_KEY)
    .orderBy(desc(MONTH_KEY));
}
