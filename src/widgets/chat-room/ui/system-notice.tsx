import type { ChatMessage, MessageReaction } from "@/entities/message";
import type { Participant } from "@/entities/user";
import type { ReactionPayload } from "@/features/react-message";
import { CALENDAR_DAY_PARAM, CALENDAR_ROUTE } from "@/shared/config";
import {
  cn,
  composeEventNotice,
  toDayKey,
  type LongPressPoint,
  type Optional,
  type UserId,
} from "@/shared/lib";
import { Link } from "@/shared/ui";
import { EventNoticeCard } from "./event-notice-card";
import { TimeLetterArrivalNoticeCard } from "./time-letter-arrival-notice-card";
import { VocaCompletionNoticeCard } from "./voca-completion-notice-card";

export type SystemNoticeProps = {
  className?: string;
  message: ChatMessage;
  sender: Optional<Participant>;
  currentUserId?: UserId;
  isSelecting?: boolean;
  isBookmarked?: boolean;
  unreadCount?: number;
  readerTotal?: number;
  reactions?: MessageReaction[];
  onToggleReaction?: (reaction: ReactionPayload) => void;
  /** REQUIREMENTS.md § 11.5. Opens the event in place; only a notice still carrying an `eventId` can, the rest link to the day. */
  onOpenEvent?: (message: ChatMessage) => void;
  onOpenTimeLetter?: (letterId: string) => void;
  onLongPress?: (anchor: HTMLElement, point: LongPressPoint) => void;
};

// INFO: DESIGN.md § 6.5. System message notice rows rendered as rich cards in chat timeline.
export function SystemNotice({
  className,
  message,
  sender,
  currentUserId,
  isSelecting = false,
  isBookmarked = false,
  unreadCount = 0,
  readerTotal = 0,
  reactions,
  onToggleReaction,
  onOpenEvent,
  onOpenTimeLetter,
  onLongPress,
}: SystemNoticeProps) {
  const isMine = Boolean(currentUserId && message.senderId === currentUserId);
  const fallbackActor = isMine ? "나" : "파트너";
  const actor = sender?.name ?? fallbackActor;

  if (message.systemAction === "voca_completed") {
    return (
      <VocaCompletionNoticeCard
        className={className}
        currentUserId={currentUserId}
        isBookmarked={isBookmarked}
        isMine={isMine}
        isSelecting={isSelecting}
        message={message}
        reactions={reactions}
        readerTotal={readerTotal}
        senderName={actor}
        unreadCount={unreadCount}
        onLongPress={onLongPress}
        onToggleReaction={onToggleReaction}
      />
    );
  }

  if (message.systemAction === "time_letter_delivered") {
    let letterId = "";
    try {
      if (message.text) {
        const parsed = JSON.parse(message.text) as { letterId?: string };
        letterId = parsed.letterId ?? "";
      }
    } catch {
      letterId = message.text ?? "";
    }

    return (
      <TimeLetterArrivalNoticeCard
        className={className}
        currentUserId={currentUserId}
        isBookmarked={isBookmarked}
        isMine={Boolean(currentUserId && message.senderId === currentUserId)}
        isSelecting={isSelecting}
        message={message}
        reactions={reactions}
        readerTotal={readerTotal}
        senderName={actor}
        unreadCount={unreadCount}
        onOpen={letterId && onOpenTimeLetter ? () => onOpenTimeLetter(letterId) : undefined}
        onLongPress={onLongPress}
        onToggleReaction={onToggleReaction}
      />
    );
  }

  if (message.systemAction && message.systemAction.startsWith("event_")) {
    return (
      <EventNoticeCard
        className={className}
        currentUserId={currentUserId}
        isBookmarked={isBookmarked}
        isMine={Boolean(currentUserId && message.senderId === currentUserId)}
        isSelecting={isSelecting}
        message={message}
        reactions={reactions}
        readerTotal={readerTotal}
        sender={sender}
        senderName={actor}
        unreadCount={unreadCount}
        onOpenEvent={onOpenEvent}
        onLongPress={onLongPress}
        onToggleReaction={onToggleReaction}
      />
    );
  }

  const pillClassName =
    "min-w-0 rounded-full bg-chat-pill px-md py-2xs text-center text-caption whitespace-pre-wrap text-chat-pill-ink transition-colors outline-none hover:bg-chat-pill-pressed focus-visible:ring-2 focus-visible:ring-primary active:bg-chat-pill-pressed";

  // INFO: REQUIREMENTS.md § 11.5. Composed at render time from the live nickname, so a rename rewrites past notices too (§ 8.7.).
  const notice = composeEventNotice(
    message.systemAction,
    message.eventTitle,
    message.eventStartsAt,
    sender?.name,
  );

  return (
    <div className={cn("flex justify-center px-md py-sm", className)}>
      {message.eventId && onOpenEvent ? (
        <button
          className={cn("cursor-pointer", pillClassName)}
          type="button"
          onClick={() => onOpenEvent(message)}
        >
          {notice}
        </button>
      ) : (
        <Link className={pillClassName} href={toCalendarHref(message)}>
          {notice}
        </Link>
      )}
    </div>
  );
}

/**
 * WARN: The day is the whole destination — the event id is deliberately **not** in
 * the URL. A delete notice outlives its `events` row (§ 6.), so it has no id to
 * carry; the calendar arrives with that day selected and its agenda lists what is
 * left (§ 11.3.). A notice that still has one opens the event in place instead.
 */
function toCalendarHref(message: ChatMessage): string {
  if (!message.eventStartsAt) {
    return CALENDAR_ROUTE;
  }

  const params = new URLSearchParams({ [CALENDAR_DAY_PARAM]: toDayKey(message.eventStartsAt) });

  return `${CALENDAR_ROUTE}?${params}`;
}
