import "server-only";

// WARN: REQUIREMENTS.md § 9. The thumbnail is a derived key, never its own `media` row — the viewer asks the same id for `variant=original`.
const THUMB_SUFFIX = "_thumb";

/** Which part of the app an object belongs to. The first path segment of every key. */
export type StorageScope = "chat" | "avatar" | "emoticon";

/**
 * WARN: The key is chosen here and never taken from the client. A presigned PUT
 * authorizes exactly the key it was signed for, so letting the browser name it
 * is letting the browser ask for a signature that overwrites someone else's object.
 */
export function buildStorageKey(scope: StorageScope, ownerId: string): string {
  return `${toScopePrefix(scope, ownerId)}${crypto.randomUUID()}`;
}

/**
 * The prefix every key `scope` and `ownerId` produce shares.
 *
 * INFO: It is the app's one ownership proof for an object (§ 9.), so the check
 * sites read it from here rather than each spelling the key layout out again.
 */
export function toScopePrefix(scope: StorageScope, ownerId: string): string {
  return `${scope}/${ownerId}/`;
}

export function toThumbKey(key: string): string {
  return `${key}${THUMB_SUFFIX}`;
}
