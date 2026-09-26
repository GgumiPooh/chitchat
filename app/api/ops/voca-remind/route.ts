import "server-only";

import { pushToUser } from "@/entities/push-subscription";
import { getDueCards, toVocaSessionDayKey } from "@/entities/voca";
import { apiError } from "@/shared/api";
import { VOCA_REVIEW_ROUTE } from "@/shared/config";
import { getDb, vocaUserSettings } from "@/shared/db";
import { isOpsCronConfigured, isOpsCronRequest } from "@/shared/ops";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isOpsCronConfigured()) {
    return apiError("unavailable");
  }

  if (!isOpsCronRequest(request)) {
    return apiError("unauthorized");
  }

  const db = getDb();
  const now = new Date();
  const todayKey = toVocaSessionDayKey(now);

  const eligibleUsers = await db
    .select({
      userId: vocaUserSettings.userId,
      lastRemindedDate: vocaUserSettings.lastRemindedDate,
    })
    .from(vocaUserSettings)
    .where(eq(vocaUserSettings.reminderEnabled, true));

  let sent = 0;

  for (const { userId, lastRemindedDate } of eligibleUsers) {
    if (lastRemindedDate === todayKey) {
      continue;
    }

    try {
      const { summary } = await getDueCards(userId, now);

      if (summary.totalDue > 0) {
        await pushToUser(userId, {
          title: "오늘의 영단어 복습",
          body: `오늘 복습할 단어가 ${summary.totalDue}개 있어요!`,
          url: VOCA_REVIEW_ROUTE,
          tag: "voca-reminder",
        });

        await db
          .update(vocaUserSettings)
          .set({ lastRemindedDate: todayKey })
          .where(eq(vocaUserSettings.userId, userId));

        sent++;
      }
    } catch (error) {
      console.error(`[voca-remind] Failed to process user ${userId}:`, error);
    }
  }

  return NextResponse.json({
    sent,
    eligible: eligibleUsers.length,
  });
}
