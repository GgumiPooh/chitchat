"use client";

import type { EmoticonPackSummary } from "@/entities/emoticon";
import { MAX_EMOTICON_PACK_NAME_LENGTH } from "@/shared/config";
import type { EmoticonPackId, Nullable } from "@/shared/lib";
import { BottomSheet, Button, Input, toast } from "@/shared/ui";
import { useState } from "react";
import { updateEmoticonPack } from "../api/write-emoticon";

export type RenamePackSheetProps = {
  className?: string;
  /** WARN: Also the sheet's identity — the field is seeded from it, so a different pack must be a different mount (`key`). */
  pack: Nullable<EmoticonPackSummary>;
  onClose: () => void;
  onRenamed: (packId: EmoticonPackId, name: string) => void;
};

/** REQUIREMENTS.md § 13.1. Either participant may rename any pack — it belongs to the conversation. */
export function RenamePackSheet({ className, pack, onClose, onRenamed }: RenamePackSheetProps) {
  const [name, setName] = useState(pack?.name ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed !== pack?.name && !isSubmitting;

  return (
    <BottomSheet
      className={className}
      isOpen={pack !== null}
      header={{ title: "이모티콘 그룹 이름 바꾸기" }}
      onClose={onClose}
    >
      <div className="space-y-sm pt-2xs">
        <Input
          value={name}
          maxLength={MAX_EMOTICON_PACK_NAME_LENGTH}
          placeholder="이모티콘 그룹 이름"
          onChange={(event) => setName(event.target.value)}
        />
        <Button disabled={!canSubmit} haptic onClick={() => void submit()}>
          저장
        </Button>
      </div>
    </BottomSheet>
  );

  async function submit() {
    if (!pack) {
      return;
    }

    setIsSubmitting(true);

    try {
      await updateEmoticonPack(pack.id, { name: trimmed });
      onRenamed(pack.id, trimmed);
      onClose();
    } catch {
      toast.error("이름을 바꾸지 못했어요");
    } finally {
      setIsSubmitting(false);
    }
  }
}
