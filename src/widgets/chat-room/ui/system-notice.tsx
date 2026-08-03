import type { ChatMessage } from "@/entities/message";
import { cn, formatMonthDay, type Optional } from "@/shared/lib";
import type { ChatParticipant } from "../model/types";

export type SystemNoticeProps = {
  className?: string;
  message: ChatMessage;
  sender: Optional<ChatParticipant>;
};

// INFO: DESIGN.md § 6.5. Date-divider treatment, so a calendar notice reads as timeline furniture rather than as someone speaking.
// TODO: Make the pill tap through to its event once the calendar exists — step 9 of REQUIREMENTS.md § 17.
export function SystemNotice({ className, message, sender }: SystemNoticeProps) {
  return (
    <div className={cn("flex justify-center px-md py-sm", className)}>
      <span className="rounded-full bg-chat-pill px-sm py-2xs text-center text-caption text-chat-pill-ink">
        {composeNotice(message, sender)}
      </span>
    </div>
  );
}

/** REQUIREMENTS.md § 11.5. Composed here so a nickname change rewrites past notices too. */
function composeNotice(message: ChatMessage, sender: Optional<ChatParticipant>): string {
  const name = sender?.name ?? "";
  const date = message.eventStartsAt ? formatMonthDay(message.eventStartsAt) : "";
  const title = message.eventTitle ?? "";

  switch (message.systemAction) {
    case "event_created":
      return `${name}님이 ${date} '${title}' 일정을 추가했어요`;
    case "event_rescheduled":
      return `${name}님이 '${title}' 일정을 ${date}로 옮겼어요`;
    case "event_deleted":
      return `${name}님이 ${date} '${title}' 일정을 삭제했어요`;
    default:
      return "";
  }
}
