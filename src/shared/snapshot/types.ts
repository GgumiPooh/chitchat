import type { UserId } from "@/shared/lib";

/** REQUIREMENTS.md § 16. One key per mirror screen, plus the shell chrome every mirror draws. */
export type SnapshotKey =
  | "chat"
  | "calendar"
  | "archive-gallery"
  | "archive-files"
  | "archive-voice"
  | "settings"
  | "shell";

/**
 * A snapshot as the `snapshots` store holds it.
 *
 * INFO: The payload is the caller's to name — FSD forbids `shared` an entity type, so each screen passes the one it already renders from through the type argument.
 */
export type SnapshotRecord<TPayload = unknown> = {
  key: SnapshotKey;
  userId: UserId;
  /** `Date.now()` at the write. A mirror renders its 마지막 동기화 line from this. */
  savedAt: number;
  payload: TPayload;
  /** `${userId}:${key}` — the store's `keyPath`. */
  id: string;
};

/** What `useSnapshot` reports: `loading` until the store answers, then `hit` or `miss`. */
export type SnapshotRead<TPayload> =
  | { status: "loading"; savedAt: undefined; payload: undefined }
  | { status: "hit"; savedAt: number; payload: TPayload }
  | { status: "miss"; savedAt: undefined; payload: undefined };

/** REQUIREMENTS.md § 8.3. The newest messages a `chat` snapshot may carry — `CHANGED_MESSAGES_LIMIT`'s figure. */
export const OFFLINE_MESSAGE_LIMIT = 200;

/** REQUIREMENTS.md § 10. The newest rows an `archive-*` snapshot may carry — `ARCHIVE_PAGE_SIZE`'s figure. */
export const OFFLINE_ARCHIVE_LIMIT = 60;
