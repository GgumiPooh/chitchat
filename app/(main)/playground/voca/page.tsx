import { getDueCards, getVocaHeatmap, getVocaUserSettings } from "@/entities/voca";
import { VocaDashboardPage } from "@/pages/voca";
import { requireUserOrRedirect } from "@/shared/auth";
import { VOCA_REMINDER_COOKIE_NAME } from "@/shared/config";
import { getDb, vocaCards } from "@/shared/db";
import { and, count, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";

export default async function Page() {
  const user = await requireUserOrRedirect();

  const [{ summary }, heatmap, settings, [totalCardsRow], cookieStore] = await Promise.all([
    getDueCards(user.id),
    getVocaHeatmap(user.id),
    getVocaUserSettings(user.id),
    getDb()
      .select({ count: count() })
      .from(vocaCards)
      .where(and(eq(vocaCards.userId, user.id), isNull(vocaCards.deletedAt))),
    cookies(),
  ]);

  const reminderCookie = cookieStore.get(VOCA_REMINDER_COOKIE_NAME)?.value;
  const effectiveSettings =
    reminderCookie === "true" || reminderCookie === "false"
      ? { ...settings, reminderEnabled: reminderCookie === "true" }
      : settings;

  return (
    <VocaDashboardPage
      initialDueSummary={summary}
      initialHeatmap={heatmap}
      initialSettings={effectiveSettings}
      totalCardsCount={Number(totalCardsRow?.count ?? 0)}
    />
  );
}
