"use client";

import type { Emoticon, EmoticonPackWithItems } from "@/entities/emoticon";
import {
  EmoticonFormSheet,
  EmoticonItemGrid,
  addEmoticonsFromFiles,
  deleteEmoticon,
  updateEmoticonPack,
  type BulkAddFailure,
} from "@/features/author-emoticon";
import { MediaPickerSheet } from "@/features/upload-media";
import { EMOTICON_SETTINGS_ROUTE } from "@/shared/config";
import { cn, useUnsentWork, type Maybe, type Nullable } from "@/shared/lib";
import { ActionSheet, AppHeader, EmptyState, IconButton, Modal, toast } from "@/shared/ui";
import { ChevronLeft, Images, Pencil, Plus, Smile, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type EmoticonPackPageProps = {
  className?: string;
  pack: EmoticonPackWithItems;
};

/**
 * REQUIREMENTS.md § 13.4. The pack's own screen: add items — one at a time or a
 * whole pile at once — edit one, choose which is the tab icon, delete.
 *
 * INFO: § 13.1. Every control here is available to both participants — a pack
 * belongs to the conversation, so there is no `created_by` branch anywhere.
 */
export function EmoticonPackPage({ className, pack }: EmoticonPackPageProps) {
  const [items, setItems] = useState(pack.items);
  const [thumbnailItemId, setThumbnailItemId] = useState(pack.thumbnailItemId);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<Nullable<File>>(null);
  const [editing, setEditing] = useState<Nullable<Emoticon>>(null);
  const [addingCount, setAddingCount] = useState(0);
  const [failures, setFailures] = useState<BulkAddFailure[]>([]);
  const [selectedId, setSelectedId] = useState<Nullable<string>>(null);
  const router = useRouter();
  const selected = items.find((item) => item.id === selectedId);

  // INFO: REQUIREMENTS.md § 15.1. A bulk add is work a deploy-forced reload would cut in half, and unlike a draft message nothing on screen would survive to resume it.
  useUnsentWork(addingCount > 0);

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader
        title={pack.name}
        leading={
          <IconButton
            variant="floating"
            Icon={ChevronLeft}
            haptic
            aria-label="뒤로"
            onClick={() => router.push(EMOTICON_SETTINGS_ROUTE)}
          />
        }
        trailing={
          // WARN: § 13.4. Closed for as long as a pile is landing, and it is the only way into `addMany` — a second batch would run its own registration chain, interleaving two picks in one `sort_order` sequence, and `setAddingCount(files.length)` is an absolute write that the overlap would corrupt.
          <IconButton
            variant="floating"
            Icon={Plus}
            haptic
            disabled={addingCount > 0}
            aria-label="이모티콘 추가"
            onClick={() => setIsAddMenuOpen(true)}
          />
        }
      />
      {/* INFO: DESIGN.md § 7.12. The header floats over the content, so a screen that starts at the top clears it itself. */}
      <div className="flex-1 p-md pt-[calc(var(--app-header-inset)+var(--spacing-md))]">
        {items.length === 0 && addingCount === 0 ? (
          <EmptyState Icon={Smile} description="아직 이모티콘이 없어요" />
        ) : (
          <div className="space-y-sm">
            <EmoticonItemGrid
              items={items}
              thumbnailItemId={thumbnailItemId}
              onSelect={setSelectedId}
            />
            {addingCount > 0 && (
              <p className="text-center text-body-sm text-meta">
                {addingCount}개를 더 올리는 중이에요
              </p>
            )}
          </div>
        )}
      </div>
      {/* INFO: § 13.4. Two ways in: the authoring sheet, where one item gets a crop and a sound, or a pile of images that skips both. */}
      <ActionSheet
        isOpen={isAddMenuOpen}
        header={{ title: "이모티콘 추가" }}
        items={[
          { label: "하나씩 추가", Icon: Plus, onSelect: () => setIsFormOpen(true) },
          { label: "여러 장 한 번에 추가", Icon: Images, onSelect: () => setIsPickerOpen(true) },
        ]}
        onClose={() => setIsAddMenuOpen(false)}
      />
      <MediaPickerSheet
        accept="image/*"
        isOpen={isPickerOpen}
        isMultiple
        onClose={() => setIsPickerOpen(false)}
        onSelect={handlePick}
      />
      <EmoticonFormSheet
        packId={pack.id}
        isOpen={isFormOpen}
        emoticon={editing}
        initialFile={pendingFile}
        onClose={closeForm}
        onSaved={handleSaved}
      />
      <ActionSheet
        isOpen={selected !== undefined}
        header={{ title: "이모티콘" }}
        items={[
          {
            label: "수정",
            Icon: Pencil,
            onSelect: () => openEditor(selected),
          },
          {
            label: "대표 이미지로 지정",
            Icon: Smile,
            onSelect: () => void setThumbnail(selectedId),
          },
          {
            label: "삭제",
            Icon: Trash2,
            variant: "destructive",
            onSelect: () => void removeItem(selectedId),
          },
        ]}
        onClose={() => setSelectedId(null)}
      />
      <Modal
        isOpen={failures.length > 0}
        header={{
          title: "추가하지 못한 이모티콘",
          description: `${failures.length}개를 추가하지 못했어요`,
        }}
        onClose={() => setFailures([])}
      >
        {/* INFO: Scrolls at a fixed height — a pick of forty images can fail forty times, and the modal must not grow past the shell. */}
        <ul className="max-h-[40vh] space-y-2xs overflow-y-auto">
          {failures.map((failure, index) => (
            <li
              key={`${failure.fileName}-${index}`}
              className="rounded-sm bg-surface-soft px-sm py-xs"
            >
              <p className="truncate text-body-sm text-ink">{failure.fileName}</p>
              <p className="text-body-sm text-meta">{failure.reason}</p>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );

  // INFO: A single file from the bulk picker still opens the authoring sheet — one image is one item either way, and there it can be cropped and given a sound.
  function handlePick(files: File[]) {
    const [first, ...rest] = files;

    setIsPickerOpen(false);

    if (!first) {
      return;
    }

    if (rest.length === 0) {
      setPendingFile(first);
      setIsFormOpen(true);

      return;
    }

    void addMany(files);
  }

  // INFO: § 13.4. The grid fills in as each item lands rather than after the last one, so a pile of twenty is visibly progressing.
  async function addMany(files: File[]) {
    setAddingCount(files.length);

    try {
      // WARN: The count is what is *left*, not what was picked — it is rendered beside a grid that is already filling in, so a fixed total would contradict the rows next to it.
      const { failed } = await addEmoticonsFromFiles(pack.id, files, {
        onAdded: (emoticon) => setItems((current) => [...current, emoticon]),
        onSettled: () => setAddingCount((current) => Math.max(current - 1, 0)),
      });

      // INFO: § 13.4. A modal rather than a toast — a bulk add fails per file and for different reasons, and a count alone leaves the user re-picking twenty images to find the three that did not land.
      setFailures(failed);
    } catch {
      toast.error("이모티콘을 추가하지 못했어요");
    } finally {
      // WARN: In `finally`, or a rejection would strand the count above zero — which disables the `+` for the life of the screen and pins § 15.1.'s reload open with it.
      setAddingCount(0);
    }
  }

  function openEditor(item: Maybe<Emoticon>) {
    setSelectedId(null);
    setEditing(item ?? null);
    setIsFormOpen(item != null);
  }

  function closeForm() {
    setIsFormOpen(false);
    setPendingFile(null);
    setEditing(null);
  }

  function handleSaved(emoticon: Emoticon) {
    setItems((current) =>
      current.some((item) => item.id === emoticon.id)
        ? current.map((item) => (item.id === emoticon.id ? emoticon : item))
        : [...current, emoticon],
    );
  }

  async function setThumbnail(itemId: Nullable<string>) {
    if (!itemId) {
      return;
    }

    const previous = thumbnailItemId;

    setThumbnailItemId(itemId);
    setSelectedId(null);

    try {
      await updateEmoticonPack(pack.id, { thumbnailItemId: itemId });
    } catch {
      setThumbnailItemId(previous);
      toast.error("대표 이미지를 바꾸지 못했어요");
    }
  }

  async function removeItem(itemId: Nullable<string>) {
    if (!itemId) {
      return;
    }

    setSelectedId(null);

    try {
      await deleteEmoticon(itemId);
      setItems((current) => current.filter((item) => item.id !== itemId));

      // INFO: REQUIREMENTS.md § 13.2. The FK is `ON DELETE SET NULL`, so the server has already cleared this — mirroring it keeps the highlight from pointing at a row that is gone.
      if (itemId === thumbnailItemId) {
        setThumbnailItemId(null);
      }
    } catch (error) {
      toast.error(toDeleteMessage(error));
    }
  }
}

// INFO: § 13.6. An item already sent answers 409 — the user needs to be told why rather than shown a generic failure.
function toDeleteMessage(error: unknown): string {
  return error instanceof Error && error.message === "409"
    ? "이미 대화에서 보낸 이모티콘은 삭제할 수 없어요"
    : "삭제하지 못했어요";
}
