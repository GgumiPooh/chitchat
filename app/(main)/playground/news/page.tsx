import { listGeeknewsArticles } from "@/entities/geeknews";
import { GeeknewsPage } from "@/pages/geeknews";
import { requireUserOrRedirect } from "@/shared/auth";
import { GEEKNEWS_PAGE_SIZE } from "@/shared/config";

export type PageProps = {
  searchParams: Promise<{ id?: string }>;
};

export default async function Page({ searchParams }: PageProps) {
  const user = await requireUserOrRedirect();
  const { id } = await searchParams;
  const articles = await listGeeknewsArticles({
    currentUserId: user.id,
    limit: GEEKNEWS_PAGE_SIZE,
  });

  return <GeeknewsPage initialArticles={articles} initialArticleId={id} />;
}
