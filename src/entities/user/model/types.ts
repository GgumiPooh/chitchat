import type { MediaId, MessageId, Nullable, UserId } from "@/shared/lib";

/**
 * A participant as it crosses `GET /api/users` (REQUIREMENTS.md § 8.4.).
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
  /**
   * REQUIREMENTS.md § 8.8. How far this participant has read — the newest message
   * they have seen, and `null` for someone who has read nothing.
   *
   * INFO: RESTRUCTURE.md § 3.5. A message rather than the instant it used to be. The
   * cursor was always naming a message, and saying so lets both the badge and § 8.13.'s
   * 읽음 mark compare id to id, with no clock and no parsing on either side.
   */
  lastReadMessageId: Nullable<MessageId>;
  id: UserId;
};
