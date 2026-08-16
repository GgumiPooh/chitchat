"use client";

import type { ArchiveMedia } from "@/entities/media";
import { OFFLINE_ARCHIVE_LIMIT, useSnapshotOwner, useWriteSnapshot } from "@/shared/snapshot";
import { useMemo } from "react";
import type { ArchiveSnapshot, ArchiveSnapshotKey } from "./types";

/** Keeps one shelf's snapshot level with its loaded rows. */
export function useWriteArchiveSnapshot(key: ArchiveSnapshotKey, media: ArchiveMedia[]): void {
  const owner = useSnapshotOwner();
  // WARN: A shelf answers newest-first, so its newest page is the head — the room above caps the opposite end.
  // WARN: The cap is `ARCHIVE_PAGE_SIZE` exactly, so a full snapshot still reads as "there is more" to `useArchiveMedia`'s `hasMore` seed — a mirror reusing that hook would page on mount.
  const snapshot = useMemo<ArchiveSnapshot>(
    () => ({ media: media.slice(0, OFFLINE_ARCHIVE_LIMIT) }),
    [media],
  );

  useWriteSnapshot(owner, key, snapshot);
}
