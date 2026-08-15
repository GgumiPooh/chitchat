"use client";

import type { EmoticonPackSummary } from "@/entities/emoticon";
import { CreatePackSheet, RenamePackSheet, deleteEmoticonPack } from "@/features/author-emoticon";
import {
  EmoticonPackBrowser,
  EmoticonPackManager,
  saveEmoticonPackEnabled,
} from "@/features/emoticon-prefs";
import { EMOTICON_IMPORT_ROUTE, EMOTICON_SETTINGS_ROUTE, SETTINGS_ROUTE } from "@/shared/config";
import { cn, useBfcacheRestore, type EmoticonPackId, type Nullable } from "@/shared/lib";
import { OFFLINE_MESSAGES, OfflineStaleNotice, useOfflineGate } from "@/shared/offline-ux";
import { ActionSheet, AppHeader, Button, IconButton, Modal, toast } from "@/shared/ui";
import { josa } from "es-hangul";
import { ChevronLeft, EyeOff, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { EmoticonSettingsTabs, type EmoticonSettingsTab } from "./emoticon-settings-tabs";

// INFO: Module scope, as `ScrollMemory`'s map — opening a pack and coming back is a client navigation, so the tab outlives it, while a reload still opens on 사용중 (REQUIREMENTS.md § 13.5.).
let lastTab: EmoticonSettingsTab = "using";

export type EmoticonSettingsPageProps = {
  className?: string;
  /** REQUIREMENTS.md § 13.5. The 사용중 tab's whole list — enabled only, which is what keeps it small enough to drag. */
  packs: EmoticonPackSummary[];
};

/**
 * REQUIREMENTS.md § 13.5. The KakaoTalk 이모티콘 관리 screen, in two tabs — 사용중,
 * which the user orders, and 이모티콘 묶음 검색, which is the library.
 *
 * INFO: The split is what dissolves a conflict rather than a taste in navigation: a
 * library holds ten thousand packs and a user enables thirty, and the list that has to
 * be windowed is exactly the one `SortableContext` cannot be given whole.
 *
 * INFO: Rename and delete live here rather than on the pack's own screen, where
 * delete sat one thumb-width from 이모티콘 추가 (§ 13.4.).
 */
export function EmoticonSettingsPage({ className, packs }: EmoticonSettingsPageProps) {
  const [tab, setTab] = useState(lastTab);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [known, setKnown] = useState(packs);
  const [seeded, setSeeded] = useState(packs);
  const [managedId, setManagedId] = useState<Nullable<EmoticonPackId>>(null);
  const [renamingId, setRenamingId] = useState<Nullable<EmoticonPackId>>(null);
  const [hidingId, setHidingId] = useState<Nullable<EmoticonPackId>>(null);
  const [deletingId, setDeletingId] = useState<Nullable<EmoticonPackId>>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  // INFO: § 13.5. A switch thrown on the other tab is a write this list was seeded before — the seed is re-read on the way back rather than on every toggle.
  const hasStaleSeedRef = useRef(false);
  const router = useRouter();
  const managed = known.find((pack) => pack.id === managedId);
  const renaming = known.find((pack) => pack.id === renamingId) ?? null;
  const deleting = known.find((pack) => pack.id === deletingId);

  // WARN: § 13.7. `router.refresh()` alone would change nothing — `known` is seeded from `packs` once and every edit since has been its own, so a screen returning from the import would re-render against state it never re-read.
  if (seeded !== packs) {
    setSeeded(packs);
    setKnown(packs);
  }

  // INFO: § 13.7. Returning from URL로 추가 is a bfcache restore, so the list comes back exactly as it was left — one import older than the packs it is drawing.
  useBfcacheRestore(router.refresh);

  // INFO: § 13.5. The header opens 직접 만들기 and URL로 추가 together, so gating it covers both rather than repeating the refusal inside the sheet.
  const createGate = useOfflineGate(OFFLINE_MESSAGES.create);
  const renameGate = useOfflineGate(OFFLINE_MESSAGES.change);
  const hideGate = useOfflineGate(OFFLINE_MESSAGES.hide);
  const deleteGate = useOfflineGate(OFFLINE_MESSAGES.remove);

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
            aria-label="새 이모티콘 묶음"
            {...createGate.blockedProps}
            onClick={createGate.guard(() => setIsAddMenuOpen(true))}
          />
        }
      />
      {/* INFO: DESIGN.md § 7.12. The header floats over the content, so a screen that starts at the top clears it itself. */}
      <div className="pt-(--app-header-inset)">
        <OfflineStaleNotice />
        <EmoticonSettingsTabs className="mx-md mb-xs" tab={tab} onTabChange={changeTab} />
        {tab === "using" ? (
          // WARN: This list is the single source of truth for the order. `EmoticonPackManager` holds none of its own, so a rename or a delete here cannot roll back a drag it has already persisted.
          <EmoticonPackManager
            packs={known}
            hidingId={hidingId}
            onOpenPack={openPack}
            onManagePack={setManagedId}
            onPackHidden={commitHide}
            onPacksChange={setKnown}
          />
        ) : (
          <EmoticonPackBrowser
            onEnabledChange={() => {
              hasStaleSeedRef.current = true;
            }}
            onOpenPack={openPack}
          />
        )}
      </div>
      {/* INFO: REQUIREMENTS.md § 13.5. Two ways to make a pack — name one and fill it by hand, or hand it off to jandh-emoticons, which imports one whole. */}
      <ActionSheet
        isOpen={isAddMenuOpen}
        header={{ title: "이모티콘 묶음 추가" }}
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
      {/* WARN: § 13.5. No 수정 among these. Tapping the row already opens the pack, and two controls called 수정 on one row cannot be told apart. */}
      <ActionSheet
        isOpen={managed !== undefined}
        header={{ title: managed?.name ?? "" }}
        items={[
          {
            label: "이름 바꾸기",
            Icon: Pencil,
            onSelect: renameGate.guard(() => setRenamingId(managedId)),
          },
          { label: "숨기기", Icon: EyeOff, onSelect: hideGate.guard(() => hidePack(managedId)) },
          {
            label: "이모티콘 묶음 삭제",
            Icon: Trash2,
            variant: "destructive",
            onSelect: deleteGate.guard(() => setDeletingId(managedId)),
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
      {/* INFO: § 13.5. 삭제 is the one that asks, and 숨기기 beside it is why it can afford to — hiding destroys nothing and offers 실행 취소, where this takes the pack from the other user as well. */}
      <Modal
        isOpen={deleting !== undefined}
        header={{
          title: deleting ? `${josa(deleting.name, "을/를")} 삭제할까요?` : "",
          description: "이모티콘 묶음과 그 안의 이모티콘이 모두 사라져요",
        }}
        onClose={() => setDeletingId(null)}
      >
        {/* WARN: `flex-1` on both — `Button` is `w-full shrink-0`, so a bare pair in a row would push the second one off the modal. */}
        <div className="flex gap-xs">
          <Button className="flex-1" variant="secondary" onClick={() => setDeletingId(null)}>
            취소
          </Button>
          <Button
            className="flex-1"
            variant="destructive"
            disabled={isRemoving}
            haptic
            onClick={() => void removePack(deletingId)}
          >
            삭제
          </Button>
        </div>
      </Modal>
    </div>
  );

  function openPack(packId: EmoticonPackId) {
    router.push(`${EMOTICON_SETTINGS_ROUTE}/${packId}`);
  }

  // INFO: § 13.5. The seed is re-read on the way back to 사용중, so a pack enabled on the other tab is in the list — and in its own remembered place, since `enabled` was written and `position` was not.
  function changeTab(next: EmoticonSettingsTab) {
    lastTab = next;
    setTab(next);

    if (next === "using" && hasStaleSeedRef.current) {
      hasStaleSeedRef.current = false;
      router.refresh();
    }
  }

  /**
   * WARN: A document navigation, not `router.push`. The import screen belongs to
   * jandh-emoticons, served from this origin as a multi-zone — same origin, but a
   * route this app's tree does not contain, so the client router would ask for an
   * RSC payload that does not exist.
   */
  function openImport() {
    window.location.assign(EMOTICON_IMPORT_ROUTE);
  }

  function handleRenamed(packId: EmoticonPackId, name: string) {
    setKnown((current) => current.map((pack) => (pack.id === packId ? { ...pack, name } : pack)));
  }

  /**
   * REQUIREMENTS.md § 13.5. Hides the pack from this user's picker, and nothing else:
   * the pack, its items and the other user are all untouched, which is why there is no
   * confirmation in front of it and an 실행 취소 behind it instead.
   *
   * WARN: `enabled` is written and `position` is not, so the undo needs no order of its
   * own — the row goes back exactly where it was.
   */
  function hidePack(packId: Nullable<EmoticonPackId>) {
    const index = known.findIndex((pack) => pack.id === packId);
    const pack = known[index];

    if (!pack) {
      return;
    }

    setHidingId(pack.id);
    // INFO: AGENTS.md § 0.4. A pack name is arbitrary user text and may end in a Latin letter or a digit, so the particle is chosen rather than written into the sentence.
    toast(`${josa(pack.name, "을/를")} 숨겼어요`, {
      action: { label: "실행 취소", onClick: () => void undoHide(pack, index) },
      actionButtonStyle: {
        background: "var(--color-primary)",
        color: "var(--color-on-primary)",
      },
    });

    void saveEmoticonPackEnabled(pack.id, false).catch(() => {
      restorePack(pack, index);
      toast.error("숨기지 못했어요");
    });
  }

  // WARN: The row is dropped only when its collapse lands, and both writes are one update — clearing `hidingId` on its own would expand the row again for a frame before the filter reached it.
  function commitHide(packId: EmoticonPackId) {
    setHidingId(null);
    setKnown((current) => current.filter((pack) => pack.id !== packId));
  }

  async function undoHide(pack: EmoticonPackSummary, index: number) {
    restorePack(pack, index);

    try {
      await saveEmoticonPackEnabled(pack.id, true);
    } catch {
      setKnown((current) => current.filter((row) => row.id !== pack.id));
      toast.error("다시 표시하지 못했어요");
    }
  }

  /**
   * WARN: Written to answer both callers — the undo, where the row has usually gone
   * already, and the failed write, where it is usually still collapsing. Each state
   * update tests what it is about to change rather than assuming which of the two it
   * is serving.
   */
  function restorePack(pack: EmoticonPackSummary, index: number) {
    setHidingId((current) => (current === pack.id ? null : current));
    setKnown((current) =>
      current.some((row) => row.id === pack.id)
        ? current
        : [...current.slice(0, index), { ...pack, isEnabled: true }, ...current.slice(index)],
    );
  }

  async function removePack(packId: Nullable<EmoticonPackId>) {
    if (!packId) {
      return;
    }

    setIsRemoving(true);

    try {
      await deleteEmoticonPack(packId);
      setKnown((current) => current.filter((pack) => pack.id !== packId));
      setDeletingId(null);
    } catch (error) {
      toast.error(toDeleteMessage(error));
    } finally {
      setIsRemoving(false);
    }
  }
}

// INFO: § 13.6. A pack whose items have been sent answers 409 — the user needs to be told which of the two rules stopped them, not that something failed.
function toDeleteMessage(error: unknown): string {
  return error instanceof Error && error.message === "409"
    ? "이미 대화에서 보낸 이모티콘이 있어 삭제할 수 없어요"
    : "삭제하지 못했어요";
}
