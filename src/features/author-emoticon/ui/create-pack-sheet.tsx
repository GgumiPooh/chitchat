"use client";

import type { EmoticonPackSummary } from "@/entities/emoticon";
import { MAX_EMOTICON_PACK_NAME_LENGTH } from "@/shared/config";
import { BottomSheet, Button, Input, toast } from "@/shared/ui";
import { useState } from "react";
import { createEmoticonPack } from "../api/write-emoticon";

export type CreatePackSheetProps = {
  className?: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (pack: EmoticonPackSummary) => void;
};

/**
 * REQUIREMENTS.md § 13.4. A title is the whole form. The thumbnail is deliberately
 * absent — it is one of the pack's own items (§ 13.2.), so it cannot be chosen
 * until items exist.
 */
export function CreatePackSheet({ className, isOpen, onClose, onCreated }: CreatePackSheetProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <BottomSheet
      className={className}
      isOpen={isOpen}
      header={{
        title: "새 이모티콘 묶음 추가하기",
        description: "이름만 정하면 돼요.\n이미지는 이후에 하나씩 추가할 수 있어요",
      }}
      onClose={handleClose}
    >
      <div className="space-y-sm pt-2xs">
        <Input
          value={name}
          maxLength={MAX_EMOTICON_PACK_NAME_LENGTH}
          placeholder="이모티콘 묶음 이름"
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          disabled={name.trim().length === 0 || isSubmitting}
          haptic
          onClick={() => void submit()}
        >
          만들기
        </Button>
      </div>
    </BottomSheet>
  );

  function handleClose() {
    setName("");
    onClose();
  }

  async function submit() {
    setIsSubmitting(true);

    try {
      onCreated(await createEmoticonPack(name.trim()));
      handleClose();
    } catch {
      toast.error("이모티콘 묶음을 만들지 못했어요");
    } finally {
      setIsSubmitting(false);
    }
  }
}
