import "server-only";

import { getDb, messages } from "@/shared/db";
import type { MessageId, Nullable } from "@/shared/lib";
import { eq } from "drizzle-orm";

/**
 * The id behind a `client_msg_id`, without resolving the row's payload — the one
 * thing `runGeneration`'s queue-catch-up needs (REQUIREMENTS.md § 8.5.'s column
 * carries a unique index, so this is an equality probe, not a scan).
 */
export async function getMessageIdByClientMsgId(clientMsgId: string): Promise<Nullable<MessageId>> {
  const [row] = await getDb()
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.clientMsgId, clientMsgId))
    .limit(1);

  return row?.id ?? null;
}
