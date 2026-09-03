"use client";

import type { MessageBookmark } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { MAX_BOOKMARK_NAME_LENGTH, toReplySummary } from "@/shared/config";
import { formatMonthDay, formatTime, idToDate, type MessageId } from "@/shared/lib";
import {
  Button,
  EmptyState,
  ExpandableSheet,
  HapticTarget,
  HeaderTextButton,
  Input,
  Modal,
  QuoteThumbnailTile,
  type ExpandableSheetHandle,
} from "@/shared/ui";
import { Bookmark } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

export type MessageBookmarkSheetProps = {
  className?: string;
  isOpen: boolean;
  bookmarks: MessageBookmark[];
  participants: Participant[];
  onClose: () => void;
  onSelect: (id: MessageId) => void;
  onRemove: (id: MessageId) => Promise<boolean>;
  onRename: (id: MessageId, name: string) => Promise<boolean>;
  onRemoveAll: () => Promise<boolean>;
};

function toDisplayLine(bookmark: MessageBookmark): string {
  return bookmark.name ?? toReplySummary(bookmark);
}

/** REQUIREMENTS.md § 8.19. The reader's own 책갈피 list — the § 8.18. sheet shell, now shared. */
export function MessageBookmarkSheet({
  className,
  isOpen,
  bookmarks,
  participants,
  onClose,
  onSelect,
  onRemove,
  onRename,
  onRemoveAll,
}: MessageBookmarkSheetProps) {
  const sheetRef = useRef<ExpandableSheetHandle>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [renaming, setRenaming] = useState<MessageBookmark | null>(null);
  const [isConfirmingRemoveAll, setIsConfirmingRemoveAll] = useState(false);

  const nameById = new Map(participants.map((participant) => [participant.id, participant.name]));

  const title = isEditing
    ? "책갈피 편집"
    : bookmarks.length > 0
      ? `책갈피 ${bookmarks.length}`
      : "책갈피";

  function handleClose() {
    setIsEditing(false);
    onClose();
  }

  function handleEdit() {
    setIsEditing(true);
    sheetRef.current?.expand();
  }

  // INFO: § 8.19. 편집 mode has nothing left to edit once the list empties.
  async function handleRemove(id: MessageId) {
    if ((await onRemove(id)) && bookmarks.length <= 1) {
      setIsEditing(false);
    }
  }

  async function handleRemoveAll() {
    setIsConfirmingRemoveAll(false);
    await onRemoveAll();
    setIsEditing(false);
  }

  return (
    <>
      <ExpandableSheet
        ref={sheetRef}
        className={className}
        isOpen={isOpen}
        header={{
          title,
          action:
            bookmarks.length > 0 ? (
              <HeaderTextButton
                haptic
                onClick={() => (isEditing ? setIsEditing(false) : handleEdit())}
              >
                {isEditing ? "완료" : "편집"}
              </HeaderTextButton>
            ) : undefined,
        }}
        footer={
          isEditing ? (
            <Button variant="destructive" haptic onClick={() => setIsConfirmingRemoveAll(true)}>
              전체 해제
            </Button>
          ) : undefined
        }
        onClose={handleClose}
      >
        {bookmarks.length === 0 ? (
          <EmptyState className="mt-2xl" Icon={Bookmark} description="책갈피한 메시지가 없어요" />
        ) : (
          <div className="scrollbar-hidden flex min-h-0 flex-1 flex-col gap-2xs overflow-y-auto overscroll-contain pb-md">
            {bookmarks.map((bookmark) => (
              <div key={bookmark.id} className="flex items-center gap-xs">
                {isEditing ? (
                  <div className="flex w-full min-w-0 items-center gap-xs rounded-md border border-hairline-soft bg-canvas p-sm">
                    {bookmark.thumbnail && (
                      <QuoteThumbnailTile className="size-10" thumbnail={bookmark.thumbnail} />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-2xs">
                      <span className="truncate text-body-sm text-ink">
                        {toDisplayLine(bookmark)}
                      </span>
                      <span className="truncate text-caption text-meta">
                        {formatMonthDay(idToDate(bookmark.id))} {formatTime(idToDate(bookmark.id))}{" "}
                        · {nameById.get(bookmark.senderId) ?? ""}
                      </span>
                    </span>
                    <div className="flex shrink-0 items-center gap-2xs">
                      <Button
                        className="w-auto"
                        buttonClassName="min-h-9 px-sm text-button-sm"
                        variant="secondary"
                        haptic
                        onClick={() => setRenaming(bookmark)}
                      >
                        수정
                      </Button>
                      <Button
                        className="w-auto"
                        buttonClassName="min-h-9 px-sm text-button-sm"
                        variant="secondary"
                        haptic
                        onClick={() => void handleRemove(bookmark.id)}
                      >
                        해제
                      </Button>
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
                          {formatMonthDay(idToDate(bookmark.id))}{" "}
                          {formatTime(idToDate(bookmark.id))} ·{" "}
                          {nameById.get(bookmark.senderId) ?? ""}
                        </span>
                      </span>
                    </button>
                  </HapticTarget>
                )}
              </div>
            ))}
          </div>
        )}
      </ExpandableSheet>

      <Modal
        isOpen={isConfirmingRemoveAll}
        header={{ title: "책갈피를 모두 해제할까요?" }}
        onClose={() => setIsConfirmingRemoveAll(false)}
      >
        <div className="flex gap-xs">
          <Button
            className="flex-1"
            variant="secondary"
            onClick={() => setIsConfirmingRemoveAll(false)}
          >
            취소
          </Button>
          <Button className="flex-1" variant="destructive" onClick={() => void handleRemoveAll()}>
            전체 해제
          </Button>
        </div>
      </Modal>

      <RenameBookmarkModal
        key={renaming?.id ?? "none"}
        bookmark={renaming}
        onClose={() => setRenaming(null)}
        onRename={onRename}
      />
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
    <Modal
      isOpen={bookmark !== null}
      size="sm"
      header={{ title: "책갈피 이름 수정", description: "책갈피에 지정할 이름을 입력해 주세요." }}
      onClose={onClose}
    >
      <div className="flex flex-col gap-md">
        <Input
          value={value}
          maxLength={MAX_BOOKMARK_NAME_LENGTH}
          autoFocus
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
            확인
          </Button>
        </div>
      </div>
    </Modal>
  );
}
