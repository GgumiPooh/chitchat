import type { ChatMessage } from "@/entities/message";
import {
  A_DAY,
  formatDateWithWeekday,
  parseDayKey,
  toDayKey,
  type Maybe,
  type Nullable,
  type UserId,
} from "@/shared/lib";
import { drawsNotch } from "@/widgets/chat-room";

export type MirrorRow =
  | { key: string; kind: "date"; dayKey: string }
  | { key: string; kind: "system"; message: ChatMessage }
  /** DESIGN.md § 6.2. The finished AI answer — `buildChatRows`'s own third kind, mirrored. */
  | { key: string; kind: "assistant"; message: ChatMessage }
  | {
      key: string;
      kind: "message";
      message: ChatMessage;
      isMine: boolean;
      isFirstOfGroup: boolean;
      isLastOfGroup: boolean;
      /** DESIGN.md § 6.2. The notch corner, which goes to the first *bubble* of each run exactly as `buildChatRows` hands it out. */
      hasNotch: boolean;
    };

/**
 * The conversation flattened into rows — DESIGN.md § 6.3.'s grouping and § 6.4.'s
 * date dividers, over a snapshot that carries no pending sends and needs no
 * virtualizer key revision.
 */
export function buildMirrorRows(messages: ChatMessage[], currentUserId: UserId): MirrorRow[] {
  const rows: MirrorRow[] = [];
  let previousDayKey: Nullable<string> = null;
  // INFO: DESIGN.md § 6.2. The group whose notch the previous row already spent — cleared by any row that draws no bubble, which is what restarts the run.
  let notchedGroupKey: Nullable<string> = null;

  messages.forEach((message, index) => {
    const dayKey = toDayKey(message.createdAt);

    if (dayKey !== previousDayKey) {
      rows.push({ key: `d${dayKey}`, kind: "date", dayKey });
      previousDayKey = dayKey;
    }

    if (message.systemAction === "assistant_reply") {
      notchedGroupKey = null;
      rows.push({ key: message.id, kind: "assistant", message });

      return;
    }

    if (message.type === "system") {
      notchedGroupKey = null;
      rows.push({ key: message.id, kind: "system", message });

      return;
    }

    const groupKey = toGroupKey(message);
    const drawsBubble = drawsNotch(message);
    const hasNotch = drawsBubble && notchedGroupKey !== groupKey;

    notchedGroupKey = drawsBubble ? groupKey : null;

    rows.push({
      key: message.id,
      kind: "message",
      message,
      isMine: message.senderId === currentUserId,
      isFirstOfGroup: toGroupKey(messages[index - 1]) !== groupKey,
      isLastOfGroup: toGroupKey(messages[index + 1]) !== groupKey,
      hasNotch,
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

  return formatDateWithWeekday(parseDayKey(dayKey));
}

// INFO: DESIGN.md § 6.3. One sender inside one clock minute, which the ISO string's own prefix already is; a system notice joins no group.
function toGroupKey(message: Maybe<ChatMessage>): Nullable<string> {
  if (!message || message.type === "system") {
    return null;
  }

  return `${message.senderId}:${message.createdAt.slice(0, 16)}`;
}
