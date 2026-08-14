import type { MediaId, Nullable, UserId } from "@/shared/lib";

/**
 * A participant as it crosses `GET /api/users` (REQUIREMENTS.md § 8.4.).
 * `lastReadAt` is an ISO string because the wire format is JSON.
 *
 * WARN: The name is already resolved, so `email` never leaves the server — the
 * § 8.7. fallback is the only thing that wanted it, and it is applied here.
 */
export type Participant = {
  name: string;
  avatarMediaId: Nullable<MediaId>;
  /** REQUIREMENTS.md § 12.1. The profile cover, which is published — unlike the chat wallpaper beside it in `users`. */
  profileBackgroundMediaId: Nullable<MediaId>;
  /** WARN: REQUIREMENTS.md § 12.1. A cover may be a video, and `<img>` and `<video>` are not interchangeable — so the kind has to cross the wire beside the id. Nothing can infer it from a `media` id. */
  isProfileBackgroundVideo: boolean;
  lastReadAt: string;
  id: UserId;
};
