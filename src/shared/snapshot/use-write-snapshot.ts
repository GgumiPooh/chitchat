"use client";

import {
  A_SECOND,
  runWhenIdle,
  type Maybe,
  type Nullable,
  type Optional,
  type UserId,
} from "@/shared/lib";
import { isEqual } from "lodash-es";
import { useEffect, useRef } from "react";
import { writeSnapshot } from "./snapshot";
import type { SnapshotKey } from "./types";

// INFO: A screen settles long before this, so a mount that renders several times over stores one payload rather than each of them.
const WRITE_DELAY = A_SECOND * 2;

// INFO: `runWhenIdle`'s ceiling past that wait — the write may hold for a quiet frame but must not hold out for one.
const IDLE_TIMEOUT = A_SECOND;

/**
 * Keeps `userId`'s `key` snapshot level with `payload`. Safe to call on every render;
 * a nullish account or payload stores nothing.
 *
 * WARN: The account is an argument because the caller knows whose data it is rendering and the store cannot. Reading it here instead — from `localStorage`, at the moment the write fires — would pair a payload captured seconds ago with whichever account signed in since, in whichever tab.
 */
export function useWriteSnapshot<TPayload>(
  userId: Maybe<UserId>,
  key: SnapshotKey,
  payload: Maybe<TPayload>,
): void {
  const writtenRef = useRef<Nullable<{ userId: UserId; payload: TPayload }>>(null);

  useEffect(() => {
    if (userId === null || userId === undefined || payload === null || payload === undefined) {
      return;
    }

    let cancelIdle: Optional<() => void>;
    const timer = window.setTimeout(() => {
      cancelIdle = runWhenIdle(() => {
        const written = writtenRef.current;

        // WARN: Deep-compared here rather than in the effect body — this walks the whole payload, and a live screen re-renders far more often than it settles.
        if (written !== null && written.userId === userId && isEqual(payload, written.payload)) {
          return;
        }

        // WARN: Recorded only once the record has committed. Marking it sent would let one quota abort or one identity mismatch short-circuit the deep-equal guard for as long as the screen stays mounted, and the write is silent, so nothing else would ever retry.
        void writeSnapshot(userId, key, payload).then((isWritten) => {
          if (isWritten) {
            writtenRef.current = { userId, payload };
          }
        });
      }, IDLE_TIMEOUT);
    }, WRITE_DELAY);

    return () => {
      clearTimeout(timer);
      cancelIdle?.();
    };
  }, [userId, key, payload]);
}
