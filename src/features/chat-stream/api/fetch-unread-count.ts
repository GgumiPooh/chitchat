import { CHAT_UNREAD_PATH } from "@/shared/config";

/**
 * REQUIREMENTS.md § 8.8. The authoritative count, refetched on every resume — the
 * running total the stream keeps is optimistic and cannot know what arrived while
 * the connection was closed.
 */
export async function fetchUnreadCount(): Promise<number> {
  const response = await fetch(CHAT_UNREAD_PATH);

  if (!response.ok) {
    throw new Error(`GET ${CHAT_UNREAD_PATH} responded ${response.status}`);
  }

  const { unreadCount } = (await response.json()) as { unreadCount: number };

  return unreadCount;
}
