"use client";

import { A_SECOND, runWhenIdle, type Maybe, type Optional } from "@/shared/lib";
import { isEqual } from "lodash-es";
import { useEffect, useRef } from "react";
import { readSignedInUser } from "./identity";
import { writeSnapshot } from "./snapshot";
import type { SnapshotKey } from "./types";

// INFO: A screen settles long before this, so a mount that renders several times over stores one payload rather than each of them.
const WRITE_DELAY = A_SECOND * 2;

// INFO: `runWhenIdle`'s ceiling past that wait — the write may hold for a quiet frame but must not hold out for one.
const IDLE_TIMEOUT = A_SECOND;

/**
 * Keeps this account's `key` snapshot level with `payload`. Safe to call on every render;
 * a nullish payload stores nothing.
 *
 * WARN: The account comes from `rememberSignedInUser`, which the `(main)` shell writes on mount — nothing is stored before that has run.
 */
export function useWriteSnapshot<TPayload>(key: SnapshotKey, payload: Maybe<TPayload>): void {
  const writtenRef = useRef<Maybe<TPayload>>(undefined);

  useEffect(() => {
    if (payload === null || payload === undefined) {
      return;
    }

    let cancelIdle: Optional<() => void>;
    const timer = window.setTimeout(() => {
      cancelIdle = runWhenIdle(() => {
        const userId = readSignedInUser();

        // WARN: Deep-compared here rather than in the effect body — this walks the whole payload, and a live screen re-renders far more often than it settles.
        if (userId === null || isEqual(payload, writtenRef.current)) {
          return;
        }

        writtenRef.current = payload;
        void writeSnapshot(userId, key, payload);
      }, IDLE_TIMEOUT);
    }, WRITE_DELAY);

    return () => {
      clearTimeout(timer);
      cancelIdle?.();
    };
  }, [key, payload]);
}
