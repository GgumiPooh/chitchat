import "server-only";

import { ensureEnv } from "@/shared/config";
import postgres from "postgres";

/** The `pg_notify` channels the REQUIREMENTS.md § 6. triggers fire on. */
export const NEW_MESSAGE_CHANNEL = "new_message";

export const USER_CHANGED_CHANNEL = "user_changed";

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
  // WARN: REQUIREMENTS.md § 6. The unpooled string, and a client of its own. A transaction-mode pooler hands the connection to another caller between transactions, which drops the `LISTEN` without erroring — the stream just goes quiet.
  const sql = postgres(ensureEnv("DATABASE_URL_UNPOOLED"), { max: 1, prepare: false });

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
