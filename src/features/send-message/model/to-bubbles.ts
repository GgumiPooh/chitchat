import type { MediaDraft } from "@/entities/media";
import { MAX_MEDIA_PER_MESSAGE } from "@/shared/config";

/**
 * WARN: REQUIREMENTS.md § 9.3. Three kinds, not the two `filename` used to answer.
 * A recording carries no filename, so a two-way split grouped it with the photos
 * either side of it — one bubble whose first cell decides the layout for all of
 * them, which draws a voice card through the photo grid.
 */
export type DraftKind = "voice" | "file" | "media";

export function toDraftKind(draft: MediaDraft): DraftKind {
  if (draft.waveformPeaks) {
    return "voice";
  }

  return draft.filename ? "file" : "media";
}

/**
 * The bubbles a pick becomes (REQUIREMENTS.md § 18. #10., § 9.1.).
 *
 * WARN: A bubble is photos **or** files **or** one recording, never a mix — the
 * three are drawn by different layouts at different heights, § 6. gives one
 * `messages` row one of them, and `ownsAllMedia` refuses a mixed set at the server
 * rather than trusting the client to have split it.
 *
 * WARN: Consecutive runs, never a partition by kind. A pick of photo, file, photo
 * stays in the order it was made instead of being sorted into two blocks the sender
 * never asked for.
 *
 * INFO: Generic over the item, because 보관함 splits the same way over rows that
 * have already been uploaded (§ 10.) — the rule is the server's, so it must not be
 * written down twice.
 */
export function toBubbles<T>(items: T[], toKind: (item: T) => DraftKind): T[][] {
  return groupConsecutive(items, toKind).flatMap((run) =>
    // INFO: REQUIREMENTS.md § 9.3. A voice bubble is one clip. There is no layout for two, and `ownsAllMedia` refuses a longer set at the server anyway.
    chunk(run, toKind(run[0]) === "voice" ? 1 : MAX_MEDIA_PER_MESSAGE),
  );
}

function groupConsecutive<T, K>(items: T[], toKey: (item: T) => K): T[][] {
  const runs: T[][] = [];

  for (const item of items) {
    const run = runs.at(-1);

    if (run && toKey(run[0]) === toKey(item)) {
      run.push(item);
      continue;
    }

    runs.push([item]);
  }

  return runs;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
