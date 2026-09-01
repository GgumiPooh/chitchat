import { listArchiveMedia } from "@/entities/media";
import { ArchiveVoicePage } from "@/pages/archive";
import { requireUserOrRedirect } from "@/shared/auth";
import { ARCHIVE_MODE_PARAM, toArchiveModeFilter } from "@/shared/config";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const user = await requireUserOrRedirect();
  const params = await searchParams;
  const modeFilter = toArchiveModeFilter(params[ARCHIVE_MODE_PARAM]);

  return (
    <ArchiveVoicePage
      key={modeFilter}
      modeFilter={modeFilter}
      initialMedia={await listArchiveMedia({ shelf: "voice", currentUserId: user.id, modeFilter })}
    />
  );
}
