import { listArchiveMedia } from "@/entities/media";
import { ArchiveFilesPage } from "@/pages/archive";
import { requireUserOrRedirect } from "@/shared/auth";

export default async function Page() {
  const user = await requireUserOrRedirect();

  return (
    <ArchiveFilesPage
      initialMedia={await listArchiveMedia({ shelf: "file", currentUserId: user.id })}
    />
  );
}
