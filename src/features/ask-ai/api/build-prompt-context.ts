import "server-only";

import { getEmoticonItem, toSlotAsset } from "@/entities/emoticon";
import { getMediaRow, toVariantKey, type ChatMedia } from "@/entities/media";
import {
  getMessageIdByClientMsgId,
  listAssistantRepliesAfter,
  listMessagesByIds,
  listRecentAssistantExchanges,
  type ChatMessage,
} from "@/entities/message";
import { listUsers } from "@/entities/user";
import {
  AI_CONTEXT_EXCHANGE_COUNT,
  isLlmInlineMime,
  isVideoMime,
  LLM_INLINE_REQUEST_MAX_BYTES,
  toLlmProviderBranding,
  toMessageSummary,
} from "@/shared/config";
import { nextSnowflake } from "@/shared/db";
import {
  compareId,
  type EmoticonItemId,
  type MediaId,
  type MessageId,
  type Optional,
  type UserId,
} from "@/shared/lib";
import { readObject } from "@/shared/storage";
import type { PromptAttachment, PromptContext, PromptContextEntry } from "../model/prompt-context";

/**
 * Resolves the ids a client selected into what a provider can read: every
 * attachment kind inline where the mime and the running size budget allow it,
 * and everything else — a mime Gemini has no decoder for, an attachment that
 * would blow the budget, a deleted parent — folded into a short Korean
 * description instead.
 *
 * INFO: REQUIREMENTS.md § 8.15. The newest `AI_CONTEXT_EXCHANGE_COUNT`
 * question/answer pairs ride along unconditionally, ahead of and merged with the
 * client's own selection — the room's chat history is what a selection is for,
 * the conversation with the model itself is not.
 *
 * INFO: Runs after the caller's advisory lock is granted, not while the request
 * sits in the queue — `questionClientMsgId` is how it catches a queued question
 * up on answers that finished during the wait: every live `assistant_reply`
 * newer than the question message itself is appended after the client's own
 * selection, since those did not exist yet when the client built it.
 */
export async function buildPromptContext(
  question: string,
  messageIds: MessageId[],
  questionClientMsgId: string,
  askerId: UserId,
  onlyMe: boolean,
): Promise<PromptContext> {
  const selectedIds = [...messageIds].sort(compareId);

  const [selectedRows, exchangeRows, participants, questionMessageId] = await Promise.all([
    listMessagesByIds(selectedIds, askerId),
    listRecentAssistantExchanges(AI_CONTEXT_EXCHANGE_COUNT, askerId, onlyMe),
    listUsers(),
    getMessageIdByClientMsgId(questionClientMsgId),
  ]);

  // WARN: `questionClientMsgId` names a row the client inserted moments before this POST — a race the DB replication has not caught up on yet falls back to a freshly minted id, which is newer than every row already landed and is all the fallback needs to be.
  const lateReplies = await listAssistantRepliesAfter(
    questionMessageId ?? nextSnowflake<MessageId>(),
    askerId,
    onlyMe,
  );

  // WARN: Keyed by id rather than concatenated — a selected message is very often one of the pairs above, and a duplicated entry is the model reading the same turn twice.
  const contextRows = new Map<MessageId, ChatMessage>();

  for (const row of [...exchangeRows, ...selectedRows]) {
    contextRows.set(row.id, row);
  }

  const rows: ChatMessage[] = [
    ...[...contextRows.values()].sort((left, right) => compareId(left.id, right.id)),
    ...lateReplies.filter((reply) => !contextRows.has(reply.id)),
  ];

  const nameById = new Map(participants.map((participant) => [participant.id, participant.name]));

  const entries: PromptContextEntry[] = [];
  // WARN: Shared across the whole context, not reset per message — a question that selects five photos and a video budgets them against one another, the way one actual request to Gemini has to.
  let remainingBudget = LLM_INLINE_REQUEST_MAX_BYTES;

  for (const row of rows) {
    // WARN: A deleted message is skipped rather than described — the tombstone carries no payload, so there is nothing left for the model to read.
    if (row.isDeleted) {
      continue;
    }

    const { text, attachments, usedBytes } = await toEntryContent(row, remainingBudget);

    remainingBudget -= usedBytes;

    // WARN: An `assistant_reply` labeled with the asker's name would have the model read its own past answer as something the user said — `toLlmProviderBranding` is the same name the bubble itself renders under.
    const isAssistantReply = row.type === "system" && row.systemAction === "assistant_reply";
    const senderName = isAssistantReply
      ? toLlmProviderBranding(row.llmProvider).name
      : (nameById.get(row.senderId) ?? "알 수 없음");

    entries.push({ senderName, role: isAssistantReply ? "assistant" : "user", text, attachments });
  }

  return { question, entries };
}

type EntryContent = Pick<PromptContextEntry, "text" | "attachments"> & { usedBytes: number };

async function toEntryContent(
  message: ChatMessage,
  remainingBudget: number,
): Promise<EntryContent> {
  if (message.type === "emoticon") {
    return toEmoticonEntryContent(message.emoticon, remainingBudget);
  }

  if (message.type === "media") {
    return toMediaEntryContent(message.media, remainingBudget);
  }

  return { text: toMessageSummary(message.text ?? ""), attachments: [], usedBytes: 0 };
}

async function toMediaEntryContent(
  media: ChatMessage["media"],
  remainingBudget: number,
): Promise<EntryContent> {
  const attachments: PromptAttachment[] = [];
  const descriptions: string[] = [];
  let usedBytes = 0;

  for (const item of media) {
    if (item.isDeleted) {
      continue;
    }

    if (isLlmInlineMime(item.mime) && item.size <= remainingBudget - usedBytes) {
      const attachment = await readInlineAttachment(item.id, remainingBudget - usedBytes);

      if (attachment) {
        attachments.push(attachment);
        usedBytes += attachment.bytes.byteLength;

        continue;
      }
    }

    descriptions.push(toAttachmentDescription(item));
  }

  return { text: descriptions.join(" "), attachments, usedBytes };
}

async function readInlineAttachment(
  mediaId: MediaId,
  maxBytes: number,
): Promise<Optional<PromptAttachment>> {
  const row = await getMediaRow(mediaId);

  if (!row) {
    return undefined;
  }

  const object = await readObject(toVariantKey(row, "original"), maxBytes);

  return object ? { bytes: object.bytes, mime: object.mime } : undefined;
}

/**
 * A `type = 'emoticon'` row: its animated image inline (falling back to the
 * still slot the way the picker itself does), plus its keywords in the text
 * so the model can name the emoticon even when the image is filtered out or
 * over budget. A deleted item keeps the bare placeholder — the tombstone the
 * bubble itself draws has nothing left to send.
 */
async function toEmoticonEntryContent(
  emoticon: ChatMessage["emoticon"],
  remainingBudget: number,
): Promise<EntryContent> {
  if (!emoticon || emoticon.isDeleted) {
    return { text: "(이모티콘)", attachments: [], usedBytes: 0 };
  }

  const text =
    emoticon.keywords.length > 0 ? `(이모티콘: ${emoticon.keywords.join(", ")})` : "(이모티콘)";
  const attachment = await readEmoticonImage(emoticon.id, remainingBudget);

  return attachment
    ? { text, attachments: [attachment], usedBytes: attachment.bytes.byteLength }
    : { text, attachments: [], usedBytes: 0 };
}

async function readEmoticonImage(
  itemId: EmoticonItemId,
  maxBytes: number,
): Promise<Optional<PromptAttachment>> {
  const item = await getEmoticonItem(itemId);
  const asset = item && toSlotAsset(item, "animated-image");

  if (!asset || !isLlmInlineMime(asset.mime)) {
    return undefined;
  }

  const object = await readObject(asset.key, maxBytes);

  return object ? { bytes: object.bytes, mime: object.mime } : undefined;
}

function toAttachmentDescription(item: ChatMedia): string {
  if (item.voice) {
    return "(음성 메시지)";
  }

  if (item.filename) {
    return `(파일: ${item.filename})`;
  }

  return isVideoMime(item.mime) ? "(동영상)" : "(사진)";
}
