import type { ChatMessage } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { CALENDAR_DAY_PARAM, CALENDAR_ROUTE } from "@/shared/config";
import { cn, composeEventNotice, toDayKey, type Optional } from "@/shared/lib";
import { Link } from "@/shared/ui";

export type SystemNoticeProps = {
  className?: string;
  message: ChatMessage;
  sender: Optional<Participant>;
  /** REQUIREMENTS.md § 11.5. Opens the event in place; only a notice still carrying an `eventId` can, the rest link to the day. */
  onOpenEvent?: (message: ChatMessage) => void;
};

// INFO: DESIGN.md § 6.5. Date-divider treatment, so a calendar notice reads as timeline furniture rather than as someone speaking.
export function SystemNotice({ className, message, sender, onOpenEvent }: SystemNoticeProps) {
  // INFO: REQUIREMENTS.md § 11.5. Composed at render time from the live nickname, so a rename rewrites past notices too (§ 8.7.).
  const notice = composeEventNotice(
    message.systemAction,
    message.eventTitle,
    message.eventStartsAt,
    sender?.name,
  );

  const pillClassName =
    "min-w-0 rounded-full bg-chat-pill px-md py-2xs text-center text-caption whitespace-pre-wrap text-chat-pill-ink transition-colors outline-none hover:bg-chat-pill-pressed focus-visible:ring-2 focus-visible:ring-primary active:bg-chat-pill-pressed";

  return (
    <div className={cn("flex justify-center px-md py-sm", className)}>
      {/* WARN: The link carries the day and not the event id — a delete notice outlives its `events` row (§ 6.) and would otherwise have nothing to navigate to. */}
      {/* WARN: `px-md` and not the date divider's `px-sm` — this pill carries a sentence over two lines (§ 11.5.) where that one carries a word. `toNoticeHeight` subtracts the very same number, so the two move together or the row is priced against a width it is not wrapped in. */}
      {/* WARN: `min-w-0` is load-bearing. A flex item's automatic minimum size is min-content, and the inherited `overflow-wrap: break-word` does not reduce that (only `anywhere` does) — so a spaceless event title would widen the pill past the width REQUIREMENTS.md § 8.3.'s estimate wraps it at, and the row is counted a line too tall. */}
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
