import "server-only";

import {
  insertMedia,
  isMediaReference,
  resolveReferencedMedia,
  type ArchiveMedia,
  type MediaReference,
  type ValidatedMedia,
} from "@/entities/media/@x/message";
import { getDb, messageMedia, messages, nextSnowflake, type Message } from "@/shared/db";
import type { MediaId, MessageId, UserId } from "@/shared/lib";
import { type DbTransaction } from "@/shared/storage";
import { and, eq, isNull } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";
import { listMessageMedia } from "./list-message-media";
import { getReplyPreview } from "./list-reply-previews";

// INFO: REQUIREMENTS.md § 10.x. 채팅으로 보내기 — a slot is a fresh upload or a re-reference to an already-registered row, told apart by which field it carries.
export type MediaAttachmentInput = ValidatedMedia | MediaReference;

export type CreateMediaMessageParams = {
  senderId: UserId;
  clientMsgId: string;
  /** Already HEAD-checked by `validateMediaUpload`, or named by id for a re-reference — either way, in the order the sender picked them. */
  media: MediaAttachmentInput[];
  /** REQUIREMENTS.md § 8.10. The quoted message; a precondition here for the same reason `media` is validated ahead of time. */
  replyToId?: MessageId;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — set once here, at insert; never updated after. */
  onlyMe?: boolean;
  /** REQUIREMENTS.md § 16.1. 조용히 보내기 — set once here, at insert, exactly as `onlyMe` is. */
  silent?: boolean;
  /** REQUIREMENTS.md § 8.15. Set when this attachment rides along with an Ask AI question — carried onto every freshly inserted `media` row via `insertMedia`. A re-referenced row keeps its own retention untouched. */
  aiExpiresAt?: Date;
};

export type CreateMediaMessageResult =
  | { status: "created"; message: ChatMessage; media: ArchiveMedia[] }
  | { status: "conflict" }
  | { status: "unprocessable" }
  | { status: "invalid_reference" };

// WARN: Rolls the transaction back rather than returning a sentinel — `insertMedia` may have already written rows this attempt owns, and either failure mode below must not commit an orphan.
class ReclaimedMediaError extends Error {}
// WARN: `client_msg_id` is unique table-wide (see `findOwnMessage`), so a collision with a row this sender does not own is a genuine conflict, not a retry.
class ForeignClientMsgIdError extends Error {}
class HeterogeneousBatchError extends Error {}
// WARN: A `{ mediaId }` slot repeated in one batch would insert two `message_media` rows for the same media — the request's shape is malformed rather than its ids being unresolved, so it maps to `unprocessable` rather than `invalid_reference`.
class DuplicateReferenceError extends Error {}
// WARN: REQUIREMENTS.md § 10.x. A re-referenced id that `resolveReferencedMedia` could not resolve — the shape of the request was fine, so this is its own status rather than folded into `unprocessable`, which the fresh-upload branch already owns.
class InvalidReferenceError extends Error {}

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
  silent = false,
  aiExpiresAt,
}: CreateMediaMessageParams): Promise<CreateMediaMessageResult> {
  type Written = { row: Message; inserted: ArchiveMedia[] };
  let written: Written;

  try {
    written = await getDb().transaction(async (tx): Promise<Written> => {
      // WARN: REQUIREMENTS.md § 10.x. Resolved on this transaction, not ahead of it — a separate read would let a reclaim or a 삭제 take the id between the check and the `message_media` insert below.
      const referenceIds = media.filter(isMediaReference).map((item) => item.mediaId);
      const uniqueReferenceIds = new Set(referenceIds);

      if (referenceIds.length !== uniqueReferenceIds.size) {
        throw new DuplicateReferenceError();
      }

      const resolvedReferences = await resolveReferencedMedia(tx, referenceIds, senderId);

      if (resolvedReferences.size !== uniqueReferenceIds.size) {
        throw new InvalidReferenceError();
      }

      if (!isHomogeneousBatch(media, resolvedReferences)) {
        throw new HeterogeneousBatchError();
      }

      const inserted: ArchiveMedia[] = [];

      for (const item of media) {
        if (isMediaReference(item)) {
          inserted.push(resolvedReferences.get(item.mediaId)!);
          continue;
        }

        const row = await insertMedia(tx, item, aiExpiresAt);

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
          silent,
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
    if (
      error instanceof ReclaimedMediaError ||
      error instanceof HeterogeneousBatchError ||
      error instanceof DuplicateReferenceError
    ) {
      return { status: "unprocessable" };
    }

    if (error instanceof InvalidReferenceError) {
      return { status: "invalid_reference" };
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

// INFO: REQUIREMENTS.md § 9.1., § 9.3. The set must be **all of one kind** — `toBubbles` splits a pick by kind in the browser, which a stale client or a hand-made request simply does not run. A re-referenced item has no `.kind` of its own, so it reads its kind off the resolved `ArchiveMedia`'s own discriminators instead.
// WARN: § 9.3. Voice is a third kind, not a variety of "file" — and a voice bubble is always exactly one clip, since there is no layout for two.
function isHomogeneousBatch(
  items: MediaAttachmentInput[],
  resolvedReferences: Map<MediaId, ArchiveMedia>,
): boolean {
  const flags = items.map((item) =>
    isMediaReference(item)
      ? toArchiveMediaFlags(resolvedReferences.get(item.mediaId)!)
      : { isVoice: item.kind === "voice", isFile: item.kind === "file" },
  );

  if (flags.some((flag) => flag.isVoice)) {
    return flags.length === 1;
  }

  return new Set(flags.map((flag) => flag.isFile)).size <= 1;
}

function toArchiveMediaFlags(row: ArchiveMedia): { isVoice: boolean; isFile: boolean } {
  return { isVoice: row.voice !== null, isFile: row.filename !== null };
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
