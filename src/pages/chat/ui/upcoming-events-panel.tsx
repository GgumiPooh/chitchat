"use client";

import type { EventOccurrence } from "@/entities/event";
import { cn, OPEN_OVERLAY_SELECTOR } from "@/shared/lib";
import { IconButton } from "@/shared/ui";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { UpcomingEventsList } from "./upcoming-events-list";

const HEADING_ID = "chat-upcoming-events-heading";

export type UpcomingEventsPanelProps = {
  className?: string;
  isOpen: boolean;
  occurrences: EventOccurrence[];
  todayKey: string;
  now: number;
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
 * would take its height out of the room.
 */
export function UpcomingEventsPanel({
  className,
  isOpen,
  occurrences,
  todayKey,
  now,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onSelect,
  onClose,
}: UpcomingEventsPanelProps) {
  // INFO: Held in a ref so the listener below binds on `isOpen` alone — the screen hands down a fresh arrow on every message that arrives.
  const close = useRef(onClose);

  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  // INFO: REQUIREMENTS.md § 11.5.1. Esc leaves through `onClose` and never a path of its own, so it records what was imminent exactly as 닫기 does.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // WARN: REQUIREMENTS.md § 8.14. A row's `EventDetailDialog` opens over this and answers Esc itself — Radix does not stop a document listener from seeing the same keystroke.
      if (event.key !== "Escape" || event.isComposing) {
        return;
      }

      if (document.querySelector(OPEN_OVERLAY_SELECTOR)) {
        return;
      }

      // WARN: REQUIREMENTS.md § 8.14. Capture, and stopped there — the room's shortcuts are on `document` too and see no marker on this panel.
      event.stopPropagation();
      close.current();
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen]);

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
      {/* WARN: DESIGN.md § 3.4. Capped against the screen it hangs in, and not left to the pinning below — the two terms are what it hangs between: the header it starts under, and the composer `--bottom-inset` holds up. */}
      <div className="flex max-h-[calc(var(--chat-screen-height)-var(--app-header-inset)-var(--bottom-inset))] flex-col overflow-hidden rounded-md border border-hairline glass shadow-floating">
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
        <UpcomingEventsList
          className="min-h-0 flex-1"
          occurrences={occurrences}
          todayKey={todayKey}
          now={now}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={onLoadMore}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}
