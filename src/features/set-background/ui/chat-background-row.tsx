"use client";

import type { MediaDraft } from "@/entities/media";
import { updateProfile } from "@/features/update-profile/@x/set-background";
import {
  MediaEditor,
  MediaPickerSheet,
  uploadDraft,
} from "@/features/upload-media/@x/set-background";
import { BACKGROUND_MAX_EDGE, toMediaUrl } from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import { ActionSheet, PreloadImage, SettingsRow, toast } from "@/shared/ui";
import { Image as ImageIcon, Trash2, Wallpaper } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePickedPhoto } from "../model/use-picked-photo";

export type ChatBackgroundRowProps = {
  className?: string;
  chatBackgroundMediaId: Nullable<string>;
};

/**
 * REQUIREMENTS.md § 12.2. The chat wallpaper — a Settings row of its own rather than
 * a slot in 프로필 편집, because it is drawn on this user's screen alone and putting
 * it in the sheet named 프로필 would say the other participant can see it.
 *
 * INFO: Per account, like the 입력 중 switch above it and unlike the push toggle —
 * it is a `users` column, so it follows this person to whatever device they open the
 * conversation on.
 */
export function ChatBackgroundRow({ className, chatBackgroundMediaId }: ChatBackgroundRowProps) {
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const photo = usePickedPhoto();
  const router = useRouter();

  return (
    <>
      <SettingsRow
        className={className}
        label="채팅방 배경"
        Icon={Wallpaper}
        haptic
        // INFO: The row is the only surface still on screen while a photo is read and uploaded — the picker closed itself at the tap and the editor comes down at 완료 — so it says so rather than sitting unchanged for several seconds.
        description={toDescription()}
        trailing={
          chatBackgroundMediaId && (
            <PreloadImage
              className="size-11 overflow-hidden rounded-sm"
              imgClassName="size-full object-cover"
              src={toMediaUrl(chatBackgroundMediaId)}
              alt=""
            />
          )
        }
        onClick={() => setIsActionsOpen(true)}
      />
      <ActionSheet
        isOpen={isActionsOpen && !isBusy}
        header={{ title: "채팅방 배경" }}
        items={[
          { label: "사진 고르기", Icon: ImageIcon, onSelect: () => setIsPickerOpen(true) },
          ...(chatBackgroundMediaId
            ? [
                {
                  label: "기본 배경으로",
                  Icon: Trash2,
                  variant: "destructive" as const,
                  onSelect: () => void reset(),
                },
              ]
            : []),
        ]}
        onClose={() => setIsActionsOpen(false)}
      />
      <MediaPickerSheet
        accept="image/*"
        isOpen={isPickerOpen && photo.cropping === null}
        isMultiple={false}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(files) => files[0] && void photo.read(files[0])}
      />
      {photo.cropping && (
        // WARN: Keyed by the draft — `MediaEditor` mints its source object URL once per mount, so re-cropping a replaced photo has to be a second mount.
        <MediaEditor
          key={photo.cropping.id}
          draft={photo.cropping}
          editOptions={{ maxEdge: BACKGROUND_MAX_EDGE }}
          // INFO: REQUIREMENTS.md § 12.2. Free-form. The wallpaper is drawn `object-cover` against whatever the visual viewport is, so a fixed ratio here would only crop it twice.
          onDone={(edited) => {
            photo.commit(edited);
            void upload(edited);
          }}
          onCancel={photo.cancel}
        />
      )}
    </>
  );

  function toDescription(): string {
    if (photo.isReading) {
      return "읽는 중이에요";
    }

    if (isBusy) {
      return "배경으로 설정하는 중이에요";
    }

    return chatBackgroundMediaId ? "설정한 사진이 대화 뒤에 깔려요" : "기본 배경을 쓰고 있어요";
  }

  async function upload(draft: MediaDraft) {
    setIsBusy(true);
    // WARN: Here and not in the `finally` below. `commit` clears `cropping` in the same batch, and this sheet is open on `isPickerOpen && photo.cropping === null` — left set, the picker would spring back open for the length of the upload.
    setIsPickerOpen(false);

    try {
      const media = await uploadDraft(draft, { scope: "background" });

      await save(media.id);
    } catch {
      toast.error("배경을 저장하지 못했어요");
    } finally {
      setIsBusy(false);
      photo.reset();
    }
  }

  // WARN: Its own `try`, and not a thinner wrapper than `upload`'s. This is the only other caller of `save`, and reached bare it left a failed reset as an unhandled rejection — no toast, the row still showing the old thumbnail, and the user believing it landed.
  async function reset() {
    setIsBusy(true);

    try {
      await save(null);
    } catch {
      toast.error("배경을 저장하지 못했어요");
    } finally {
      setIsBusy(false);
    }
  }

  async function save(mediaId: Nullable<string>) {
    await updateProfile({ chatBackgroundMediaId: mediaId });
    // INFO: The chat screen reads this column from its own Server Component render (§ 12.2.), so the saved row has to reach it the way § 12.'s profile save does.
    router.refresh();
    setIsActionsOpen(false);
    toast.success(mediaId ? "채팅방 배경을 바꿨어요" : "기본 배경으로 되돌렸어요");
  }
}
