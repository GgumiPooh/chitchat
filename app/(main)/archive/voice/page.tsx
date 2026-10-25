import { listArchiveMedia } from "@/entities/media";
import { ArchiveVoicePage } from "@/pages/archive";
import { encryptServerPayload, requireUserOrRedirect } from "@/shared/auth";
import { ARCHIVE_MODE_PARAM, toArchiveModeFilter } from "@/shared/config";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const user = await requireUserOrRedirect();
  const params = await searchParams;
  const modeFilter = toArchiveModeFilter(params[ARCHIVE_MODE_PARAM]);
  const initialMedia = await listArchiveMedia({
    shelf: "voice",
    currentUserId: user.id,
    modeFilter,
  });
  const encryptedMedia = await encryptServerPayload(initialMedia);

  return (
    <ArchiveVoicePage key={modeFilter} modeFilter={modeFilter} encryptedMedia={encryptedMedia} />
  );
}
