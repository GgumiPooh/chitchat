import { isSnowflake, safelyGet, safelyRun, type Nullable, type UserId } from "@/shared/lib";

const STORAGE_KEY = "jandh:offline-user";

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

export function rememberSignedInUser(userId: UserId): void {
  safelyRun(() => localStorage.setItem(STORAGE_KEY, userId));
}

export function forgetSignedInUser(): void {
  safelyRun(() => localStorage.removeItem(STORAGE_KEY));
}

// WARN: REQUIREMENTS.md § 6. Shape-checked rather than trusted — the value is whatever a previous build wrote, and a mirror must not open a snapshot for an id no row answers to.
function isUserId(value: unknown): value is UserId {
  return typeof value === "string" && isSnowflake(value);
}
