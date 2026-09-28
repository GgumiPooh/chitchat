import { request } from "@/shared/api";
import { ARCHIVE_PATH } from "@/shared/config";
import type { MediaId } from "@/shared/lib";

export type MediaRemovalResult = {
  deletedIds: MediaId[];
};

/**
 * Destroys the selected media objects through the archive endpoint.
 * The chat message carrying each destroyed object draws a tombstone in its place.
 */
export async function requestMediaDeletion(ids: MediaId[]): Promise<MediaRemovalResult> {
  const response = await request(ARCHIVE_PATH, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    throw new Error(`DELETE ${ARCHIVE_PATH} responded ${response.status}`);
  }

  return (await response.json()) as MediaRemovalResult;
}
