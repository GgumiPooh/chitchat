"use client";

import type { GalleryMedia } from "@/entities/media";
import { GALLERY_PAGE_SIZE } from "@/shared/config";
import { toast } from "@/shared/ui";
import { useCallback, useRef, useState } from "react";
import { fetchGalleryMedia } from "../api/fetch-gallery-media";

/**
 * The loaded window of the gallery, newest first. Older pages are keyset-paginated
 * on the `(created_at, id)` pair (REQUIREMENTS.md § 6., § 10.); the first page
 * arrives from the server render, so opening the tab costs no round trip.
 */
export function useGalleryMedia(initialMedia: GalleryMedia[]) {
  const [media, setMedia] = useState(initialMedia);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const mediaRef = useRef(initialMedia);
  const isLoadingRef = useRef(false);
  // INFO: A short first page cannot have more behind it, so the downward fetch is never even attempted.
  const hasMoreRef = useRef(initialMedia.length >= GALLERY_PAGE_SIZE);

  const commit = useCallback((update: (previous: GalleryMedia[]) => GalleryMedia[]) => {
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
      const older = await fetchGalleryMedia({
        before: { createdAt: oldest.createdAt, id: oldest.id },
      });

      hasMoreRef.current = older.length >= GALLERY_PAGE_SIZE;

      if (older.length > 0) {
        // INFO: Deduplicated for the same reason chat's window is — the other participant can add a photo between two page requests, which shifts nothing but is cheap to guard.
        commit((previous) => {
          const known = new Set(previous.map((item) => item.id));

          return [...previous, ...older.filter((item) => !known.has(item.id))];
        });
      }
    } catch {
      toast.error("사진을 더 불러오지 못했어요");
    } finally {
      isLoadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [commit]);

  // INFO: A just-uploaded photo is the newest one there is, so it goes to the front rather than being re-fetched into place.
  const prepend = useCallback(
    (added: GalleryMedia) => commit((previous) => [added, ...previous]),
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
