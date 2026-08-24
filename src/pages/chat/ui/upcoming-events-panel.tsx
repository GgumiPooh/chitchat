"use client";

import type { EventOccurrence } from "@/entities/event";
import { cn, formatUpcomingWhen, OPEN_OVERLAY_SELECTOR, type Nullable } from "@/shared/lib";
import { EmptyState, HapticTap, IconButton } from "@/shared/ui";
import { EventDot, EventMemo } from "@/widgets/calendar-month";
import { CalendarClock, ChevronDown, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const HEADING_ID = "chat-upcoming-events-heading";

export type UpcomingEventsPanelProps = {
  className?: string;
  isOpen: boolean;
  occurrences: EventOccurrence[];
  todayKey: string;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onSelect: (occurrence: EventOccurrence) => void;
  onClose: () => void;
};

/**
 * REQUIREMENTS.md § 11.5.1. 캘린더's 다가오는 일정, opened from 채팅's own header.
 *
 * WARN: Laid out at all times and hidden by opacity, never unmounted — an unmounted
 * panel has no closing frame to animate, and `inert` is what takes its rows back out
 * of the tab order while it is away (the same trade § 7.3.'s tab bar makes).
 *
 * WARN: `absolute` over the conversation and never a row above it. `ChatScreen` is
 * sized to the visual viewport (DESIGN.md § 3.4.), so a panel laid out in that column
 * would take its height out of the room — the messages would step down on open and
 * back up on close, under a reader who is looking at them.
 */
export function UpcomingEventsPanel({
  className,
  isOpen,
  occurrences,
  todayKey,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onSelect,
  onClose,
}: UpcomingEventsPanelProps) {
  const listRef = useRef<HTMLUListElement>(null);
  // INFO: How many rows stood before the page in flight was asked for — its first new row is that index.
  const pendingFrom = useRef<Nullable<number>>(null);
  // INFO: Held in a ref so the listener below binds on `isOpen` alone — the screen hands down a fresh arrow on every message that arrives.
  const close = useRef(onClose);
  // INFO: REQUIREMENTS.md § 11.5.1. The list's own height at the moment of the first 더 보기, held from then on.
  const [lockedHeight, setLockedHeight] = useState<Nullable<number>>(null);

  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  // INFO: REQUIREMENTS.md § 11.5.1. Esc leaves through `onClose` and never a path of its own, so it records what was imminent exactly as 닫기 does.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // WARN: REQUIREMENTS.md § 8.14. A row's `EventDetailDialog` opens over this and answers Esc itself — Radix does not stop a document listener from seeing the same keystroke, and acting anyway takes the panel down under the dialog it dismissed.
      if (event.key !== "Escape" || event.isComposing) {
        return;
      }

      if (document.querySelector(OPEN_OVERLAY_SELECTOR)) {
        return;
      }

      // WARN: REQUIREMENTS.md § 8.14. Capture, and stopped there. The room's shortcuts are on `document` too and see no marker on this panel, so left to run they peel the composer's stack underneath a reader who was closing this.
      event.stopPropagation();
      close.current();
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen]);

  // WARN: Held until the page has actually landed. `limit` steps on the press and reveals the one row already in hand, so the list grows by **one** first — moved on that render the scroll is computed against a list a page short, clamps to its bottom, and the rows that follow arrive under a reader who has been left where they started.
  // INFO: The row to move to is fixed at the press, and the ref is cleared on use — a refresh landing later also grows the list and must not scroll the reader a second time.
  useEffect(() => {
    if (isLoadingMore) {
      return;
    }

    const index = pendingFrom.current;
    const list = listRef.current;
    const row = index === null ? undefined : list?.children[index];

    if (index === null || !list || !(row instanceof HTMLElement)) {
      return;
    }

    pendingFrom.current = null;

    const top = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;

    // INFO: REQUIREMENTS.md § 11.5.1. The arriving row is put at the top edge, with no inset held back for the one before it — the page the reader asked for is what the list should be showing.
    // WARN: A page arrives at the **end** of the list, so this is already the maximum scroll and the browser clamps it. Nothing may be added past it expecting to travel further.
    // INFO: DESIGN.md § 4.7. Reduced motion keeps the destination and drops the travel, which is the one thing here that is motion for its own sake.
    list.scrollTo({
      top,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [isLoadingMore, occurrences.length]);

  return (
    <div
      className={cn(
        "absolute inset-x-0 top-(--app-header-inset) z-20 px-sm transition-[opacity,translate] duration-(--duration-state) ease-out motion-reduce:transition-none",
        isOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2xs opacity-0",
        className,
      )}
      role="region"
      inert={!isOpen}
      aria-labelledby={HEADING_ID}
    >
      {/* INFO: DESIGN.md § 3.5. `glass`, the surface every floating thing in this app wears — the conversation carries on beneath it and has to stay legible as it does. */}
      <div className="flex flex-col overflow-hidden rounded-md border border-hairline glass shadow-floating">
        <div className="flex shrink-0 items-center justify-between gap-xs border-b border-hairline py-2xs pr-2xs pl-md">
          <h2 className="text-title-sm text-meta" id={HEADING_ID}>
            다가오는 일정
          </h2>
          <IconButton
            buttonClassName="size-9"
            Icon={X}
            haptic
            aria-label="다가오는 일정 닫기"
            onClick={onClose}
          />
        </div>
        {occurrences.length === 0 ? (
          // INFO: An empty state, where DESIGN.md § 7.9.'s card refuses one — that card draws itself, this one answers a tap, and a control that opens nothing has not said whether it worked.
          <EmptyState
            className="px-md py-md"
            Icon={CalendarClock}
            description="다가오는 일정이 없어요"
          />
        ) : (
          // WARN: The scroller is the list and never the card. 더 보기 sits outside it precisely so it stays at the foot of the panel — inside, the one control that grows the list would be the one the reader has to scroll to reach.
          // WARN: The **list** is what is measured and pinned. Pressing 더 보기 must not resize it under the finger, and the button leaving must take its own row off the panel rather than being handed to the list — pinning the card answers the first and not the second.
          <ul
            ref={listRef}
            className={cn(
              "shrink-0 divide-y divide-hairline",
              lockedHeight !== null && "scrollbar-hidden overflow-y-auto overscroll-contain",
            )}
            style={lockedHeight === null ? undefined : { height: lockedHeight }}
          >
            {occurrences.map((occurrence) => (
              <li key={occurrence.event.id + occurrence.startsAt} className="group relative flex">
                <button
                  className="flex w-full cursor-pointer items-start gap-xs px-md py-sm text-left transition-colors outline-none group-active:bg-surface-soft hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-soft"
                  type="button"
                  onClick={() => onSelect(occurrence)}
                >
                  {/* INFO: The dot is 4px against a multi-line row, so it is nudged onto the title's own baseline rather than centred against the whole stack. */}
                  <EventDot
                    className="mt-[7px]"
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
                {/* WARN: `keepsScroll` — the row runs the width of the panel, so a finger scrolling the list lands here (`DESIGN.md § 7.15.1.`). */}
                <HapticTap className="touch-pan-y" forwardsTap keepsScroll />
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <button
            className="flex w-full shrink-0 cursor-pointer items-center justify-center gap-2xs border-t border-hairline py-sm text-caption text-meta transition-colors outline-none hover:bg-surface-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={isLoadingMore}
            onClick={expand}
          >
            {isLoadingMore ? "불러오는 중" : "더 보기"}
            {!isLoadingMore && <ChevronDown className="size-4" strokeWidth={1.75} />}
          </button>
        )}
      </div>
    </div>
  );

  // WARN: Measured **before** the page is asked for, in the handler rather than in an effect — a frame later the new rows are already in the list and the height read back includes them.
  function expand() {
    if (lockedHeight === null && listRef.current) {
      setLockedHeight(listRef.current.getBoundingClientRect().height);
    }

    pendingFrom.current = occurrences.length;
    onLoadMore();
  }
}
