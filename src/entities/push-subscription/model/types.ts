import type { Maybe } from "@/shared/lib";

/**
 * A browser's `PushSubscription` flattened to what the server stores. It crosses
 * `POST /api/push/subscription` as JSON, so this is the wire shape too.
 */
export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: Maybe<string>;
};

/**
 * What `POST /api/push/subscription` answers with — this installation's stored
 * 알림 소리 preference (`REQUIREMENTS.md § 16.1.`), which no server render can know.
 */
export type SavedPushSubscription = {
  soundEnabled: boolean;
};

/**
 * What the service worker receives in `event.data` and turns into a notification.
 * Kept flat and self-contained: the worker has no session and cannot look anything
 * up, so everything the banner shows has to be in here.
 */
export type PushPayload = {
  title: string;
  body: string;
  /** Feeds `navigator.setAppBadge` — the recipient's unread count at send time. */
  unreadCount: number;
  /** Where a tap lands. */
  url: string;
  /**
   * Overrides this device's 알림 소리 preference (`REQUIREMENTS.md § 16.1.`) for
   * one send. Left out, `pushToUser` fills it in per row from `sound_enabled`.
   */
  silent?: boolean;
};
