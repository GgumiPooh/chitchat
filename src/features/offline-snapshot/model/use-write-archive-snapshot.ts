"use client";

import type { ArchiveMedia } from "@/entities/media";
import type { Maybe, Nullable } from "@/shared/lib";
import { OFFLINE_ARCHIVE_LIMIT, useSnapshotOwner, useWriteSnapshot } from "@/shared/snapshot";
import { useMemo } from "react";
import type { ArchiveSnapshot, ArchiveSnapshotKey } from "./types";

/**
 * Keeps one shelf's snapshot level with its loaded rows.
 *
 * WARN: A nullish `media` skips the write on purpose, and 보기 옵션 is why the
 * parameter exists (REQUIREMENTS.md § 10.). The key names the shelf, not a view of
 * it, and the mirror has no filter UI — so a filtered window handed here would
 * overwrite the shelf's full copy with a slice the mirror cannot say it is showing.
 */
export function useWriteArchiveSnapshot(
  key: ArchiveSnapshotKey,
  media: Maybe<ArchiveMedia[]>,
): void {
  const owner = useSnapshotOwner();
  // WARN: A shelf answers newest-first, so its newest page is the head — the room above caps the opposite end.
  // WARN: The cap is `ARCHIVE_PAGE_SIZE` exactly, so a full snapshot still reads as "there is more" to `useArchiveMedia`'s `hasMore` seed — a mirror reusing that hook would page on mount.
  const snapshot = useMemo<Nullable<ArchiveSnapshot>>(
    () => (media ? { media: media.slice(0, OFFLINE_ARCHIVE_LIMIT) } : null),
    [media],
  );

  useWriteSnapshot(owner, key, snapshot);
}
