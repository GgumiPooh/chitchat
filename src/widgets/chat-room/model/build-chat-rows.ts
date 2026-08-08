import type { ChatMessage } from "@/entities/message";
import type { PendingMessage } from "@/features/send-message";
import { toDayKey, type Nullable } from "@/shared/lib";
import type { ChatRow } from "./types";

export type BuildChatRowsParams = {
  messages: ChatMessage[];
  pending: PendingMessage[];
  currentUserId: string;
};

type Entry = {
  key: string;
  dayKey: string;
  groupKey: Nullable<string>;
  message: Nullable<ChatMessage>;
  pending: Nullable<PendingMessage>;
};

/**
 * Flattens the conversation into the virtualizer's item list — date dividers,
 * system notices, and the grouping flags of DESIGN.md § 6.3.
 */
export function buildChatRows({
  messages,
  pending,
  currentUserId,
}: BuildChatRowsParams): ChatRow[] {
  const entries: Entry[] = [
    ...messages.map((message) => ({
      key: `m${message.id}:${toRowRevision(message)}`,
      dayKey: toDayKey(message.createdAt),
      // INFO: DESIGN.md § 6.3. A group is one sender inside one clock minute; a `system` notice never joins one.
      groupKey: message.type === "system" ? null : toGroupKey(message.senderId, message.createdAt),
      message,
      pending: null,
    })),
    ...pending.map((entry) => ({
      key: `p${entry.clientMsgId}`,
      dayKey: toDayKey(entry.createdAt),
      groupKey: toGroupKey(currentUserId, entry.createdAt),
      message: null,
      pending: entry,
    })),
  ];

  const rows: ChatRow[] = [];
  let previousDayKey: Nullable<string> = null;

  entries.forEach((entry, index) => {
    if (entry.dayKey !== previousDayKey) {
      rows.push({ key: `d${entry.dayKey}`, kind: "date", dayKey: entry.dayKey });
      previousDayKey = entry.dayKey;
    }

    if (entry.message?.type === "system") {
      rows.push({ key: entry.key, kind: "system", message: entry.message });

      return;
    }

    const previous = entries[index - 1];
    const next = entries[index + 1];
    const isFirstOfGroup = !previous || previous.groupKey !== entry.groupKey;
    const isLastOfGroup = !next || next.groupKey !== entry.groupKey;

    if (entry.pending) {
      rows.push({
        key: entry.key,
        kind: "pending",
        pending: entry.pending,
        isFirstOfGroup,
        isLastOfGroup,
      });

      return;
    }
    if (entry.message) {
      rows.push({
        key: entry.key,
        kind: "message",
        message: entry.message,
        isMine: entry.message.senderId === currentUserId,
        isFirstOfGroup,
        isLastOfGroup,
      });
    }
  });

  return rows;
}

// INFO: The ISO string is UTC, and every offset is a whole number of minutes, so slicing it groups by the local clock minute too.
function toGroupKey(senderId: string, createdAt: string): string {
  return `${senderId}:${createdAt.slice(0, 16)}`;
}

/**
 * REQUIREMENTS.md § 8.3. Everything about a message that can move its row height
 * after the row has already been measured, folded into the key.
 *
 * WARN: The virtualizer caches one measured height per key, and a key it already
 * holds never goes back through `estimateSize` — so a row whose content changed
 * under an unchanged key keeps the stale height. On screen the `ResizeObserver`
 * hides that; scrolled away there is no observer, and the error surfaces as a jump
 * when the reader comes back to it. Changing the key is what retires the entry.
 *
 * WARN: Only what moves the *height* belongs here. A key change remounts the row,
 * so folding in something that changes often would trade drift for churn — the
 * quote's own text is deliberately absent, since § 6.10.'s box is two fixed lines
 * whatever it says.
 */
function toRowRevision({ editedAt, replyTo }: ChatMessage): string {
  // INFO: DESIGN.md § 6.10. The quote is `max(thumbnail, two lines)`, so losing the thumbnail to a § 8.10. delete is a real change of height rather than only of wording.
  return `${editedAt ?? ""}:${replyTo?.thumbnailMediaId ?? ""}`;
}
