"use client";

import type { EmoticonPackSummary } from "@/entities/emoticon";
import { CreatePackSheet, RenamePackSheet, deleteEmoticonPack } from "@/features/author-emoticon";
import { EmoticonPackManager } from "@/features/emoticon-prefs";
import { EMOTICON_SETTINGS_ROUTE, SETTINGS_ROUTE } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { ActionSheet, AppHeader, IconButton, toast } from "@/shared/ui";
import { ChevronLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type EmoticonSettingsPageProps = {
  className?: string;
  packs: EmoticonPackSummary[];
};

/**
 * REQUIREMENTS.md § 13.5. The KakaoTalk 이모티콘 관리 screen — one flat pack list,
 * per-user order and hiding, and the pack's own rename and delete.
 *
 * INFO: Rename and delete live here rather than on the pack's own screen, where
 * delete sat one thumb-width from 이모티콘 추가 (§ 13.4.).
 */
export function EmoticonSettingsPage({ className, packs }: EmoticonSettingsPageProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [known, setKnown] = useState(packs);
  const [managedId, setManagedId] = useState<Nullable<string>>(null);
  const [renamingId, setRenamingId] = useState<Nullable<string>>(null);
  const router = useRouter();
  const managed = known.find((pack) => pack.id === managedId);
  const renaming = known.find((pack) => pack.id === renamingId) ?? null;

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader
        title="이모티콘 관리"
        leading={
          <IconButton
            variant="floating"
            Icon={ChevronLeft}
            aria-label="뒤로"
            onClick={() => router.push(SETTINGS_ROUTE)}
          />
        }
        trailing={
          <IconButton
            variant="floating"
            Icon={Plus}
            aria-label="새 이모티콘 그룹"
            onClick={() => setIsCreating(true)}
          />
        }
      />
      {/* INFO: DESIGN.md § 7.12. The header floats over the content, so a screen that starts at the top clears it itself. */}
      <div className="pt-(--app-header-inset)">
        {/* WARN: This list is the single source of truth for the order. `EmoticonPackManager` holds none of its own, so a rename or a delete here cannot roll back a drag it has already persisted. */}
        <EmoticonPackManager
          packs={known}
          onOpenPack={(packId) => router.push(`${EMOTICON_SETTINGS_ROUTE}/${packId}`)}
          onManagePack={setManagedId}
          onPacksChange={setKnown}
        />
      </div>
      <CreatePackSheet
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        onCreated={(pack) => setKnown((current) => [...current, pack])}
      />
      <ActionSheet
        isOpen={managed !== undefined}
        header={{ title: managed?.name ?? "" }}
        items={[
          { label: "이름 바꾸기", Icon: Pencil, onSelect: () => setRenamingId(managedId) },
          {
            label: "이모티콘 그룹 삭제",
            Icon: Trash2,
            variant: "destructive",
            onSelect: () => void removePack(managedId),
          },
        ]}
        onClose={() => setManagedId(null)}
      />
      {/* WARN: Keyed by the pack — the sheet seeds its field from the name once, so a second pack has to be a second mount. */}
      <RenamePackSheet
        key={renaming?.id}
        pack={renaming}
        onClose={() => setRenamingId(null)}
        onRenamed={handleRenamed}
      />
    </div>
  );

  function handleRenamed(packId: string, name: string) {
    setKnown((current) => current.map((pack) => (pack.id === packId ? { ...pack, name } : pack)));
  }

  async function removePack(packId: Nullable<string>) {
    if (!packId) {
      return;
    }

    try {
      await deleteEmoticonPack(packId);
      setKnown((current) => current.filter((pack) => pack.id !== packId));
    } catch {
      toast.error("삭제하지 못했어요");
    }
  }
}
