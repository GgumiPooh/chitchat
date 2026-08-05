import { GALLERY_PATH } from "@/shared/config";

/**
 * REQUIREMENTS.md § 18. #1. Removes tiles from the gallery. The messages that
 * carry them are untouched — the server decides per id whether that means hiding
 * the photo or deleting an object no bubble was ever rendering.
 */
export async function deleteGalleryMedia(ids: string[]): Promise<void> {
  const response = await fetch(GALLERY_PATH, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    throw new Error(`DELETE ${GALLERY_PATH} responded ${response.status}`);
  }
}
