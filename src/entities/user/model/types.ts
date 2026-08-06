import type { Nullable } from "@/shared/lib";

/**
 * A participant as it crosses `GET /api/users` (REQUIREMENTS.md § 8.4.).
 * `lastReadAt` is an ISO string because the wire format is JSON.
 *
 * WARN: The name is already resolved, so `email` never leaves the server — the
 * § 8.7. fallback is the only thing that wanted it, and it is applied here.
 */
export type Participant = {
  name: string;
  avatarMediaId: Nullable<string>;
  /** REQUIREMENTS.md § 12.1. The profile cover, which is published — unlike the chat wallpaper beside it in `users`. */
  profileBackgroundMediaId: Nullable<string>;
  lastReadAt: string;
  id: string;
};
