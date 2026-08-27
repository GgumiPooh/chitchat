import { listArchiveMedia } from "@/entities/media";
import { ArchiveFilesPage } from "@/pages/archive";
import { requireUserOrRedirect } from "@/shared/auth";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const user = await requireUserOrRedirect();
  const params = await searchParams;
  const rawMode = params["mode"];
  const modeFilter = rawMode === "onlyMe" ? "onlyMe" : rawMode === "shared" ? "shared" : "all";

  return (
    <ArchiveFilesPage
      key={modeFilter}
      initialMedia={await listArchiveMedia({ shelf: "file", currentUserId: user.id, modeFilter })}
    />
  );
}
