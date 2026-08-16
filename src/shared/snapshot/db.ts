/**
 * REQUIREMENTS.md § 16. The store the offline mirrors read from.
 *
 * IndexedDB rather than the Cache Storage § 16. keeps user data out of, and that
 * difference is the whole of the argument: `caches` is scoped to the origin, where
 * this is keyed by `UserId` and emptied on logout — § 16.1. already has two accounts
 * sharing one browser, and logging out clears the cookie and nothing else.
 */

import { safelyGet, type Nullable, type Optional, type UserId } from "@/shared/lib";

const DB_NAME = "jandh-offline";

const DB_VERSION = 1;

const STORE_NAME = "snapshots";

/** The index over `userId`, which is what lets one account's records be dropped without reading the other's. */
export const SNAPSHOT_USER_INDEX = "userId";

let connection: Optional<Promise<Nullable<IDBDatabase>>>;

/**
 * Runs `run` against the `snapshots` store, and answers `undefined` for every way that
 * can fail — no IndexedDB, a blocked open, an aborted transaction, a quota.
 *
 * WARN: Never rejects. Every caller is a live screen that asked for a convenience, and none of them may break on losing it.
 */
export async function runInSnapshotStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<Optional<T>> {
  const db = await connect();

  if (db === null) {
    return undefined;
  }

  try {
    const transaction = db.transaction(STORE_NAME, mode);
    // WARN: Registered before `run` is awaited — a transaction that has already settled fires nothing, so a listener attached afterwards waits forever.
    const isCommitted = whenSettled(transaction);
    const result = await run(transaction.objectStore(STORE_NAME));

    return (await isCommitted) ? result : undefined;
  } catch {
    return undefined;
  }
}

export function whenRequested<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Drops every record belonging to an account other than `userId`, inside the caller's transaction. */
export function deleteOtherUsers(store: IDBObjectStore, userId: UserId): Promise<void> {
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

function connect(): Promise<Nullable<IDBDatabase>> {
  connection ??= open().then((db) => {
    // WARN: A failed open is never memoised. `onblocked` (another tab on an older version) and `onerror` (a private mode) both answer `null`, and the `db.onclose` that resets this is registered in `onsuccess` — so a remembered `null` would leave that tab reading no mirror and writing no snapshot for the rest of its life.
    if (db === null) {
      connection = undefined;
    }

    return db;
  });

  return connection;
}

function open(): Promise<Nullable<IDBDatabase>> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);

      return;
    }

    // WARN: Some private modes throw from `open` itself rather than firing `onerror`, so the call is guarded before its events are.
    const request = safelyGet(() => indexedDB.open(DB_NAME, DB_VERSION));

    if (request === undefined) {
      resolve(null);

      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" }).createIndex(
          SNAPSHOT_USER_INDEX,
          SNAPSHOT_USER_INDEX,
        );
      }
    };
    request.onsuccess = () => {
      const db = request.result;

      // INFO: A connection the browser closes under a long-lived PWA throws from every later `transaction`, so the next call is left to open a fresh one.
      db.onclose = () => {
        connection = undefined;
      };

      resolve(db);
    };
    request.onerror = () => resolve(null);
    // INFO: Another tab holding an older version would otherwise leave this promise pending for as long as that tab is open.
    request.onblocked = () => resolve(null);
  });
}

function whenSettled(transaction: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    transaction.oncomplete = () => resolve(true);
    // INFO: A quota failure surfaces on the transaction rather than on the request that caused it, which is the reason the commit is awaited at all.
    transaction.onabort = () => resolve(false);
    transaction.onerror = () => resolve(false);
  });
}
