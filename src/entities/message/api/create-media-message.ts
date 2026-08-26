import "server-only";

import { insertMedia, type ArchiveMedia, type ValidatedMedia } from "@/entities/media/@x/message";
import { getDb, messageMedia, messages, nextSnowflake, type Message } from "@/shared/db";
import type { MessageId, UserId } from "@/shared/lib";
import { type DbTransaction } from "@/shared/storage";
import { and, eq, isNull } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";
import { listMessageMedia } from "./list-message-media";
import { getReplyPreview } from "./list-reply-previews";

export type CreateMediaMessageParams = {
  senderId: UserId;
  clientMsgId: string;
  /** Already HEAD-checked by `validateMediaUpload`, in the order the sender picked them. */
  media: ValidatedMedia[];
  /** REQUIREMENTS.md § 8.10. The quoted message; a precondition here for the same reason `media` is validated ahead of time. */
  replyToId?: MessageId;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — set once here, at insert; never updated after. */
  onlyMe?: boolean;
  /** REQUIREMENTS.md § 8.15. Set when this attachment rides along with an Ask AI question — carried onto every `media` row via `insertMedia`. */
  aiExpiresAt?: Date;
};

export type CreateMediaMessageResult =
  | { status: "created"; message: ChatMessage; media: ArchiveMedia[] }
  | { status: "conflict" }
  | { status: "unprocessable" };

// WARN: Rolls the transaction back rather than returning a sentinel — `insertMedia` may have already written rows this attempt owns, and either failure mode below must not commit an orphan.
class ReclaimedMediaError extends Error {}
// WARN: `client_msg_id` is unique table-wide (see `findOwnMessage`), so a collision with a row this sender does not own is a genuine conflict, not a retry.
class ForeignClientMsgIdError extends Error {}

/**
 * One bubble carrying one or more attachments (REQUIREMENTS.md § 6.).
 *
 * WARN: Registration and both writes are in one transaction. The § 6. trigger
 * rejects a `message_media` row whose parent is not a `media` message, and the
 * reverse — a `media` message with no attachments — is deliberately unenforced
 * precisely because the group commits together here.
 *
 * WARN: A retried send after a partial failure must not drop the attachments the
 * first attempt never got to — `onConflictDoNothing` alone hands back the old row
 * with nothing reattached. Every media id from **this** attempt that the existing
 * row does not already carry is appended after its current `sortOrder` max,
 * preserving the caller's order; a plain duplicate retry attaches nothing new
 * because `insertMedia` is idempotent on `r2_key` and every id it hands back is
 * already on the row.
 */
export async function createMediaMessage({
  senderId,
  clientMsgId,
  media,
  replyToId,
  onlyMe = false,
  aiExpiresAt,
}: CreateMediaMessageParams): Promise<CreateMediaMessageResult> {
  if (!isHomogeneousBatch(media)) {
    return { status: "unprocessable" };
  }

  type Written = { row: Message; inserted: ArchiveMedia[] };
  let written: Written;

  try {
    written = await getDb().transaction(async (tx): Promise<Written> => {
      const inserted: ArchiveMedia[] = [];

      for (const validated of media) {
        const row = await insertMedia(tx, validated, aiExpiresAt);

        if (!row) {
          throw new ReclaimedMediaError();
        }

        inserted.push(row);
      }

      const [own] = await tx
        .insert(messages)
        .values({
          id: nextSnowflake<MessageId>(),
          senderId,
          type: "media",
          clientMsgId,
          replyToId,
          onlyMe,
        })
        // INFO: REQUIREMENTS.md § 8.5. Idempotent on `client_msg_id`, so a retried send after a timeout cannot post the same photos twice.
        .onConflictDoNothing({ target: messages.clientMsgId })
        .returning();

      if (own) {
        await tx
          .insert(messageMedia)
          .values(
            inserted.map((item, sortOrder) => ({ messageId: own.id, mediaId: item.id, sortOrder })),
          );

        return { row: own, inserted };
      }

      const existing = await findOwnMessage(tx, clientMsgId, senderId);

      if (!existing) {
        throw new ForeignClientMsgIdError();
      }

      await attachMissing(tx, existing.id, inserted);

      return { row: existing, inserted };
    });
  } catch (error) {
    if (error instanceof ReclaimedMediaError) {
      return { status: "unprocessable" };
    }

    if (error instanceof ForeignClientMsgIdError) {
      return { status: "conflict" };
    }

    throw error;
  }

  const { row, inserted } = written;

  const [byMessage, replyTo] = await Promise.all([
    listMessageMedia([row.id]),
    getReplyPreview(row.replyToId),
  ]);

  return {
    status: "created",
    message: toChatMessage(row, byMessage.get(row.id), null, replyTo),
    media: inserted,
  };
}

async function attachMissing(
  tx: DbTransaction,
  messageId: MessageId,
  inserted: ArchiveMedia[],
): Promise<void> {
  const attached = await tx
    .select({ mediaId: messageMedia.mediaId, sortOrder: messageMedia.sortOrder })
    .from(messageMedia)
    .where(eq(messageMedia.messageId, messageId));

  const attachedIds = new Set(attached.map((row) => row.mediaId));
  const missing = inserted.filter((item) => !attachedIds.has(item.id));

  if (missing.length === 0) {
    return;
  }

  const maxSortOrder = attached.reduce((max, row) => Math.max(max, row.sortOrder), -1);

  await tx.insert(messageMedia).values(
    missing.map((item, index) => ({
      messageId,
      mediaId: item.id,
      sortOrder: maxSortOrder + 1 + index,
    })),
  );
}

// INFO: REQUIREMENTS.md § 9.1., § 9.3. The set must be **all of one kind** — `toBubbles` splits a pick by kind in the browser, which a stale client or a hand-made request simply does not run.
// WARN: § 9.3. Voice is a third kind, not a variety of "file" — and a voice bubble is always exactly one clip, since there is no layout for two.
function isHomogeneousBatch(items: ValidatedMedia[]): boolean {
  if (items.some((item) => item.kind === "voice")) {
    return items.length === 1;
  }

  return new Set(items.map((item) => item.kind === "file")).size <= 1;
}

// WARN: `client_msg_id` is unique table-wide rather than per sender, so matching on it alone would hand this caller the other user's message on a collision.
async function findOwnMessage(tx: DbTransaction, clientMsgId: string, senderId: UserId) {
  const [existing] = await tx
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.clientMsgId, clientMsgId),
        eq(messages.senderId, senderId),
        isNull(messages.deletedAt),
      ),
    )
    .limit(1);

  return existing ?? null;
}
