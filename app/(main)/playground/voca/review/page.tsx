import { countAheadCards, getAheadCards, getDueCards, getVocaUserSettings } from "@/entities/voca";
import { VocaReviewPage } from "@/pages/voca";
import { requireUserOrRedirect } from "@/shared/auth";
import type { Maybe } from "@/shared/lib";

type PageProps = {
  searchParams: Promise<Record<string, Maybe<string | string[]>>>;
};

export default async function Page({ searchParams }: PageProps) {
  const [params, user] = await Promise.all([searchParams, requireUserOrRedirect()]);

  const isPractice = params.mode === "ahead";

  if (isPractice) {
    const [aheadCards, settings] = await Promise.all([
      getAheadCards(user.id, 15),
      getVocaUserSettings(user.id),
    ]);

    return (
      <VocaReviewPage
        canReviewAhead={aheadCards.length > 0}
        desiredRetention={settings.desiredRetention}
        initialDueCards={aheadCards}
        isPractice={true}
        newCardsRemaining={0}
      />
    );
  }

  const [{ dueCards, newCardsRemaining }, settings, aheadCardsCount] = await Promise.all([
    getDueCards(user.id),
    getVocaUserSettings(user.id),
    countAheadCards(user.id),
  ]);

  return (
    <VocaReviewPage
      canReviewAhead={aheadCardsCount > 0}
      desiredRetention={settings.desiredRetention}
      initialDueCards={dueCards}
      isPractice={false}
      newCardsRemaining={newCardsRemaining}
    />
  );
}
