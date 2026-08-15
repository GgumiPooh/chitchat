"use client";

import type { Optional } from "@/shared/lib";
import { useEffect, useState } from "react";
import { readSignedInUser } from "./identity";
import { readSnapshot } from "./snapshot";
import type { SnapshotKey, SnapshotRead, SnapshotRecord } from "./types";

const LOADING = { status: "loading", savedAt: undefined, payload: undefined } as const;

const MISS = { status: "miss", savedAt: undefined, payload: undefined } as const;

/**
 * This account's stored snapshot for `key`, once the store has answered.
 *
 * INFO: The payload is the caller's to name — `useSnapshot<ChatMessage[]>("chat")` — because FSD forbids `shared` the entity types the screens are written against.
 */
export function useSnapshot<TPayload>(key: SnapshotKey): SnapshotRead<TPayload> {
  const [read, setRead] = useState<SnapshotRead<TPayload>>(LOADING);

  useEffect(() => {
    let isCurrent = true;
    const userId = readSignedInUser();

    // INFO: `readSnapshot` swallows its own failures, so a store that never opens reads as a miss rather than an error state no mirror renders.
    const pending: Promise<Optional<SnapshotRecord<TPayload>>> =
      userId === null ? Promise.resolve(undefined) : readSnapshot<TPayload>(userId, key);

    void pending.then((record) => {
      if (!isCurrent) {
        return;
      }

      setRead(
        record === undefined
          ? MISS
          : { status: "hit", savedAt: record.savedAt, payload: record.payload },
      );
    });

    return () => {
      isCurrent = false;
    };
  }, [key]);

  return read;
}
