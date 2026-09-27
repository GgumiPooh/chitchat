import { getDueCards, getVocaHeatmap, getVocaUserSettings } from "@/entities/voca";
import { VocaDashboardPage } from "@/pages/voca";
import { requireUserOrRedirect } from "@/shared/auth";
import { VOCA_ACTION_ADD, VOCA_ACTION_PARAM, VOCA_REMINDER_COOKIE_NAME } from "@/shared/config";
import { getDb, vocaCards } from "@/shared/db";
import type { Maybe } from "@/shared/lib";
import { and, count, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";

type PageProps = {
  searchParams: Promise<Record<string, Maybe<string | string[]>>>;
};

export default async function Page({ searchParams }: PageProps) {
  const user = await requireUserOrRedirect();

  const [params, { summary }, heatmap, settings, [totalCardsRow], cookieStore] = await Promise.all([
    searchParams,
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

  const initialOpenAiDialog = params[VOCA_ACTION_PARAM] === VOCA_ACTION_ADD;

  return (
    <VocaDashboardPage
      initialDueSummary={summary}
      initialHeatmap={heatmap}
      initialOpenAiDialog={initialOpenAiDialog}
      initialSettings={effectiveSettings}
      totalCardsCount={Number(totalCardsRow?.count ?? 0)}
    />
  );
}
