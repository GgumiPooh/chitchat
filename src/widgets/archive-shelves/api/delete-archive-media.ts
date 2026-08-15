import { request } from "@/shared/api";
import { ARCHIVE_PATH } from "@/shared/config";
import type { MediaId } from "@/shared/lib";

/**
 * What the server actually took, which is not always what was asked for.
 *
 * WARN: `deletedIds` can be **shorter than the request**: `destroyArchiveMedia` guards on
 * `deleted_at IS NULL` and on `isInLibrary()`, so an id already destroyed by another
 * device, or one that never reached the shelf, is silently left alone. The caller
 * reconciles against this array and never against what it sent.
 */
export type ArchiveRemovalResult = {
  deletedIds: MediaId[];
};

/**
 * REQUIREMENTS.md § 18. #1. Destroys the objects behind these tiles — 보관함's only
 * removal, and the bubble each was sent in draws a tombstone from then on.
 *
 * WARN: `ids` is plain `string[]` where the answer is branded. These are the ids the
 * selection is holding, which reach it through a DOM attribute the sweep reads back
 * (`ArchiveGrid`); `snowflakeSchema` is what brands them, at the route, which is where
 * CLAUDE.md § 3.2. puts that step. The response comes back through it already branded.
 */
export async function deleteArchiveMedia(ids: string[]): Promise<ArchiveRemovalResult> {
  const response = await request(ARCHIVE_PATH, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    throw new Error(`DELETE ${ARCHIVE_PATH} responded ${response.status}`);
  }

  return (await response.json()) as ArchiveRemovalResult;
}
