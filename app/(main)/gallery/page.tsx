import { listGalleryMedia } from "@/entities/media";
import { GalleryPage } from "@/pages/gallery";

export default async function Page() {
  return <GalleryPage initialMedia={await listGalleryMedia()} />;
}
