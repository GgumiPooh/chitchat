import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "./client";

/**
 * Publishes on a `pg_notify` channel that `listenToChannels` subscribers are
 * holding open (REQUIREMENTS.md § 8.4.).
 *
 * INFO: The pooled client, deliberately. Only `LISTEN` needs the unpooled string —
 * it is session state a transaction-mode pooler hands away between transactions,
 * whereas a notification is delivered at COMMIT and needs no session to survive.
 * § 6.'s triggers already publish this way, from inside pooled writes.
 *
 * WARN: `NOTIFY` caps the payload at 8000 bytes. A caller with more to say than
 * that sends an id and lets the receiver read the row back, as § 8.4. does.
 */
export async function notifyChannel(channel: string, payload: string): Promise<void> {
  await getDb().execute(sql`select pg_notify(${channel}, ${payload})`);
}
