"use client";

import type { ChatMessage } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { CALENDAR_DAY_PARAM, CALENDAR_ROUTE } from "@/shared/config";
import type { SystemAction } from "@/shared/db";
import {
  cn,
  formatMonthDay,
  formatTime,
  LONG_PRESS_TARGET_CLASS,
  toDayKey,
  useLongPress,
  type LongPressPoint,
  type Maybe,
  type Nullable,
  type Optional,
} from "@/shared/lib";
import { HapticTarget, Link } from "@/shared/ui";
import {
  Bell,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarX,
  ChevronRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

export type EventNoticeCardProps = {
  className?: string;
  cardClassName?: string;
  message: ChatMessage;
  sender: Optional<Participant>;
  senderName: string;
  isMine?: boolean;
  isSelecting?: boolean;
  onOpenEvent?: (message: ChatMessage) => void;
  onLongPress?: (anchor: HTMLElement, point: LongPressPoint) => void;
};

function toCalendarHref(message: ChatMessage): string {
  if (!message.eventStartsAt) {
    return CALENDAR_ROUTE;
  }
  const params = new URLSearchParams({ [CALENDAR_DAY_PARAM]: toDayKey(message.eventStartsAt) });
  return `${CALENDAR_ROUTE}?${params}`;
}

function formatEventDateLabel(startsAt: Nullable<string>): string {
  if (!startsAt) {
    return "";
  }
  const date = new Date(startsAt);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const weekday = weekdays[date.getDay()];
  return `${formatMonthDay(date)} (${weekday}) ${formatTime(date)}`;
}

function getEventBadge(action: Maybe<SystemAction>) {
  switch (action) {
    case "event_created":
      return {
        label: "일정 등록",
        Icon: CalendarPlus,
        badgeClass: "bg-primary-tint/70 text-primary",
      };
    case "event_rescheduled":
      return {
        label: "일정 변경",
        Icon: CalendarClock,
        badgeClass: "bg-event-honey/15 text-event-honey",
      };
    case "event_deleted":
      return {
        label: "일정 삭제",
        Icon: CalendarX,
        badgeClass: "bg-surface-pressed text-meta",
      };
    case "event_reminder":
    default:
      return {
        label: "다가오는 일정",
        Icon: Bell,
        badgeClass: "bg-ai-tint/70 text-ai",
      };
  }
}

export function EventNoticeCard({
  className,
  cardClassName,
  message,
  sender,
  senderName,
  isMine = false,
  isSelecting = false,
  onOpenEvent,
  onLongPress,
}: EventNoticeCardProps) {
  const router = useRouter();

  const isReminder = message.systemAction === "event_reminder";
  const isDeleted = message.systemAction === "event_deleted";
  const timeString = formatTime(message.createdAt);
  const href = toCalendarHref(message);
  const dateLabel = formatEventDateLabel(message.eventStartsAt);
  const badge = getEventBadge(message.systemAction);

  const actorName = sender?.name ?? (isMine ? "나" : senderName);
  const baseName =
    actorName.endsWith("님") && actorName.length > 1 ? actorName.slice(0, -1) : actorName;
  const senderTitle = "캘린더 알리미";

  const longPressHandlers = useLongPress(
    !isSelecting && onLongPress ? (point, element) => onLongPress(element, point) : undefined,
  );

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isDeleted && message.eventId && onOpenEvent) {
      event.preventDefault();
      onOpenEvent(message);
    }
  };

  const renderAnnouncement = () => {
    if (isReminder) {
      return <span>곧 예정된 일정이 다가오고 있어요!</span>;
    }

    const subject =
      baseName === "나" ? (
        <span className="font-semibold text-ink">내가</span>
      ) : (
        <>
          <span className="font-semibold text-ink">{baseName}</span>님이
        </>
      );

    if (message.systemAction === "event_created") {
      return <span>{subject} 새 일정을 캘린더에 추가했어요</span>;
    }
    if (message.systemAction === "event_rescheduled") {
      return <span>{subject} 일정을 변경했어요</span>;
    }
    if (message.systemAction === "event_deleted") {
      return <span>{subject} 일정을 삭제했어요</span>;
    }
    return <span>캘린더 일정 알림</span>;
  };

  const BadgeIcon = badge.Icon;

  return (
    <div className={cn("group/row flex items-start gap-xs px-md pt-sm", className)}>
      {/* 1. Calendar Bot Avatar */}
      <HapticTarget keepsScroll>
        <button
          className={cn(
            "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full shadow-xs ring-1 transition-transform outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95",
            isReminder
              ? "bg-ai-tint text-ai ring-ai/25 focus-visible:ring-ai"
              : "bg-primary-tint text-primary ring-primary/25 focus-visible:ring-primary",
          )}
          type="button"
          aria-label="캘린더 열기"
          onClick={() => router.push(href)}
        >
          <CalendarDays className="size-4.5" strokeWidth={2} />
        </button>
      </HapticTarget>

      {/* 2. Main Column */}
      <div
        className={cn(
          "relative flex flex-col gap-2xs transition-[max-width] duration-(--duration-state) ease-out motion-reduce:transition-none",
          isSelecting ? "max-w-[calc(100%-84px)]" : "max-w-[calc(100%-44px)]",
        )}
      >
        {/* Sender Name */}
        <span className="px-2xs text-chat-name text-chat-sender [[data-wallpaper]_&]:on-wallpaper">
          {senderTitle}
        </span>

        {/* Card + Time beside it */}
        <div className="flex max-w-full items-end gap-2xs">
          <Link
            className={cn(
              "group relative flex max-w-[340px] min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border p-md text-left transition-all outline-none",
              "shadow-card border-primary/30 bg-canvas",
              "hover:border-primary/50 hover:shadow-floating active:scale-[0.99]",
              "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              LONG_PRESS_TARGET_CLASS,
              cardClassName,
            )}
            href={href}
            onClick={handleClick}
            {...longPressHandlers}
          >
            {/* Top Header Badge & Created Time */}
            <div className="flex min-w-0 items-center justify-between gap-xs">
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap",
                  badge.badgeClass,
                )}
              >
                <BadgeIcon className="size-3" aria-hidden />
                <span>{badge.label}</span>
              </span>
              <span className="shrink-0 text-caption font-medium whitespace-nowrap text-meta">
                {timeString}
              </span>
            </div>

            {/* Subtext Announcement & Title */}
            <div className="mt-sm flex flex-col gap-1">
              <p className="truncate text-caption text-meta">{renderAnnouncement()}</p>
              <h4 className="line-clamp-2 text-body-md leading-snug font-bold tracking-tight text-ink">
                {message.eventTitle ? `“${message.eventTitle}”` : "일정"}
              </h4>
              {dateLabel && (
                <div className="mt-1 flex items-center gap-1.5 text-caption text-meta">
                  <Calendar className="size-3.5 shrink-0 text-meta" />
                  <span className="truncate">{dateLabel}</span>
                </div>
              )}
            </div>

            {/* Action Callout Button */}
            <div className="mt-md flex items-center justify-between rounded-xl bg-surface-soft px-3 py-2.5 transition-colors group-hover:bg-primary-tint/40">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-full bg-primary text-on-primary shadow-xs">
                  <Calendar className="size-3.5" />
                </div>
                <span className="text-button-sm font-semibold text-ink">
                  {isDeleted ? "해당 날짜 캘린더 보기" : "일정 상세 확인하기"}
                </span>
              </div>
              <ChevronRight className="size-4 text-meta transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
          </Link>

          {/* Time beside bubble */}
          <div className="flex shrink-0 flex-col items-start pb-0.5 text-chat-time whitespace-nowrap text-chat-meta select-none [[data-wallpaper]_&]:on-wallpaper">
            <time dateTime={message.createdAt}>{timeString}</time>
          </div>
        </div>
      </div>
    </div>
  );
}
