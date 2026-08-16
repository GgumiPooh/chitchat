import { safelyGet, type Optional, type UserId } from "@/shared/lib";
import { runInSnapshotStore, whenRequested } from "./db";
import { forgetSignedInUser, readSignedInUser } from "./identity";
import type { SnapshotKey, SnapshotRecord } from "./types";

/** This account's snapshot for `key`, or `undefined` for a miss and for every way the store can fail. */
export function readSnapshot<TPayload>(
  userId: UserId,
  key: SnapshotKey,
): Promise<Optional<SnapshotRecord<TPayload>>> {
  return runInSnapshotStore("readonly", (store) =>
    whenRequested<Optional<SnapshotRecord<TPayload>>>(store.get(toRecordId(userId, key))),
  );
}

/**
 * Stores `payload` as `userId`'s snapshot for `key`, stamped with the moment of the
 * write. Answers whether the record actually committed.
 *
 * WARN: Best-effort and silent, the posture `precacheOfflinePage` takes in `public/sw.js` — a quota, a private mode or a blocked upgrade costs the mirror and must cost the live screen nothing. The boolean is for a caller deciding whether to try again, never for anything a reader sees.
 */
export async function writeSnapshot<TPayload>(
  userId: UserId,
  key: SnapshotKey,
  payload: TPayload,
): Promise<boolean> {
  // WARN: JSON rather than the structured clone `put` would make on its own — a clone keeps a key whose value is `undefined`, and `findHoliday` tests the holiday table with `Object.hasOwn`.
  const stored = safelyGet(() => JSON.parse(JSON.stringify(payload)) as TPayload);

  if (stored === undefined) {
    return false;
  }

  const record: SnapshotRecord<TPayload> = {
    key,
    userId,
    savedAt: Date.now(),
    payload: stored,
    id: toRecordId(userId, key),
  };

  const isWritten = await runInSnapshotStore("readwrite", async (store) => {
    // WARN: Re-read inside the transaction, never before it. `clearAll` forgets the id before it empties the store, so a write already in flight sees the mismatch here and stands down rather than re-inserting a record the logout just removed.
    if (readSignedInUser() !== userId) {
      return false;
    }

    await whenRequested(store.put(record));

    return true;
  });

  return isWritten === true;
}

/** Empties the store and forgets the signed-in id. The browser's half of a logout, where the cookie is the server's. */
export async function clearAll(): Promise<void> {
  // WARN: Before the clear, never after. The guard in `writeSnapshot` reads this, so forgetting first is what turns an in-flight write into a no-op instead of a re-insertion.
  forgetSignedInUser();

  await runInSnapshotStore("readwrite", (store) => whenRequested(store.clear()));
}

function toRecordId(userId: UserId, key: SnapshotKey): string {
  return `${userId}:${key}`;
}
