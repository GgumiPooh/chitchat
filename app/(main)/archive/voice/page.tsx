import { listArchiveMedia } from "@/entities/media";
import { ArchiveVoicePage } from "@/pages/archive";
import { requireUserOrRedirect } from "@/shared/auth";

export default async function Page() {
  const user = await requireUserOrRedirect();

  return (
    <ArchiveVoicePage
      initialMedia={await listArchiveMedia({ shelf: "voice", currentUserId: user.id })}
    />
  );
}
