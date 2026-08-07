import { listGalleryMedia } from "@/entities/media";
import { GalleryFilesPage } from "@/pages/gallery";

export default async function Page() {
  return <GalleryFilesPage initialMedia={await listGalleryMedia({ kind: "file" })} />;
}
