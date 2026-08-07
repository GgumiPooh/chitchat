import { listArchiveMedia } from "@/entities/media";
import { ArchiveVoicePage } from "@/pages/archive";

export default async function Page() {
  return <ArchiveVoicePage initialMedia={await listArchiveMedia({ kind: "voice" })} />;
}
