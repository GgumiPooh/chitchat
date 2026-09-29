"use client";

import type { MessageBookmark } from "@/entities/message";
import type { Participant } from "@/entities/user";
import type { MessageId } from "@/shared/lib";
import {
  Button,
  ExpandableSheet,
  HeaderTextButton,
  Modal,
  type ExpandableSheetHandle,
} from "@/shared/ui";
import { useRef, useState } from "react";
import { MessageBookmarkList } from "./message-bookmark-list";

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
  const [isConfirmingRemoveAll, setIsConfirmingRemoveAll] = useState(false);

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
                variant="plain"
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
        <MessageBookmarkList
          className="pb-md"
          bookmarks={bookmarks}
          participants={participants}
          isEditing={isEditing}
          onSelect={onSelect}
          onRemove={onRemove}
          onRename={onRename}
          onStopEditing={() => setIsEditing(false)}
        />
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
    </>
  );
}
