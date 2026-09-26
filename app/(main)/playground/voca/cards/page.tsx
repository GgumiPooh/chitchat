import { listVocaCards } from "@/entities/voca";
import { VocaCardsPage } from "@/pages/voca";
import { requireUserOrRedirect } from "@/shared/auth";

export default async function Page() {
  const user = await requireUserOrRedirect();

  const { items, nextCursor, hasMore } = await listVocaCards({
    userId: user.id,
    limit: 30,
  });

  return (
    <VocaCardsPage initialCards={items} initialNextCursor={nextCursor} initialHasMore={hasMore} />
  );
}
