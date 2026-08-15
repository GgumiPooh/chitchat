"use client";

import { rememberSignedInUser, useWriteSnapshot } from "@/shared/snapshot";
import { useEffect, useMemo } from "react";
import type { ShellSnapshot } from "../model/types";

export type OfflineSnapshotSyncProps = ShellSnapshot;

/**
 * Renders nothing. It writes the chrome every mirror draws, from the shell that has
 * already resolved all of it (REQUIREMENTS.md § 16.).
 *
 * WARN: Shell-level rather than per-screen, because a mirror of 설정 renders from this
 * key alone — that screen has no writer of its own and must not grow one.
 */
export function OfflineSnapshotSync({
  participants,
  currentUserId,
  chatBackgroundMediaId,
  chatBackgroundBlurhash,
  hasEventToday,
}: OfflineSnapshotSyncProps) {
  // WARN: A child's effect runs before this one, so nothing may store before it — the store's own write delay is what leaves the room, and shortening that would strand the first screen's snapshot.
  useEffect(() => {
    rememberSignedInUser(currentUserId);
  }, [currentUserId]);

  const snapshot = useMemo<ShellSnapshot>(
    () => ({
      participants,
      currentUserId,
      chatBackgroundMediaId,
      chatBackgroundBlurhash,
      hasEventToday,
    }),
    [participants, currentUserId, chatBackgroundMediaId, chatBackgroundBlurhash, hasEventToday],
  );

  useWriteSnapshot("shell", snapshot);

  return null;
}
