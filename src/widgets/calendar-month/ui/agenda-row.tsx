"use client";

import type { EventOccurrence } from "@/entities/event";
import type { Participant } from "@/entities/user";
import { cn, formatMultiDaySpan, formatOccurrenceTime, type Optional } from "@/shared/lib";
import { Avatar, HapticTap } from "@/shared/ui";
import type { ReactNode } from "react";
import { EventDot } from "./event-dot";
import { EventMemo } from "./event-memo";

export type AgendaEventRowProps = {
  className?: string;
  occurrence: EventOccurrence;
  /** The day the row is listed under, which decides how a multi-day span reads its time. */
  dayKey: string;
  /** REQUIREMENTS.md § 11.4. Authorship is shown, never enforced — either user may edit any event. */
  author: Optional<Participant>;
  onSelect: (occurrence: EventOccurrence) => void;
};

/**
 * DESIGN.md § 7.9. One event under the day agenda — the live screen and
 * REQUIREMENTS.md § 16.2.'s mirror draw the same row, so it lives in the widget
 * both may reach rather than in a page neither may import from.
 */
export function AgendaEventRow({
  className,
  occurrence,
  dayKey,
  author,
  onSelect,
}: AgendaEventRowProps) {
  return (
    <li className={cn("group relative flex", className)}>
      <button
        className="flex min-h-11 w-full cursor-pointer items-center gap-xs rounded-md bg-surface-soft px-md py-sm text-left transition-colors outline-none group-active:bg-surface-pressed hover:bg-surface-strong focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-pressed"
        type="button"
        onClick={() => onSelect(occurrence)}
      >
        <EventDot color={occurrence.event.color} scope={occurrence.event.scope} size="row" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-title-sm text-ink">{occurrence.event.title}</span>
          {/* INFO: REQUIREMENTS.md § 11.5. Scope is named rather than left to the 4px ring the grid uses — at this size a word is legible where the shape is not, and `개인` is viewer-neutral where `내` would be wrong for whichever of the two did not write it. */}
          <span className="block text-caption text-meta">
            {[
              formatMultiDaySpan(occurrence),
              formatOccurrenceTime(occurrence, dayKey),
              occurrence.event.scope === "mine" ? "개인 일정" : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <EventMemo description={occurrence.event.description} />
        </span>
        {/* WARN: Not enlargeable, unlike the chat row's. This sits inside the button that opens the event, where a nested `button` is invalid markup and would swallow the tap the row exists for. */}
        {author && (
          <Avatar className="size-6 shrink-0" name={author.name} mediaId={author.avatarMediaId} />
        )}
      </button>
      {/* WARN: `keepsScroll` — the row runs the width of the shell, so a finger scrolling the screen lands here, and the switch would keep that drag and end it as a tap on the event (`DESIGN.md § 7.15.1.`). */}
      <HapticTap className="touch-pan-y" forwardsTap keepsScroll />
    </li>
  );
}

export type AgendaStaticRowProps = {
  className?: string;
  marker: ReactNode;
  label: string;
  caption: string;
};

/**
 * DESIGN.md § 7.9. The treatment a 공휴일 and a 기념일 share — `hairline` on
 * `canvas`, with no hover or active state, because neither one opens anything.
 */
export function AgendaStaticRow({ className, marker, label, caption }: AgendaStaticRowProps) {
  return (
    <li
      className={cn(
        "flex min-h-11 items-center gap-xs rounded-md border border-hairline bg-canvas px-md py-sm",
        className,
      )}
    >
      {marker}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-title-sm text-ink">{label}</span>
        <span className="block text-caption text-meta">{caption}</span>
      </span>
    </li>
  );
}
