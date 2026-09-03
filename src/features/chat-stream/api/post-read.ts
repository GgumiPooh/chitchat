import { request } from "@/shared/api";
import { CHAT_READ_PATH } from "@/shared/config";
import type { MessageId } from "@/shared/lib";

/**
 * REQUIREMENTS.md § 8.8. Advances the read cursor to `lastSeenMessageId` — the
 * newest message the screen has actually rendered. Carries no timestamp — the
 * server stamps `now()` itself — and the server caps the id at the newest
 * message that exists and only ever moves the cursor forward, so a skewed
 * clock or a stale/reordered post cannot hide or fabricate a read.
 */
export async function postRead(lastSeenMessageId: MessageId): Promise<void> {
  const response = await request(CHAT_READ_PATH, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lastSeenMessageId }),
  });

  if (!response.ok) {
    throw new Error(`POST ${CHAT_READ_PATH} responded ${response.status}`);
  }
}
