import type { ChatMessage } from "@/entities/message";
import type { PendingMessage } from "@/features/send-message";
import type { UserId } from "@/shared/lib";
import { toDayKey, type Nullable } from "@/shared/lib";
import type { ChatRow } from "./types";

export type BuildChatRowsParams = {
  messages: ChatMessage[];
  pending: PendingMessage[];
  currentUserId: UserId;
  /**
   * REQUIREMENTS.md § 16.1. 나에게만 보내기 — while this reader's own device is on
   * that mode, the timeline narrows to exactly the messages carrying `onlyMe`:
   * their own private sends and the AI answers those private questions produced.
   * A message sent under 조용히 보내기 or 알림 울리게 보내기, and a calendar system
   * notice however triggered, all drop out of the *view* (never the data — leaving
   * the mode restores them).
   */
  hideOthers?: boolean;
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
  hideOthers = false,
}: BuildChatRowsParams): ChatRow[] {
  // INFO: REQUIREMENTS.md § 16.1. Filtered ahead of the entry list, not at each push below — a date divider must not survive for a day whose every non-`onlyMe` message this drops, and this is what keeps that in step.
  const visibleMessages = hideOthers
    ? messages.filter((message) => message.onlyMe)
    : messages.filter((message) => !message.onlyMe);

  const entries: Entry[] = [
    ...visibleMessages.map((message) => ({
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

    // INFO: The finished assistant reply is its own row kind — DESIGN.md § 6.2. draws it as a left-aligned bubble, not the § 6.5. pill every other system notice takes.
    if (entry.message?.systemAction === "assistant_reply") {
      rows.push({
        key: entry.key,
        kind: "assistant",
        message: entry.message,
        isCollapsed: entry.message.isCollapsed,
      });

      return;
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
        isCollapsed: entry.message.isCollapsed,
        isMine: entry.message.senderId === currentUserId,
        isFirstOfGroup,
        isLastOfGroup,
      });
    }
  });

  return rows;
}

// INFO: The ISO string is UTC, and every offset is a whole number of minutes, so slicing it groups by the local clock minute too.
function toGroupKey(senderId: UserId, createdAt: string): string {
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
function toRowRevision({ editedAt, isDeleted, replyTo, isCollapsed }: ChatMessage): string {
  // WARN: REQUIREMENTS.md § 8.13. First, and the widest swing of the three. A withdrawn photo message drops a whole media box for one line, so a row that kept its key here would sit on a cached height hundreds of pixels wrong until it next mounted.
  // INFO: DESIGN.md § 6.10. The quote is `max(thumbnail, two lines)`, so losing the thumbnail to a § 8.10. delete is a real change of height rather than only of wording.
  // WARN: Presence and not the asset's identity, because that is all the box is `max`ed against — an attachment tile and an emoticon tile are the same 32px, and the § 8.10. count beside them rides on a `truncate`d line that cannot grow.
  // WARN: REQUIREMENTS.md § 8.8.'s unread count is deliberately **not** here, although it is a line in the same § 6.3. stack that `editedAt` is. It is the one height input driven by the *other* participant's cursor, so folding it in remounts every bubble they have just read — restarting each emoticon's animation and re-decoding each attachment — where leaving it out costs a cached height one `chat-time` line stale on a row that is not mounted. The rows it can reach are the newest ones by construction, which are the ones on screen and therefore the ones the `ResizeObserver` already covers.
  // WARN: REQUIREMENTS.md § 8.17. A fold is the same order of swing a withdrawal is — a screenful of markdown for one line. Left out, the virtualizer keeps the height it cached and draws the other state inside it.
  return `${isDeleted ? "d" : ""}:${editedAt ?? ""}:${replyTo?.thumbnail ? "t" : ""}:${isCollapsed ? "c" : ""}`;
}
