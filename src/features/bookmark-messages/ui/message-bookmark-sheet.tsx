"use client";

import type { MessageBookmark } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { toReplySummary } from "@/shared/config";
import { formatMonthDay, formatTime, idToDate, type MessageId } from "@/shared/lib";
import { EmptyState, ExpandableSheet, HapticTarget, QuoteThumbnailTile } from "@/shared/ui";
import { Bookmark } from "lucide-react";

export type MessageBookmarkSheetProps = {
  className?: string;
  isOpen: boolean;
  bookmarks: MessageBookmark[];
  participants: Participant[];
  onClose: () => void;
  onSelect: (id: MessageId) => void;
};

/** REQUIREMENTS.md § 8.19. The reader's own 책갈피 list — the § 8.18. sheet shell, now shared. */
export function MessageBookmarkSheet({
  className,
  isOpen,
  bookmarks,
  participants,
  onClose,
  onSelect,
}: MessageBookmarkSheetProps) {
  const nameById = new Map(participants.map((participant) => [participant.id, participant.name]));

  return (
    <ExpandableSheet
      className={className}
      isOpen={isOpen}
      header={{ title: bookmarks.length > 0 ? `책갈피 ${bookmarks.length}` : "책갈피" }}
      onClose={onClose}
    >
      {bookmarks.length === 0 ? (
        <EmptyState className="mt-2xl" Icon={Bookmark} description="책갈피한 메시지가 없어요" />
      ) : (
        <div className="flex flex-col gap-2xs pb-md">
          {bookmarks.map((bookmark) => (
            <HapticTarget
              key={bookmark.id}
              className="flex"
              overlayClassName="touch-pan-y"
              keepsScroll
            >
              <button
                className="flex w-full cursor-pointer items-center gap-xs rounded-md border border-hairline-soft bg-canvas p-sm text-left outline-none group-active:bg-surface-strong hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-strong"
                type="button"
                onClick={() => onSelect(bookmark.id)}
              >
                {bookmark.thumbnail && (
                  <QuoteThumbnailTile className="size-10" thumbnail={bookmark.thumbnail} />
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-2xs">
                  <span className="truncate text-body-sm text-ink">{toReplySummary(bookmark)}</span>
                  <span className="truncate text-caption text-meta">
                    {formatMonthDay(idToDate(bookmark.id))} {formatTime(idToDate(bookmark.id))} ·{" "}
                    {nameById.get(bookmark.senderId) ?? ""}
                  </span>
                </span>
              </button>
            </HapticTarget>
          ))}
        </div>
      )}
    </ExpandableSheet>
  );
}
