import { getDueCards, getVocaUserSettings } from "@/entities/voca";
import { VocaReviewPage } from "@/pages/voca";
import { requireUserOrRedirect } from "@/shared/auth";

export default async function Page() {
  const user = await requireUserOrRedirect();

  const [{ dueCards }, settings] = await Promise.all([
    getDueCards(user.id),
    getVocaUserSettings(user.id),
  ]);

  return <VocaReviewPage initialDueCards={dueCards} desiredRetention={settings.desiredRetention} />;
}
