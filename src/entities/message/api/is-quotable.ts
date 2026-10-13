import type { MessageId } from "@/shared/lib";
import "server-only";

import { getDb, messages } from "@/shared/db";
import { eq } from "drizzle-orm";

/**
 * REQUIREMENTS.md § 8.10. Whether a message may be quoted: it exists and is not
 * soft-deleted. System notices rendered as timeline cards are quotable.
 *
 * INFO: Deliberately not `getReplyPreview`. The preview costs a `messages` select
 * plus the `listMessageMedia` join, and the create path resolves it again anyway to
 * echo the row back — validating through it made every reply pay four round trips
 * for two. This reads the two columns the question is actually about.
 */
export async function isQuotable(parentId: MessageId): Promise<boolean> {
  const [row] = await getDb()
    .select({
      deletedAt: messages.deletedAt,
    })
    .from(messages)
    .where(eq(messages.id, parentId))
    .limit(1);

  return row !== undefined && row.deletedAt === null;
}
