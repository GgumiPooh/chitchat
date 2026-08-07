import { listArchiveMedia } from "@/entities/media";
import { ArchivePage } from "@/pages/archive";

export default async function Page() {
  return <ArchivePage initialMedia={await listArchiveMedia()} />;
}
