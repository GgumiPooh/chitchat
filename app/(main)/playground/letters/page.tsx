import { listTimeLetters } from "@/entities/time-letter";
import { TimeLettersPage } from "@/pages/time-letters";
import { requireUserOrRedirect } from "@/shared/auth";

export type PageProps = {
  searchParams: Promise<{ action?: string; id?: string }>;
};

export default async function Page({ searchParams }: PageProps) {
  const user = await requireUserOrRedirect();
  const { id } = await searchParams;

  const result = await listTimeLetters({
    currentUserId: user.id,
    limit: 20,
  });

  return (
    <TimeLettersPage
      currentUserId={user.id}
      initialLetters={result.items}
      initialNextCursor={result.nextCursor}
      initialHasMore={result.hasMore}
      initialLetterId={id}
    />
  );
}
