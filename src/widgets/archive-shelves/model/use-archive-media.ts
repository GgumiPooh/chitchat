"use client";

import type { ArchiveMedia } from "@/entities/media";
import { ARCHIVE_PAGE_SIZE, type LibraryKind } from "@/shared/config";
import { toast } from "@/shared/ui";
import { josa } from "es-hangul";
import { useCallback, useRef, useState } from "react";
import { fetchArchiveMedia } from "../api/fetch-archive-media";

/**
 * The loaded window of one library segment, newest first. Older pages are
 * keyset-paginated on the `(created_at, id)` pair (REQUIREMENTS.md § 6., § 10.);
 * the first page arrives from the server render, so opening the tab costs no
 * round trip.
 *
 * INFO: `kind` is fixed for the life of the hook — the two segments are two routes
 * (§ 10.), so switching them remounts rather than refetching in place.
 */
export function useArchiveMedia(initialMedia: ArchiveMedia[], kind: LibraryKind = "photo") {
  const [media, setMedia] = useState(initialMedia);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const mediaRef = useRef(initialMedia);
  const isLoadingRef = useRef(false);
  // INFO: A short first page cannot have more behind it, so the downward fetch is never even attempted.
  const hasMoreRef = useRef(initialMedia.length >= ARCHIVE_PAGE_SIZE);

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

  // INFO: A just-uploaded photo is the newest one there is, so it goes to the front rather than being re-fetched into place.
  const prepend = useCallback(
    (added: ArchiveMedia) => commit((previous) => [added, ...previous]),
    [commit],
  );

  const remove = useCallback(
    (ids: string[]) => {
      const removed = new Set(ids);

      commit((previous) => previous.filter((item) => !removed.has(item.id)));
    },
    [commit],
  );

  return { media, isLoadingMore, loadMore, prepend, remove };
}

// INFO: REQUIREMENTS.md § 10. One noun per shelf — 음성 shared 사진's copy while this was a two-way branch.
const LOAD_FAILURE_SUBJECTS: Record<LibraryKind, string> = {
  photo: "사진",
  file: "파일",
  voice: "음성",
};
