"use client";

import type { EmoticonPackSummary } from "@/entities/emoticon";
import { CreatePackSheet, RenamePackSheet, deleteEmoticonPack } from "@/features/author-emoticon";
import { EmoticonPackManager } from "@/features/emoticon-prefs";
import { EMOTICON_IMPORT_ROUTE, EMOTICON_SETTINGS_ROUTE, SETTINGS_ROUTE } from "@/shared/config";
import { cn, markZoneDeparture, useBfcacheRestore, type Nullable } from "@/shared/lib";
import { ActionSheet, AppHeader, IconButton, toast } from "@/shared/ui";
import { ChevronLeft, Link2, Pencil, Plus, Trash2 } from "lucide-react";
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
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [known, setKnown] = useState(packs);
  const [seeded, setSeeded] = useState(packs);
  const [managedId, setManagedId] = useState<Nullable<string>>(null);
  const [renamingId, setRenamingId] = useState<Nullable<string>>(null);
  const router = useRouter();
  const managed = known.find((pack) => pack.id === managedId);
  const renaming = known.find((pack) => pack.id === renamingId) ?? null;

  // WARN: § 13.7. `router.refresh()` alone would change nothing — `known` is seeded from `packs` once and every edit since has been its own, so a screen returning from the import would re-render against state it never re-read.
  if (seeded !== packs) {
    setSeeded(packs);
    setKnown(packs);
  }

  // INFO: § 13.7. Returning from URL로 추가 is a bfcache restore, so the list comes back exactly as it was left — one import older than the packs it is drawing.
  useBfcacheRestore(router.refresh);

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader
        title="이모티콘 관리"
        leading={
          <IconButton
            variant="floating"
            Icon={ChevronLeft}
            haptic
            aria-label="뒤로"
            onClick={() => router.push(SETTINGS_ROUTE)}
          />
        }
        trailing={
          <IconButton
            variant="floating"
            Icon={Plus}
            haptic
            aria-label="새 이모티콘 그룹"
            onClick={() => setIsAddMenuOpen(true)}
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
      {/* INFO: REQUIREMENTS.md § 13.5. Two ways to make a pack — name one and fill it by hand, or hand it off to jandh-emoticons, which imports one whole. */}
      <ActionSheet
        isOpen={isAddMenuOpen}
        header={{ title: "이모티콘 그룹 추가" }}
        items={[
          { label: "직접 만들기", Icon: Plus, onSelect: () => setIsCreating(true) },
          { label: "URL로 추가", Icon: Link2, onSelect: openImport },
        ]}
        onClose={() => setIsAddMenuOpen(false)}
      />
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

  /**
   * WARN: A document navigation, not `router.push`. The import screen belongs to
   * jandh-emoticons, served from this origin as a multi-zone — same origin, but a
   * route this app's tree does not contain, so the client router would ask for an
   * RSC payload that does not exist.
   */
  function openImport() {
    // WARN: § 8.4.1. Before the navigation, not after — the assign below blurs the window, which is what takes the app dormant, and the note has to already be there for the return to be told apart from an app-switch.
    markZoneDeparture();
    window.location.assign(EMOTICON_IMPORT_ROUTE);
  }

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
