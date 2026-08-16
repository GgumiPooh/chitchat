"use client";

import type { Nullable, UserId } from "@/shared/lib";
import { useSyncExternalStore } from "react";
import { getSnapshotOwner, subscribeSnapshotOwner } from "./identity";

// INFO: The server is signed in as nobody, and this is also the hydration answer — the real one arrives with the shell's own effect.
const getServerSnapshot = () => null;

/**
 * The account this browsing context is signed in as, for a writer to read in the same
 * render that builds its payload and hand to `useWriteSnapshot`.
 *
 * WARN: Never `readSignedInUser` for that. Two browsing contexts share one `localStorage`, so an id taken from there can be an account this tree has never rendered — which is a write of one participant's conversation under the other's key.
 */
export function useSnapshotOwner(): Nullable<UserId> {
  return useSyncExternalStore(subscribeSnapshotOwner, getSnapshotOwner, getServerSnapshot);
}
