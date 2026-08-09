"use client";

import type { ArchiveMedia } from "@/entities/media";
import { ARCHIVE_PAGE_SIZE, type LibraryKind } from "@/shared/config";
import type { Nullable, Optional } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { josa } from "es-hangul";
import { useCallback, useRef, useState } from "react";
import { fetchArchiveMedia } from "../api/fetch-archive-media";

/**
 * The loaded window of one library segment, newest first. Pages either side are
 * keyset-paginated on the `(created_at, id)` pair (REQUIREMENTS.md § 6., § 10.);
 * the first page arrives from the server render, so opening the tab costs no
 * round trip.
 *
 * INFO: `kind` is fixed for the life of the hook — the two segments are two routes
 * (§ 10.), so switching them remounts rather than refetching in place.
 *
 * INFO: `targetId` is § 10.'s position jump, and the only thing this hook wants from
 * it is whether the window it was handed starts at the newest row or in the middle.
 */
export function useArchiveMedia(
  initialMedia: ArchiveMedia[],
  kind: LibraryKind = "photo",
  targetId?: string,
) {
  const [media, setMedia] = useState(initialMedia);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingNewer, setIsLoadingNewer] = useState(false);
  // INFO: State rather than the ref beside it, because the grid holds the page until its scroller goes still and has to re-render to notice one arriving (§ 8.3.).
  const [hasHeldNewer, setHasHeldNewer] = useState(false);
  const mediaRef = useRef(initialMedia);
  const isLoadingRef = useRef(false);
  const isLoadingNewerRef = useRef(false);
  const heldNewerRef = useRef<ArchiveMedia[]>([]);
  // INFO: A short first page cannot have more behind it, so the downward fetch is never even attempted.
  const hasMoreRef = useRef(initialMedia.length >= ARCHIVE_PAGE_SIZE);
  const hasNewerRef = useRef(toHasNewer(initialMedia, targetId));
  /**
   * WARN: The newest row that came from a **page**, which is not `media[0]` — an
   * upload prepends ahead of it (REQUIREMENTS.md § 10.). Paging upward off `media[0]`
   * asks for rows newer than the upload, which is the newest row in the library, so
   * the empty answer latches `hasNewerRef` off and strands every photo between the
   * jumped window and the live edge behind a scroll that will never reach it.
   *
   * INFO: A position rather than a row, so a 삭제 that removes the tile it names costs
   * nothing — the cursor is compared, never dereferenced.
   */
  const windowTopRef = useRef<Nullable<ArchiveMedia>>(initialMedia[0] ?? null);

  const commit = useCallback((update: (previous: ArchiveMedia[]) => ArchiveMedia[]) => {
    mediaRef.current = update(mediaRef.current);
    setMedia(mediaRef.current);
  }, []);

  const loadMore = useCallback(async () => {
    const oldest = mediaRef.current.at(-1);

    if (isLoadingRef.current || !hasMoreRef.current || !oldest) {
      return;
    }

    isLoadingRef.current = true;
    setIsLoadingMore(true);

    try {
      const older = await fetchArchiveMedia({
        kind,
        before: { createdAt: oldest.createdAt, id: oldest.id },
      });

      hasMoreRef.current = older.length >= ARCHIVE_PAGE_SIZE;

      if (older.length > 0) {
        // INFO: Deduplicated for the same reason chat's window is — the other participant can add a photo between two page requests, which shifts nothing but is cheap to guard.
        commit((previous) => {
          const known = new Set(previous.map((item) => item.id));

          return [...previous, ...older.filter((item) => !known.has(item.id))];
        });
      }
    } catch {
      toast.error(`${josa(LOAD_FAILURE_SUBJECTS[kind], "을/를")} 더 불러오지 못했어요`);
    } finally {
      isLoadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [commit, kind]);

  /**
   * REQUIREMENTS.md § 10. The page directly newer than the window's top, for a window
   * § 10.'s position jump parked in the middle of the shelf.
   *
   * WARN: Measured from `windowTopRef`, which is not `media[0]` — see that ref.
   *
   * WARN: Fetched here and **held**, not committed. Inserting above the reader moves
   * every row below it, and the scroll correction that answers for that is dropped
   * if it lands mid-gesture (§ 8.3.) — the grid owns the timing through
   * `useSettledCommit` and calls `insertNewer` when its scroller has gone still.
   */
  const loadNewer = useCallback(async () => {
    const windowTop = windowTopRef.current;

    if (
      isLoadingNewerRef.current ||
      !hasNewerRef.current ||
      !windowTop ||
      heldNewerRef.current.length > 0
    ) {
      return;
    }

    isLoadingNewerRef.current = true;
    setIsLoadingNewer(true);

    try {
      const newer = await fetchArchiveMedia({
        kind,
        after: { createdAt: windowTop.createdAt, id: windowTop.id },
      });

      // INFO: No generation to check against, unlike § 8.6.1.'s windows. This page is measured from `windowTopRef`, which an upload deliberately does not move — so nothing an upload does while it is in flight can make its rows the wrong ones, and `insertNewer` places them behind that upload rather than in front of it.
      hasNewerRef.current = newer.length >= ARCHIVE_PAGE_SIZE;
      heldNewerRef.current = newer;
      setHasHeldNewer(newer.length > 0);
    } catch {
      toast.error(`${josa(LOAD_FAILURE_SUBJECTS[kind], "을/를")} 더 불러오지 못했어요`);
    } finally {
      isLoadingNewerRef.current = false;
      setIsLoadingNewer(false);
    }
  }, [kind]);

  /**
   * REQUIREMENTS.md § 10. Called by the grid once its scroller is still, so the
   * correction that answers for rows landing above the reader is not dropped
   * mid-gesture (§ 8.3.).
   *
   * INFO: Deduplicated for the reason `loadMore` is, since the other participant can add a photo between two requests.
   * INFO: The window's top moves to this page's newest row, which is what the next upward ask is measured from — an upload prepended ahead of it must not move it (see `windowTopRef`).
   *
   * WARN: Inserted at the page's **sorted place**, never blindly at the front, and that is what makes the two prepends commute. A page is newer than the window and **older** than any upload made during this open, so at the front it would sit ahead of the upload — out of order, which puts a second section carrying an already-used `monthKey` in the list and duplicates a React key. Placed by the shelf's own `(created_at, id)` order it lands behind the upload instead, so neither prepend has to know the other happened.
   */
  const insertNewer = useCallback(() => {
    const held = heldNewerRef.current;

    if (held.length === 0) {
      return;
    }

    heldNewerRef.current = [];
    setHasHeldNewer(false);
    windowTopRef.current = held[0] ?? windowTopRef.current;
    commit((previous) => {
      const known = new Set(previous.map((item) => item.id));
      const rows = held.filter((item) => !known.has(item.id));

      if (rows.length === 0) {
        return previous;
      }

      // INFO: Only an upload can be newer than a page fetched above the window, and an upload is always at the very front — so this scans a handful of rows in the worst case and none in the ordinary one.
      const at = previous.findIndex((item) => !isNewerThan(item, rows[0]));
      const cut = at === -1 ? previous.length : at;

      return [...previous.slice(0, cut), ...rows, ...previous.slice(cut)];
    });
  }, [commit]);

  /**
   * INFO: A just-uploaded photo is the newest one there is, so it goes to the front
   * rather than being re-fetched into place.
   *
   * WARN: It does **not** touch a held page, and that is the point of `insertNewer`
   * placing one by sort order. It used to flush the page here so the upload could not
   * land ahead of it — but that flush went around the grid, which is the only place
   * the scroll correction is armed, so up to `ARCHIVE_PAGE_SIZE` rows were inserted
   * above the reader with nothing holding their offset: an upload finishing while the
   * reader scrolled a jumped window threw the shelf thousands of pixels. The page now
   * waits for the settle it was always meant to wait for.
   *
   * WARN: This prepend alone is uncorrected, and deliberately (`DESIGN.md § 7.10.`) —
   * the reader asked for this row and it belongs at the top of the screen, where a
   * page fetched above them is content they did not ask to be moved by.
   *
   * WARN: `windowTopRef` is deliberately **not** moved. The upload is newer than every
   * page boundary, and paging upward from it asks for rows newer than the newest row
   * there is.
   */
  const prepend = useCallback(
    (added: ArchiveMedia) => {
      commit((previous) => [added, ...previous]);
    },
    [commit],
  );

  const remove = useCallback(
    (ids: string[]) => {
      const removed = new Set(ids);

      commit((previous) => previous.filter((item) => !removed.has(item.id)));
    },
    [commit],
  );

  return {
    media,
    isLoadingMore,
    isLoadingNewer,
    hasHeldNewer,
    loadMore,
    loadNewer,
    insertNewer,
    prepend,
    remove,
  };
}

// INFO: REQUIREMENTS.md § 10. One noun per shelf — 음성 shared 사진's copy while this was a two-way branch.
const LOAD_FAILURE_SUBJECTS: Record<LibraryKind, string> = {
  photo: "사진",
  file: "파일",
  voice: "음성",
};

/**
 * Whether the window handed to this hook has rows above it (REQUIREMENTS.md § 10.).
 *
 * INFO: Read off the window itself rather than reported by the server. § 10.'s around
 * query spends `floor(ARCHIVE_PAGE_SIZE / 2)` on the half newer than the target, so
 * the target's own distance from the front of the array **is** how many newer rows
 * came back — and a half that filled is the same "it may have more behind it" test
 * every other page here is judged by.
 *
 * WARN: No target, or a target the server could not place (it answers with the newest
 * page instead, § 10.), means the window starts at the newest row and there is nothing
 * above it — `indexOf` answering `-1` is exactly that case and must not read as one.
 */
/**
 * The shelf's own order (REQUIREMENTS.md § 6., § 10.) — `(created_at, id)`,
 * descending, which is what every cursor here is a pair of.
 *
 * INFO: The timestamps compare as strings because they are `toISOString()` output on both sides, fixed-width UTC to the millisecond, where lexicographic order *is* chronological order. Parsing them to `Date` per comparison would answer the same and allocate.
 */
function isNewerThan(a: ArchiveMedia, b: ArchiveMedia): boolean {
  return a.createdAt === b.createdAt ? a.id > b.id : a.createdAt > b.createdAt;
}

function toHasNewer(initialMedia: ArchiveMedia[], targetId: Optional<string>): boolean {
  if (!targetId) {
    return false;
  }

  const newerCount = initialMedia.findIndex((item) => item.id === targetId);

  return newerCount >= Math.floor(ARCHIVE_PAGE_SIZE / 2);
}
