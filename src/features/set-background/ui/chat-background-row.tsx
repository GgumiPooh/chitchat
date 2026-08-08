"use client";

import type { MediaDraft } from "@/entities/media";
import { useChatStream } from "@/features/chat-stream/@x/set-background";
import {
  MediaEditor,
  MediaPickerSheet,
  uploadDraft,
} from "@/features/upload-media/@x/set-background";
import { BACKGROUND_MAX_EDGE, toMediaUrl } from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import { ActionSheet, PreloadImage, SettingsRow, toast } from "@/shared/ui";
import { Image as ImageIcon, Trash2, Wallpaper } from "lucide-react";
import { useState } from "react";
import { setChatBackground } from "../api/set-chat-background";
import { usePickedPhoto } from "../model/use-picked-photo";

export type ChatBackgroundRowProps = {
  className?: string;
};

/**
 * REQUIREMENTS.md § 12.2. The chat wallpaper — a Settings row of its own rather than
 * a slot in 프로필 편집, because it belongs to the conversation and not to a profile.
 *
 * WARN: The one control on this screen that changes what the **other** participant
 * sees, and every string here has to carry that. Nothing else in 설정 does — the
 * 입력 중 switch above it withholds a signal and the theme below it is per device —
 * so a reader has no reason to expect it, and the surprise is only ever discovered
 * from the other side.
 *
 * WARN: The id comes from the stream, not from a prop, for the reason the room's does
 * (§ 12.2.) and one sharper still. A server-rendered prop goes stale the moment the
 * other participant changes the wallpaper — and that change *deletes* the object this
 * row draws a thumbnail of, so the row would show a broken image, claim 둘 다 이
 * 사진을 보고 있어요, and offer 기본 배경으로 for a photo that no longer exists.
 */
export function ChatBackgroundRow({ className }: ChatBackgroundRowProps) {
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const { chatBackgroundMediaId } = useChatStream();
  const photo = usePickedPhoto();

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
        // INFO: REQUIREMENTS.md § 12.2. The last surface before the change lands, and the only one that can say what the change reaches. The row below states the shared *state*; this states the shared *consequence*.
        header={{ title: "채팅방 배경", description: "바꾸면 상대방 화면에서도 함께 바뀌어요" }}
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

    // INFO: REQUIREMENTS.md § 12.2. Both branches say 둘 다, because the sharing is the fact a reader of this screen cannot otherwise get at — the thumbnail beside the row already says a photo is set.
    return chatBackgroundMediaId
      ? "둘 다 이 사진을 대화 뒤에서 보고 있어요"
      : "둘 다 기본 배경을 쓰고 있어요";
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
    await setChatBackground(mediaId);
    // INFO: REQUIREMENTS.md § 12.2. No `router.refresh()`. This row and the room both read the live value out of the stream, and the write's own `user_changed` is what moves it — on this device exactly as on the other one.
    setIsActionsOpen(false);
    // INFO: § 12.2. Named for what actually happened. 되돌렸어요 alone would read as undoing a change this user made, when clearing it takes the wallpaper off the other participant's screen too.
    toast.success(mediaId ? "둘 다 이 배경으로 바뀌었어요" : "둘 다 기본 배경으로 돌아갔어요");
  }
}
