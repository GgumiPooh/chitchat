import type { ChatMessage } from "@/entities/message";
import {
  A_DAY,
  formatDateWithWeekday,
  toDayKey,
  type Maybe,
  type Nullable,
  type UserId,
} from "@/shared/lib";

export type MirrorRow =
  | { key: string; kind: "date"; dayKey: string }
  | { key: string; kind: "system"; message: ChatMessage }
  | {
      key: string;
      kind: "message";
      message: ChatMessage;
      isMine: boolean;
      isFirstOfGroup: boolean;
      isLastOfGroup: boolean;
    };

/**
 * The conversation flattened into rows — DESIGN.md § 6.3.'s grouping and § 6.4.'s
 * date dividers, over a snapshot that carries no pending sends and needs no
 * virtualizer key revision.
 */
export function buildMirrorRows(messages: ChatMessage[], currentUserId: UserId): MirrorRow[] {
  const rows: MirrorRow[] = [];
  let previousDayKey: Nullable<string> = null;

  messages.forEach((message, index) => {
    const dayKey = toDayKey(message.createdAt);

    if (dayKey !== previousDayKey) {
      rows.push({ key: `d${dayKey}`, kind: "date", dayKey });
      previousDayKey = dayKey;
    }

    if (message.type === "system") {
      rows.push({ key: message.id, kind: "system", message });

      return;
    }

    const groupKey = toGroupKey(message);

    rows.push({
      key: message.id,
      kind: "message",
      message,
      isMine: message.senderId === currentUserId,
      isFirstOfGroup: toGroupKey(messages[index - 1]) !== groupKey,
      isLastOfGroup: toGroupKey(messages[index + 1]) !== groupKey,
    });
  });

  return rows;
}

/** DESIGN.md § 6.4. `오늘`, `어제`, then the full date. */
export function formatMirrorDayLabel(dayKey: string): string {
  const now = Date.now();

  if (dayKey === toDayKey(now)) {
    return "오늘";
  }
  if (dayKey === toDayKey(now - A_DAY)) {
    return "어제";
  }

  return formatDateWithWeekday(`${dayKey}T00:00:00Z`);
}

// INFO: DESIGN.md § 6.3. One sender inside one clock minute, which the ISO string's own prefix already is; a system notice joins no group.
function toGroupKey(message: Maybe<ChatMessage>): Nullable<string> {
  if (!message || message.type === "system") {
    return null;
  }

  return `${message.senderId}:${message.createdAt.slice(0, 16)}`;
}
