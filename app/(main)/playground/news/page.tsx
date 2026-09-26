import { listGeeknewsArticles } from "@/entities/geeknews";
import { GeeknewsPage } from "@/pages/geeknews";
import { requireUserOrRedirect } from "@/shared/auth";

export type PageProps = {
  searchParams: Promise<{ id?: string }>;
};

export default async function Page({ searchParams }: PageProps) {
  const user = await requireUserOrRedirect();
  const { id } = await searchParams;
  const articles = await listGeeknewsArticles(user.id);

  return <GeeknewsPage initialArticles={articles} initialArticleId={id} />;
}
