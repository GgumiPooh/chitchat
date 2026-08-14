import { listArchiveMedia } from "@/entities/media";
import { ArchiveFilesPage } from "@/pages/archive";

export default async function Page() {
  return <ArchiveFilesPage initialMedia={await listArchiveMedia({ shelf: "file" })} />;
}
