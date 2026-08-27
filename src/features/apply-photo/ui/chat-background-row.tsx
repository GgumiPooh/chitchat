"use client";

import type { MediaDraft, MediaUpload } from "@/entities/media";
import { useChatStream } from "@/features/chat-stream/@x/apply-photo";
import { MediaEditor, uploadDraft, useMediaPicker } from "@/features/upload-media/@x/apply-photo";
import { BACKGROUND_MAX_EDGE, toMediaUrl } from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import { OFFLINE_MESSAGES, useOfflineGate } from "@/shared/offline-ux";
import { PreloadImage, SettingsRow, toast } from "@/shared/ui";
import { Wallpaper } from "lucide-react";
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
 * row draws a thumbnail of, so the row would show a broken image over a description
 * claiming the photo is up, and offer 기본 배경으로 for one that no longer exists.
 */
export function ChatBackgroundRow({ className }: ChatBackgroundRowProps) {
  const [isBusy, setIsBusy] = useState(false);
  const { isBlocked, guard } = useOfflineGate(OFFLINE_MESSAGES.change);
  const { chatBackgroundMediaId, setChatBackgroundMediaId } = useChatStream();
  const photo = usePickedPhoto();
  // INFO: REQUIREMENTS.md § 12.2. 사진 고르기 already names one kind of file, so the row opens the OS picker itself directly.
  const picker = useMediaPicker({
    accept: "image/*",
    onSelect: (files) => files[0] && void photo.read(files[0]),
  });

  return (
    <>
      <SettingsRow
        className={className}
        label="채팅방 배경"
        Icon={Wallpaper}
        haptic
        // INFO: The row is the only surface still on screen while a photo is read and uploaded — the sheet closed itself at the tap and the editor comes down at 완료 — so it says so rather than sitting unchanged for several seconds.
        description={toDescription()}
        // INFO: Both of the sheet's items write — one uploads, the other clears the shared row — so opening it offline is a sheet of two dead ends.
        isUnavailable={isBlocked}
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
        onClick={guard(picker.open)}
      />
      {picker.input}
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

    // INFO: REQUIREMENTS.md § 12.2. Both branches name 상대방 화면, because the sharing is the fact a reader of this screen cannot otherwise get at — the thumbnail beside the row already says a photo is set.
    // WARN: 깔리다 is the verb the row has always used for a wallpaper and it is the one that reads naturally here. An earlier revision said 둘 다 … 보고 있어요, which is not how Korean describes a picture behind something.
    return chatBackgroundMediaId
      ? "상대방 화면에도 이 배경이 깔려요"
      : "바꾸면 상대방 화면에도 같이 깔려요";
  }

  async function upload(draft: MediaDraft) {
    setIsBusy(true);

    try {
      const media = await uploadDraft(draft, { scope: "background" });

      await save(media);
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

  async function save(media: Nullable<MediaUpload>) {
    // WARN: REQUIREMENTS.md § 12.2. The id the server answered, pushed into the stream state by hand — and a `router.refresh()` would not do instead. 설정 mounts no `ChatStreamConnection` (§ 8.4.2.), so the write's own `user_changed` never reaches this screen, and the provider is seeded by the `(main)` shell, which a tab change does not re-render. Without this the thumbnail beside the row goes on showing the photo that was just replaced.
    const backgroundMediaId = await setChatBackground(media);

    setChatBackgroundMediaId(backgroundMediaId);
    // INFO: § 12.2. Named for what actually happened. 되돌렸어요 alone would read as undoing a change this user made, when clearing it takes the wallpaper off the other participant's screen too.
    toast.success(
      backgroundMediaId
        ? "상대방 화면에도 이 배경이 깔렸어요"
        : "상대방 화면도 기본 배경으로 돌아갔어요",
    );
  }
}
