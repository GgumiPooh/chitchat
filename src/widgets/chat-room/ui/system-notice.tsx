import type { ChatMessage } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { CALENDAR_DAY_PARAM, CALENDAR_ROUTE } from "@/shared/config";
import { cn, composeEventNotice, toDayKey, type Optional } from "@/shared/lib";
import { Link } from "@/shared/ui";

export type SystemNoticeProps = {
  className?: string;
  message: ChatMessage;
  sender: Optional<Participant>;
};

// INFO: DESIGN.md § 6.5. Date-divider treatment, so a calendar notice reads as timeline furniture rather than as someone speaking.
export function SystemNotice({ className, message, sender }: SystemNoticeProps) {
  // INFO: REQUIREMENTS.md § 11.5. Composed at render time from the live nickname, so a rename rewrites past notices too (§ 8.7.).
  const notice = composeEventNotice(
    message.systemAction,
    message.eventTitle,
    message.eventStartsAt,
    sender?.name,
  );

  return (
    <div className={cn("flex justify-center px-md py-sm", className)}>
      {/* WARN: The day, not the event id, is what the link always carries — a delete notice outlives its `events` row (§ 6.) and would otherwise have nothing to navigate to. */}
      {/* WARN: `min-w-0` is load-bearing. A flex item's automatic minimum size is min-content, and the inherited `overflow-wrap: break-word` does not reduce that (only `anywhere` does) — so a spaceless event title would widen the pill past the width REQUIREMENTS.md § 8.3.'s estimate wraps it at, and the row is counted a line too tall. */}
      <Link
        className="min-w-0 rounded-full bg-chat-pill px-sm py-2xs text-center text-caption text-chat-pill-ink transition-colors outline-none hover:bg-chat-pill-pressed focus-visible:ring-2 focus-visible:ring-primary active:bg-chat-pill-pressed"
        href={toCalendarHref(message)}
      >
        {notice}
      </Link>
    </div>
  );
}

/**
 * WARN: The day is the whole destination — the event id is deliberately **not** in
 * the URL. A delete notice outlives its `events` row (§ 6.), so half of these
 * notices have no id to carry and the calendar would need a second way in anyway.
 * The day's sheet lists the event, which is what "navigates to the event" means
 * here (§ 11.5.).
 */
function toCalendarHref(message: ChatMessage): string {
  if (!message.eventStartsAt) {
    return CALENDAR_ROUTE;
  }

  const params = new URLSearchParams({ [CALENDAR_DAY_PARAM]: toDayKey(message.eventStartsAt) });

  return `${CALENDAR_ROUTE}?${params}`;
}
