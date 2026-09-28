import { listTimeLetters } from "@/entities/time-letter";
import { listUsers } from "@/entities/user";
import { TimeLettersPage } from "@/pages/time-letters";
import { requireUserOrRedirect } from "@/shared/auth";

export type PageProps = {
  searchParams: Promise<{ action?: string; id?: string }>;
};

export default async function Page({ searchParams }: PageProps) {
  const user = await requireUserOrRedirect();
  const { id } = await searchParams;

  const [result, participants] = await Promise.all([
    listTimeLetters({
      currentUserId: user.id,
      limit: 20,
    }),
    listUsers(),
  ]);

  const currentUserName = participants.find((p) => p.id === user.id)?.name;
  const partnerName = participants.find((p) => p.id !== user.id)?.name ?? "상대방";

  return (
    <TimeLettersPage
      currentUserId={user.id}
      currentUserName={currentUserName}
      partnerName={partnerName}
      initialLetters={result.items}
      initialNextCursor={result.nextCursor}
      initialHasMore={result.hasMore}
      initialLetterId={id}
    />
  );
}
