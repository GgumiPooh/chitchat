import { request } from "@/shared/api";
import { ARCHIVE_PATH } from "@/shared/config";
import type { MediaId } from "@/shared/lib";

/**
 * RESTRUCTURE.md § 4.1. Which of the two removals is being asked for.
 *
 * WARN: They are not degrees of the same thing. `hide` takes a tile off the shared shelf
 * and touches neither the bubble nor the bytes; `delete` destroys the object, and the
 * bubble it was sent in draws a tombstone from then on. Both are open to either
 * participant. The screen must never present one as a stronger version of the other.
 *
 * INFO: `hide` is the default on the wire as well as here, so a tab left open across the deploy goes on doing exactly what it did.
 */
export type ArchiveRemovalMode = "hide" | "delete";

/**
 * What the server actually took, which is not always what was asked for.
 *
 * WARN: RESTRUCTURE.md § 4.1. `deletedIds` can still be **shorter than the request**,
 * though no longer because of who uploaded what: `destroyArchiveMedia` guards on
 * `deleted_at IS NULL` and on `isInLibrary()`, so an id already destroyed by another
 * device, or one that never reached the shelf, is silently left alone. The caller
 * reconciles against these two arrays and never against what it sent.
 */
export type ArchiveRemovalResult = {
  hiddenIds: MediaId[];
  deletedIds: MediaId[];
};

/**
 * REQUIREMENTS.md § 18. #1., RESTRUCTURE.md § 4.1. Removes tiles from the library —
 * hiding them from the shared shelf, or destroying the objects outright.
 *
 * WARN: `ids` is plain `string[]` where the answer is branded. These are the ids the
 * selection is holding, which reach it through a DOM attribute the sweep reads back
 * (`ArchiveGrid`); `snowflakeSchema` is what brands them, at the route, which is where
 * CLAUDE.md § 3.2. puts that step. The response comes back through it already branded.
 *
 * INFO: In `hide` mode the server still decides per id whether that means hiding the photo or deleting an object no bubble was ever rendering; both come back named, and both have left the shelf.
 */
export async function deleteArchiveMedia(
  ids: string[],
  mode: ArchiveRemovalMode = "hide",
): Promise<ArchiveRemovalResult> {
  const response = await request(ARCHIVE_PATH, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, mode }),
  });

  if (!response.ok) {
    throw new Error(`DELETE ${ARCHIVE_PATH} responded ${response.status}`);
  }

  return (await response.json()) as ArchiveRemovalResult;
}
