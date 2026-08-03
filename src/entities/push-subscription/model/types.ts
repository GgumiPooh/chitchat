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
};
