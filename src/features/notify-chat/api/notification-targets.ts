import "server-only";

import { listUsers, resolveDisplayName } from "@/entities/user";
import type { User } from "@/shared/db";

/**
 * Who a banner about `sender`'s message goes to, and what it is titled.
 *
 * WARN: § 8.7. bans copying a name onto a stored row, not onto a notification. A banner is a point-in-time artifact the service worker cannot re-resolve — it holds no session and cannot query.
 */
export async function resolveNotificationTargets(sender: User) {
  const recipients = (await listUsers()).filter((participant) => participant.id !== sender.id);

  return { title: resolveDisplayName(sender), recipients };
}
