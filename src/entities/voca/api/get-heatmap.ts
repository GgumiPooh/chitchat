import "server-only";

import { getDb, vocaReviews } from "@/shared/db";
import { A_DAY, type UserId } from "@/shared/lib";
import { and, eq, gte, sql } from "drizzle-orm";
import { toVocaHeatmapLevel, type VocaHeatmapDay } from "../model/types";

export async function getVocaHeatmap(userId: UserId, weeks = 52): Promise<VocaHeatmapDay[]> {
  const db = getDb();
  const daysAgo = weeks * 7;
  const startDate = new Date(Date.now() - daysAgo * A_DAY);

  const rows = await db
    .select({
      dayKey: sql<string>`to_char(("reviewed_at" AT TIME ZONE 'Asia/Seoul' - interval '4 hours'), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(vocaReviews)
    .where(and(eq(vocaReviews.userId, userId), gte(vocaReviews.reviewedAt, startDate)))
    .groupBy(sql`1`);

  return rows.map((row) => ({
    dayKey: row.dayKey,
    count: row.count,
    level: toVocaHeatmapLevel(row.count),
  }));
}
