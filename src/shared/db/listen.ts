import "server-only";

import { openUnpooledSession } from "./session";

/** The `pg_notify` channels the REQUIREMENTS.md § 6. triggers fire on. */
export const NEW_MESSAGE_CHANNEL = "new_message";

export const USER_CHANGED_CHANNEL = "user_changed";

/** REQUIREMENTS.md § 8.8. A read-cursor bump, carrying the cursor in the payload — split off `USER_CHANGED_CHANNEL`, which is now profile/background only. */
export const READ_CURSOR_CHANNEL = "read_cursor";

/**
 * REQUIREMENTS.md § 8.13. An edit and a soft delete both, on one channel and one
 * `change` event — the stream reads the row back either way and the row's own
 * `isDeleted` tells the two apart.
 *
 * WARN: A deleted row still resolves. `getMessage` answering `null` means the id
 * names no row and nothing else; it used to mean "deleted" as well, which is what
 * this channel once read a deletion off, and a tombstone ended that.
 */
export const MESSAGE_CHANGED_CHANNEL = "message_changed";

/**
 * REQUIREMENTS.md § 8.12. 입력 중, and the one channel with no trigger behind it —
 * nothing is written, so there is no row for a trigger to fire on.
 */
export const TYPING_CHANNEL = "typing";

/** The AI answer's streamed deltas (`llmStreamEventSchema`) — no trigger either, for the same reason `TYPING_CHANNEL` has none. */
export const LLM_STREAM_CHANNEL = "llm_stream";

/** `DELETE /api/chat/ai` publishes here (`llmCancelEventSchema`) — the queued request's own connection listens for it, whether it is still waiting on the advisory lock or already generating. */
export const LLM_CANCEL_CHANNEL = "llm_cancel";

export type NotificationHandler = (channel: string, payload: string) => void;

/**
 * Holds a connection open on `LISTEN` for each named channel and resolves to the
 * function that releases it. The caller MUST call that function in a `finally`
 * block — the connection is outside any pool and nothing else will reclaim it.
 */
export async function listenToChannels(
  channels: string[],
  onNotification: NotificationHandler,
): Promise<() => Promise<void>> {
  const sql = openUnpooledSession();

  try {
    await Promise.all(
      channels.map((channel) => sql.listen(channel, (payload) => onNotification(channel, payload))),
    );
  } catch (error) {
    await sql.end();

    throw error;
  }

  return () => sql.end();
}
