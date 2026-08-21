"use client";

import type { MediaDraft } from "@/entities/media";
import { useChatStream } from "@/features/chat-stream/@x/apply-photo";
import { updateProfile } from "@/features/update-profile/@x/apply-photo";
import { MediaEditor, VideoCropper, uploadDraft } from "@/features/upload-media/@x/apply-photo";
import { AVATAR_MAX_EDGE, BACKGROUND_MAX_EDGE, isVideoMime } from "@/shared/config";
import type { MediaId, Nullable } from "@/shared/lib";
import { ActionSheet, toast, type ActionSheetItem } from "@/shared/ui";
import { ImageIcon, MessageSquare, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { setChatBackground } from "../api/set-chat-background";
import { usePickedPhoto } from "../model/use-picked-photo";

/** Which slot the photo is being worn in. */
type PhotoTarget = "avatar" | "profile" | "chat";

// INFO: DESIGN.md § 7.7. The avatar is a circle, so its crop is square and the ratio chips have nothing left to offer.
const AVATAR_ASPECT_RATIO = 1;

/**
 * The `media` row 사진 사용하기 was opened over.
 *
 * INFO: `isVideo` rather than the whole cell, because it is the only property the sheet branches on — only the profile cover takes a clip (§ 12.2.).
 */
export type ApplyPhotoSource = { isVideo: boolean; id: MediaId };

export type ApplyPhotoSheetProps = {
  className?: string;
  /** The `media` row the user is looking at, or `null` while the sheet is closed. */
  source: Nullable<ApplyPhotoSource>;
  onClose: () => void;
};

/**
 * REQUIREMENTS.md § 12.1., § 12.2. 사진 사용하기, offered over a photo in the library
 * or in a chat bubble — the profile image, the profile cover, or the room's wallpaper.
 *
 * INFO: Three rows rather than one, because the three slots do not mean the same
 * thing — a profile image is who this person is, a cover decorates their profile, and
 * a wallpaper is the room both of them sit in (§ 12.2.). A single row would pick one
 * on the user's behalf, and any choice is a surprise two thirds of the time.
 *
 * INFO: § 12.2. A video reaches the cover alone, and the caps that make one affordable are checked before the control is drawn (`isWearableBackgroundVideo`).
 *
 * WARN: Every target goes through a crop the user draws, so this flow needs the
 * original **pixels** rather than an id — see `readOriginalFile` for why they cannot
 * be taken off the display URL.
 *
 * WARN: The rows are visible to the other participant to differing degrees, so the
 * header says which one also changes their screen — the labels alone cannot, and this
 * sheet is reached from a photo rather than from 설정, where the § 12.2. row explains
 * it at length.
 */
export function ApplyPhotoSheet({ className, source, onClose }: ApplyPhotoSheetProps) {
  // WARN: A ref, not state, and it is the only thing standing between a slow connection and a leaked object. `ActionSheet` closes itself in the same tick it fires `onSelect`, so this component is already unmounted-in-effect before the first `await` resolves and no `isBusy` state it holds can gate a second tap. The viewer underneath stays up, 사진 사용하기 is still there, and each tap uploads another object that only the last write is reachable through.
  const isApplyingRef = useRef(false);
  // INFO: Captured at the tap rather than read back off `source`, which the sheet's own close has already cleared by the time the crop is finished.
  const [target, setTarget] = useState<Nullable<PhotoTarget>>(null);
  const photo = usePickedPhoto();
  const { setChatBackgroundMediaId } = useChatStream();
  const router = useRouter();
  const isVideoCrop = photo.cropping !== null && isVideoMime(photo.cropping.mime);

  return (
    <>
      <ActionSheet
        className={className}
        // WARN: Closed while an overlay is up, for § 13.4.'s reason — the editor portals into the app shell and this drawer portals into `body`, so no z-index inside the shell can lift it over this.
        isOpen={source !== null && photo.cropping === null}
        header={{ title: "사진 사용하기", description: toDescription() }}
        items={buildItems()}
        onClose={onClose}
      />
      {photo.cropping && !isVideoCrop && (
        // WARN: Keyed by the draft — `MediaEditor` mints its source object URL once per mount, so re-cropping a second photo has to be a second mount.
        <MediaEditor
          key={photo.cropping.id}
          draft={photo.cropping}
          editOptions={{ maxEdge: target === "avatar" ? AVATAR_MAX_EDGE : BACKGROUND_MAX_EDGE }}
          // INFO: REQUIREMENTS.md § 12.1. A background is free-form — it is drawn `object-cover` at two geometries, so a fixed ratio would crop it twice — and the avatar is the circle it is worn in.
          fixedAspectRatio={target === "avatar" ? AVATAR_ASPECT_RATIO : undefined}
          onDone={(edited) => {
            photo.commit(edited);
            void wear(edited);
          }}
          onCancel={cancel}
        />
      )}
      {photo.cropping && isVideoCrop && (
        <VideoCropper
          key={photo.cropping.id}
          draft={photo.cropping}
          onDone={(file) => void wearCropped(file)}
          onCancel={cancel}
        />
      )}
    </>
  );

  /**
   * INFO: REQUIREMENTS.md § 12.2. A video reaches the profile cover alone, so the sheet drops the other two rows rather than disabling them — § 7.10.2.'s rule for a control that is never available.
   * WARN: The dropped rows are the ones the description was written for, so the sentence moves with them.
   */
  function buildItems(): ActionSheetItem[] {
    const profile: ActionSheetItem = {
      label: "프로필 배경으로",
      Icon: ImageIcon,
      onSelect: () => void start("profile"),
    };

    if (source?.isVideo) {
      return [profile];
    }

    return [
      { label: "프로필 이미지로", Icon: UserRound, onSelect: () => void start("avatar") },
      profile,
      { label: "채팅방 배경으로", Icon: MessageSquare, onSelect: () => void start("chat") },
    ];
  }

  // INFO: § 12.2. The sharing is stated wherever the wallpaper is offered; on a video there is no wallpaper row, so the sentence says why the one row is alone instead.
  function toDescription(): string {
    return source?.isVideo
      ? "동영상은 프로필 배경에만 쓸 수 있어요"
      : "채팅방 배경은 상대방 화면에도 같이 깔려요";
  }

  function cancel() {
    photo.cancel();
    setTarget(null);
    isApplyingRef.current = false;
  }

  // WARN: The id is a parameter of the read below rather than a later look at `source`. The sheet closes as this starts, so the state is `null` before the bytes arrive — captured at the tap, it is still the photo the user was looking at.
  async function start(slot: PhotoTarget) {
    if (!source) {
      return;
    }

    // WARN: The refusal has to be said out loud. `ActionSheet` closes itself on every select (§ 12.1.), so a swallowed second tap is a sheet dismissing exactly as it does on success.
    if (isApplyingRef.current) {
      toast.error("앞의 사진을 설정하고 있어요");

      return;
    }

    isApplyingRef.current = true;
    setTarget(slot);
    onClose();

    // INFO: The original is a full-resolution download and the sheet has already closed, so the viewer underneath would otherwise sit unchanged for seconds and the tap would read as having missed.
    const reading = toast.loading("사진을 불러오는 중이에요");
    const draft = await photo.readStored(source.id);

    toast.dismiss(reading);

    // INFO: The read said why it failed; this is only the guard coming back down, so the row can be tapped again.
    if (!draft) {
      cancel();
    }
  }

  // INFO: The video crop answers a `File`, so it is read back into a draft the § 9. pipeline can upload — `MediaEditor` hands one over already made.
  async function wearCropped(file: File) {
    const draft = await photo.readCropped(file);

    if (!draft) {
      cancel();

      return;
    }

    photo.commit(draft);
    await wear(draft);
  }

  async function wear(draft: MediaDraft) {
    const slot = target;

    if (!slot) {
      return;
    }

    // INFO: The upload is a full-resolution PUT followed by a write, so without this the user watches nothing happen for several seconds after the editor comes down.
    const applied = uploadAndWear(draft, slot);

    toast.promise(applied, {
      loading: "사진을 설정하는 중이에요",
      success: toSuccess(slot),
      error: "사진을 설정하지 못했어요",
    });

    try {
      await applied;
      // INFO: § 12.1. The avatar and the cover are read from a Server Component render, so they need this. The § 12.2. wallpaper does not — the room takes it from the stream, which the write has already moved — but the Settings rows behind this sheet are server-rendered too, so the refresh covers all three.
      router.refresh();
    } catch {
      // INFO: Reported by the toast above; swallowed here so the rejection is not also unhandled.
    } finally {
      photo.reset();
      setTarget(null);
      isApplyingRef.current = false;
    }
  }

  // WARN: Two kinds of write, not one, and REQUIREMENTS.md § 12.2. is why: the avatar and the cover are columns on the caller's own row and the wallpaper is a row of the room's, so they are different endpoints.
  async function uploadAndWear(draft: MediaDraft, slot: PhotoTarget) {
    const upload = await uploadDraft(draft, { scope: slot === "avatar" ? "avatar" : "background" });

    if (slot === "avatar") {
      await updateProfile({ avatar: upload });

      return;
    }

    if (slot === "profile") {
      await updateProfile({ profileBackground: upload });

      return;
    }

    // WARN: REQUIREMENTS.md § 12.2. Pushed into the stream state, exactly as the 설정 row does and for the same reason: this sheet is reached from 보관함 as well as 채팅, and § 8.4.2. mounts the socket in 채팅 alone — so on the library screen the write's own `user_changed` arrives nowhere.
    setChatBackgroundMediaId(await setChatBackground(upload));
  }

  function toSuccess(slot: PhotoTarget): string {
    if (slot === "avatar") {
      return "프로필 이미지로 설정했어요";
    }

    return slot === "profile" ? "프로필 배경으로 설정했어요" : "상대방 화면에도 이 배경이 깔렸어요";
  }
}
