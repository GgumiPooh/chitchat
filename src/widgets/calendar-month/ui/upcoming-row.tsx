"use client";

import type { EventOccurrence } from "@/entities/event";
import { cn, formatUpcomingWhen, toDayKey } from "@/shared/lib";
import { EventDot, EventMemo, HapticTap } from "@/shared/ui";
import { CalendarClock } from "lucide-react";
import type { PropsWithChildren } from "react";

// INFO: A constant rather than `useId`, because the section renders once per screen and the value has to be readable from the list inside it.
export const UPCOMING_HEADING_ID = "upcoming-events-heading";

export type UpcomingSectionProps = PropsWithChildren<{
  className?: string;
}>;

/**
 * DESIGN.md § 7.9. The 다가오는 일정 heading and the bordered card under it. The
 * list itself is the caller's, because the live screen pins and scrolls its own
 * while REQUIREMENTS.md § 16.2.'s mirror lists what the snapshot holds and stops.
 */
export function UpcomingSection({ className, children }: UpcomingSectionProps) {
  return (
    <section className={cn("space-y-2xs", className)} aria-labelledby={UPCOMING_HEADING_ID}>
      {/* INFO: Named on screen, not only to a screen reader — the day agenda below the grid is a second list of events, and two unlabelled stacks of rows on one screen read as one. */}
      <h2 className="text-title-sm text-meta" id={UPCOMING_HEADING_ID}>
        다가오는 일정
      </h2>
      <div className="overflow-hidden rounded-md border border-hairline bg-canvas">{children}</div>
    </section>
  );
}

export type UpcomingEmptyRowProps = {
  className?: string;
};

// INFO: DESIGN.md § 7.9. A row and not § 7.6.'s card — the section is already a bordered card, and a box in a box stands taller than the rows it replaces.
export function UpcomingEmptyRow({ className }: UpcomingEmptyRowProps) {
  return (
    <p className={cn("flex items-center gap-xs px-md py-sm text-caption text-meta", className)}>
      <CalendarClock className="size-4 shrink-0 text-meta-soft" strokeWidth={1.75} />
      다가오는 일정이 없어요
    </p>
  );
}

export type UpcomingEventRowProps = {
  className?: string;
  occurrence: EventOccurrence;
  todayKey: string;
  /** Handed the day the grid should move to — today for an event already under way. */
  onSelect: (dayKey: string) => void;
};

/** DESIGN.md § 7.9. One row of 다가오는 일정: title, relative date, then the memo. */
export function UpcomingEventRow({
  className,
  occurrence,
  todayKey,
  onSelect,
}: UpcomingEventRowProps) {
  return (
    <li className={cn("group relative flex", className)}>
      <button
        className="flex w-full cursor-pointer items-start gap-xs px-md py-sm text-left transition-colors outline-none group-active:bg-surface-strong hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-strong"
        type="button"
        onClick={() => onSelect(toTargetDayKey(occurrence, todayKey))}
      >
        {/* INFO: The dot is nudged onto the title's own line rather than centred against the whole multi-line stack. */}
        <EventDot
          className="mt-1.5"
          size="row"
          color={occurrence.event.color}
          scope={occurrence.event.scope}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-xs">
            <span className="min-w-0 flex-1 truncate text-title-sm text-ink">
              {occurrence.event.title}
            </span>
            <span className="shrink-0 text-caption text-meta">
              {formatUpcomingWhen(occurrence, todayKey)}
            </span>
          </span>
          <EventMemo description={occurrence.event.description} />
        </span>
      </button>
      {/* WARN: `keepsScroll` — the row runs the width of the card, so a finger scrolling the calendar lands here, and the switch would keep that drag and end it as a tap on the event (`DESIGN.md § 7.15.1.`). */}
      <HapticTap className="touch-pan-y" forwardsTap keepsScroll />
    </li>
  );
}

/**
 * WARN: Clamped to today. An occurrence that began before today reads `진행 중`
 * (`formatUpcomingWhen`), and sending the grid to the day it started rewinds the
 * calendar a fortnight — often into a past month — to answer a tap on something
 * happening now.
 */
function toTargetDayKey(occurrence: EventOccurrence, todayKey: string): string {
  const startDayKey = toDayKey(occurrence.startsAt);

  return startDayKey < todayKey ? todayKey : startDayKey;
}
