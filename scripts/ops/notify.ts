import { CHAT_ROUTE } from "@/shared/config";
import { getDb, users } from "@/shared/db";
import { eq } from "drizzle-orm";
/**
 * WARN: Deep paths, not the slice barrels, and only here. These run in plain Node with no
 * bundler to shake a tree, so `@/entities/message` would drag that slice's `ui/` — and the
 * React it imports — into a script that renders nothing. The barrels are the rule inside
 * `src`; a CLI entry is the one place the cost of honouring it is a crash.
 */
/* eslint-disable no-restricted-imports */
import { countUnreadMessages } from "../../src/entities/message/api/count-unread";
import { pushToUser } from "../../src/entities/push-subscription/api/push-to-user";
/* eslint-enable no-restricted-imports */

/**
 * REQUIREMENTS.md § 12.4. The account the scheduled ops runs report to, matched on
 * `users.email`.
 *
 * INFO: One of the two participants, deliberately. These banners are operational rather
 * than social, and the other person has no use for 백업 성공 at five in the morning.
 */
const NOTIFY_EMAIL = process.env.BACKUP_NOTIFY_EMAIL?.trim() || "jeheecheon@gmail.com";

// Keep a failure reason readable in a banner instead of dumping a whole `pg_dump` stderr.
const BODY_MAX_LENGTH = 200;

/**
 * Raises one ops banner on every device that account has registered.
 *
 * WARN: Never throws, and never fails the run that called it. A missing VAPID key or a
 * dead subscription must not turn a finished backup into a red job — the work is what the
 * exit code is about, and a banner that did not land is logged instead.
 *
 * WARN: The unread count is carried because `sw.js` drives `navigator.setAppBadge` from
 * it. An ops banner sent without one would silently clear the reader's message badge.
 */
export async function notifyOps(title: string, body: string): Promise<void> {
  try {
    const [recipient] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, NOTIFY_EMAIL))
      .limit(1);

    if (!recipient) {
      console.warn(`[notify] no user matches ${NOTIFY_EMAIL} — skipping "${title}"`);

      return;
    }

    await pushToUser(
      recipient.id,
      {
        title,
        body: body.trim().slice(0, BODY_MAX_LENGTH) || "알 수 없는 오류",
        unreadCount: await countUnreadMessages(recipient.id),
        url: CHAT_ROUTE,
      },
      // @see PushToUserOptions — these fire on a schedule whether or not anything happened.
      { silent: true },
    );

    console.log(`[notify] ${title} · ${body}`);
  } catch (error) {
    console.error("[notify] could not send the ops banner", error);
  }
}

/** Bytes at the scale an ops banner reports them — dumps and bucket totals, not attachments. */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(unit === 0 ? 0 : 1)}${units[unit]}`;
}
