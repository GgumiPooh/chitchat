import { isSnowflake, safelyGet, safelyRun, type Nullable, type UserId } from "@/shared/lib";
import { deleteOtherUsers, runInSnapshotStore } from "./db";

const STORAGE_KEY = "jandh:offline-user";

// WARN: Per browsing context, and that is the whole of its job — `localStorage` is shared by every tab and the standalone window, so an id read from there belongs to whoever signed in last rather than to the tree this realm is rendering.
let owner: Nullable<UserId> = null;

const subscribers = new Set<() => void>();

/**
 * The account whose snapshot a mirror opens. A document served from the cache reads no
 * session cookie, so the id has to be somewhere the browser keeps for itself.
 *
 * INFO: `localStorage`, which REQUIREMENTS.md § 5.2. bans for auth state alone — a snowflake user id is not a credential and opens nothing (the reading `use-recent-emoticons.ts` already takes).
 */
export function readSignedInUser(): Nullable<UserId> {
  const stored = safelyGet(() => localStorage.getItem(STORAGE_KEY));

  return isUserId(stored) ? stored : null;
}

/** The account this browsing context is rendering — `null` until the `(main)` shell has published one. */
export function getSnapshotOwner(): Nullable<UserId> {
  return owner;
}

export function subscribeSnapshotOwner(onChange: () => void): () => void {
  subscribers.add(onChange);

  return () => {
    subscribers.delete(onChange);
  };
}

/**
 * Publishes the signed-in account to this realm and to the mirrors, and empties the
 * store of every other account.
 *
 * WARN: The sweep belongs to the sign-in rather than to the next write — left to that, an abandoned session's records stay readable for as long as it takes the new account's first screen to settle.
 */
export function rememberSignedInUser(userId: UserId): void {
  const previous = readSignedInUser();

  safelyRun(() => localStorage.setItem(STORAGE_KEY, userId));
  publishOwner(userId);

  if (previous === userId) {
    return;
  }

  void runInSnapshotStore("readwrite", (store) => deleteOtherUsers(store, userId));
}

export function forgetSignedInUser(): void {
  safelyRun(() => localStorage.removeItem(STORAGE_KEY));
  publishOwner(null);
}

function publishOwner(next: Nullable<UserId>): void {
  if (owner === next) {
    return;
  }

  owner = next;
  subscribers.forEach((onChange) => onChange());
}

// WARN: REQUIREMENTS.md § 6. Shape-checked rather than trusted — the value is whatever a previous build wrote, and a mirror must not open a snapshot for an id no row answers to.
function isUserId(value: unknown): value is UserId {
  return typeof value === "string" && isSnowflake(value);
}
