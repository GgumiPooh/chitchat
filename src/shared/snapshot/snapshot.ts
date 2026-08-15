import { safelyGet, type Optional, type UserId } from "@/shared/lib";
import { runInSnapshotStore, SNAPSHOT_USER_INDEX, whenRequested } from "./db";
import { forgetSignedInUser } from "./identity";
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
 * Stores `payload` under `key`, stamped with the moment of the write, and drops any
 * other account's records on the way past.
 *
 * WARN: Best-effort and silent, the posture `precacheOfflinePage` takes in `public/sw.js` — a quota, a private mode or a blocked upgrade costs the mirror and must cost the live screen nothing.
 */
export async function writeSnapshot<TPayload>(
  userId: UserId,
  key: SnapshotKey,
  payload: TPayload,
): Promise<void> {
  // WARN: JSON rather than the structured clone `put` would make on its own — a clone keeps a key whose value is `undefined`, and `findHoliday` tests the holiday table with `Object.hasOwn`.
  const stored = safelyGet(() => JSON.parse(JSON.stringify(payload)) as TPayload);

  if (stored === undefined) {
    return;
  }

  const record: SnapshotRecord<TPayload> = {
    key,
    userId,
    savedAt: Date.now(),
    payload: stored,
    id: toRecordId(userId, key),
  };

  await runInSnapshotStore("readwrite", async (store) => {
    await deleteOtherUsers(store, userId);
    await whenRequested(store.put(record));
  });
}

/** Drops every record belonging to an account other than `userId` — REQUIREMENTS.md § 16.1.'s two accounts must never read each other's snapshot. */
export async function clearOtherUsers(userId: UserId): Promise<void> {
  await runInSnapshotStore("readwrite", (store) => deleteOtherUsers(store, userId));
}

/** Empties the store and forgets the signed-in id. The browser's half of a logout, where the cookie is the server's. */
export async function clearAll(): Promise<void> {
  forgetSignedInUser();

  await runInSnapshotStore("readwrite", (store) => whenRequested(store.clear()));
}

function toRecordId(userId: UserId, key: SnapshotKey): string {
  return `${userId}:${key}`;
}

function deleteOtherUsers(store: IDBObjectStore, userId: UserId): Promise<void> {
  return new Promise((resolve, reject) => {
    // WARN: `openKeyCursor`, so a snapshot this walks past is never deserialized into memory just to be left alone.
    const request = store.index(SNAPSHOT_USER_INDEX).openKeyCursor();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;

      if (cursor === null) {
        resolve();

        return;
      }

      if (cursor.key !== userId) {
        store.delete(cursor.primaryKey);
      }

      cursor.continue();
    };
  });
}
