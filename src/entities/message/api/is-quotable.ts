import "server-only";

import { getDb, messages } from "@/shared/db";
import { eq } from "drizzle-orm";

/**
 * REQUIREMENTS.md § 8.10. Whether a message may be quoted: it exists, it is not
 * soft-deleted, and it is not a system notice.
 *
 * INFO: Deliberately not `getReplyPreview`. The preview costs a `messages` select
 * plus the `listMessageMedia` join, and the create path resolves it again anyway to
 * echo the row back — validating through it made every reply pay four round trips
 * for two. This reads the three columns the question is actually about.
 */
export async function isQuotable(parentId: number): Promise<boolean> {
  const [row] = await getDb()
    .select({ type: messages.type, deletedAt: messages.deletedAt })
    .from(messages)
    .where(eq(messages.id, parentId))
    .limit(1);

  return row !== undefined && row.deletedAt === null && row.type !== "system";
}
