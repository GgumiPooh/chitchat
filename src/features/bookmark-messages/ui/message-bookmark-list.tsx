"use client";

import type { MessageBookmark } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { MAX_BOOKMARK_NAME_LENGTH, toLlmProviderName, toReplySummary } from "@/shared/config";
import { cn, formatMonthDay, formatTime, idToDate, type MessageId } from "@/shared/lib";
import { Button, EmptyState, HapticTarget, Input, Modal, QuoteThumbnailTile } from "@/shared/ui";
import { Bookmark } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

export type MessageBookmarkListProps = {
  className?: string;
  bookmarks: MessageBookmark[];
  participants: Participant[];
  isEditing?: boolean;
  onSelect: (id: MessageId) => void;
  onRemove?: (id: MessageId) => Promise<boolean>;
  onRename?: (id: MessageId, name: string) => Promise<boolean>;
  onStopEditing?: () => void;
};

function toDisplayLine(bookmark: MessageBookmark): string {
  return bookmark.name ?? toReplySummary(bookmark);
}

/**
 * REQUIREMENTS.md § 8.19. The bookmark row list, shared between the mobile
 * `MessageBookmarkSheet` and the desktop `ChatSidePanel`.
 */
export function MessageBookmarkList({
  className,
  bookmarks,
  participants,
  isEditing = false,
  onSelect,
  onRemove,
  onRename,
  onStopEditing,
}: MessageBookmarkListProps) {
  const [renaming, setRenaming] = useState<MessageBookmark | null>(null);

  const nameById = new Map(participants.map((participant) => [participant.id, participant.name]));

  // INFO: REQUIREMENTS.md § 8.10. An AI answer carries the asker's `senderId`, so the row names the model the way a quote heading does, never the asker.
  function toSenderName(bookmark: MessageBookmark): string {
    return bookmark.llmProvider
      ? toLlmProviderName(bookmark.llmProvider)
      : (nameById.get(bookmark.senderId) ?? "");
  }

  async function handleRemove(id: MessageId) {
    if (!onRemove) {
      return;
    }

    if ((await onRemove(id)) && bookmarks.length <= 1) {
      onStopEditing?.();
    }
  }

  if (bookmarks.length === 0) {
    return (
      <div className={cn("flex flex-1 items-center justify-center p-md", className)}>
        <EmptyState Icon={Bookmark} description="책갈피한 메시지가 없어요" />
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "scrollbar-hidden flex min-h-0 flex-1 flex-col gap-2xs overflow-y-auto overscroll-contain",
          className,
        )}
      >
        {bookmarks.map((bookmark) => (
          <div key={bookmark.id} className="flex items-center gap-xs">
            {isEditing ? (
              <div className="flex w-full min-w-0 items-center gap-xs rounded-md border border-hairline-soft bg-canvas p-sm">
                {bookmark.thumbnail && (
                  <QuoteThumbnailTile className="size-10" thumbnail={bookmark.thumbnail} />
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-2xs">
                  <span className="truncate text-body-sm text-ink">{toDisplayLine(bookmark)}</span>
                  <span className="truncate text-caption text-meta">
                    {formatMonthDay(idToDate(bookmark.id))} {formatTime(idToDate(bookmark.id))} ·{" "}
                    {toSenderName(bookmark)}
                  </span>
                </span>
                <div className="flex shrink-0 items-center gap-2xs">
                  {onRename && (
                    <Button
                      className="w-auto"
                      buttonClassName="min-h-9 px-sm text-button-sm"
                      variant="secondary"
                      haptic
                      onClick={() => setRenaming(bookmark)}
                    >
                      수정
                    </Button>
                  )}
                  {onRemove && (
                    <Button
                      className="w-auto"
                      buttonClassName="min-h-9 px-sm text-button-sm"
                      variant="secondary"
                      haptic
                      onClick={() => void handleRemove(bookmark.id)}
                    >
                      해제
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <HapticTarget
                className="flex min-w-0 flex-1"
                overlayClassName="touch-pan-y"
                keepsScroll
              >
                <button
                  className="flex w-full min-w-0 cursor-pointer items-center gap-xs rounded-md border border-hairline-soft bg-canvas p-sm text-left outline-none group-active:bg-surface-strong hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-strong"
                  type="button"
                  onClick={() => onSelect(bookmark.id)}
                >
                  {bookmark.thumbnail && (
                    <QuoteThumbnailTile className="size-10" thumbnail={bookmark.thumbnail} />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-2xs">
                    <span className="truncate text-body-sm text-ink">
                      {toDisplayLine(bookmark)}
                    </span>
                    <span className="truncate text-caption text-meta">
                      {formatMonthDay(idToDate(bookmark.id))} {formatTime(idToDate(bookmark.id))} ·{" "}
                      {toSenderName(bookmark)}
                    </span>
                  </span>
                </button>
              </HapticTarget>
            )}
          </div>
        ))}
      </div>

      {onRename && (
        <RenameBookmarkModal
          key={renaming?.id ?? "none"}
          bookmark={renaming}
          onClose={() => setRenaming(null)}
          onRename={onRename}
        />
      )}
    </>
  );
}

type RenameBookmarkModalProps = {
  bookmark: MessageBookmark | null;
  onClose: () => void;
  onRename: (id: MessageId, name: string) => Promise<boolean>;
};

function RenameBookmarkModal({ bookmark, onClose, onRename }: RenameBookmarkModalProps) {
  const currentLine = bookmark ? toDisplayLine(bookmark) : "";
  const [value, setValue] = useState(currentLine);

  const trimmed = value.trim();
  const isConfirmDisabled = trimmed.length === 0 || trimmed === currentLine;

  async function handleConfirm() {
    if (!bookmark || isConfirmDisabled) {
      return;
    }

    if (await onRename(bookmark.id, trimmed)) {
      onClose();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      void handleConfirm();
    }
  }

  return (
    <Modal isOpen={bookmark !== null} header={{ title: "책갈피 이름 수정" }} onClose={onClose}>
      <div className="flex flex-col gap-md">
        <Input
          autoFocus
          maxLength={MAX_BOOKMARK_NAME_LENGTH}
          placeholder={currentLine}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="flex gap-xs">
          <Button className="flex-1" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button
            className="flex-1"
            disabled={isConfirmDisabled}
            onClick={() => void handleConfirm()}
          >
            저장
          </Button>
        </div>
      </div>
    </Modal>
  );
}
