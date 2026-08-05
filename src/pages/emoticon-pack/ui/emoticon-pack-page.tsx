"use client";

import type { EmoticonPackWithItems } from "@/entities/emoticon";
import {
  EmoticonFormSheet,
  EmoticonItemGrid,
  deleteEmoticon,
  updateEmoticonPack,
} from "@/features/author-emoticon";
import { EMOTICON_SETTINGS_ROUTE } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { ActionSheet, AppHeader, EmptyState, IconButton, toast } from "@/shared/ui";
import { ChevronLeft, Plus, Smile, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type EmoticonPackPageProps = {
  className?: string;
  pack: EmoticonPackWithItems;
};

/**
 * REQUIREMENTS.md § 13.4. The pack's own screen: add items, choose which one is
 * the tab icon, delete.
 *
 * INFO: § 13.1. Every control here is available to both participants — a pack
 * belongs to the conversation, so there is no `created_by` branch anywhere.
 */
export function EmoticonPackPage({ className, pack }: EmoticonPackPageProps) {
  const [items, setItems] = useState(pack.items);
  const [thumbnailItemId, setThumbnailItemId] = useState(pack.thumbnailItemId);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<Nullable<string>>(null);
  const router = useRouter();
  const selected = items.find((item) => item.id === selectedId);

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader
        title={pack.name}
        leading={
          <IconButton
            variant="floating"
            Icon={ChevronLeft}
            aria-label="뒤로"
            onClick={() => router.push(EMOTICON_SETTINGS_ROUTE)}
          />
        }
        trailing={
          <IconButton
            variant="floating"
            Icon={Plus}
            aria-label="이모티콘 추가"
            onClick={() => setIsAdding(true)}
          />
        }
      />
      {/* INFO: DESIGN.md § 7.12. The header floats over the content, so a screen that starts at the top clears it itself. */}
      <div className="flex-1 p-md pt-[calc(var(--app-header-inset)+var(--spacing-md))]">
        {items.length === 0 ? (
          <EmptyState Icon={Smile} description="아직 이모티콘이 없어요" />
        ) : (
          <EmoticonItemGrid
            packId={pack.id}
            items={items}
            thumbnailItemId={thumbnailItemId}
            onSelect={setSelectedId}
            onReorder={setItems}
          />
        )}
      </div>
      <EmoticonFormSheet
        packId={pack.id}
        isOpen={isAdding}
        onClose={() => setIsAdding(false)}
        onCreated={(emoticon) => setItems((current) => [...current, emoticon])}
      />
      <ActionSheet
        isOpen={selected !== undefined}
        header={{ title: "이모티콘" }}
        items={[
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
    </div>
  );

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
