"use client";

import type { EmoticonPackSummary } from "@/entities/emoticon";
import type { MediaDraft } from "@/entities/media";
import { EmoticonFormSheet } from "@/features/author-emoticon/@x/apply-photo";
import { useChatStream } from "@/features/chat-stream/@x/apply-photo";
import {
  EmoticonPackPickerSheet,
  saveEmoticonPackEnabled,
} from "@/features/emoticon-prefs/@x/apply-photo";
import { toEmoticonPackItemsQuery } from "@/features/send-message/@x/apply-photo";
import { updateProfile } from "@/features/update-profile/@x/apply-photo";
import { MediaEditor, VideoCropper, uploadDraft } from "@/features/upload-media/@x/apply-photo";
import {
  AVATAR_MAX_EDGE,
  BACKGROUND_MAX_EDGE,
  EMOTICON_KIND_NOUNS,
  MAX_BACKGROUND_VIDEO_SIZE,
  isVideoMime,
  type EmoticonPackType,
} from "@/shared/config";
import { formatSize, type MediaId, type Nullable } from "@/shared/lib";
import { ActionSheet, toast, type ActionSheetItem } from "@/shared/ui";
import { useQueryClient } from "@tanstack/react-query";
import { josa } from "es-hangul";
import { ImageIcon, MessageSquare, Smile, Sticker, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { readOriginalFile } from "../api/read-original";
import { setChatBackground } from "../api/set-chat-background";
import { usePickedPhoto } from "../model/use-picked-photo";

/** Which slot the photo is being worn in. */
type PhotoTarget = "avatar" | "profile" | "chat";

/** REQUIREMENTS.md § 13.4. What 이모티콘/미니이모티콘으로 추가하기 has staged once a pack is picked and the source bytes are in hand. */
type EmoticonDraft = {
  packType: EmoticonPackType;
  pack: EmoticonPackSummary;
  file: File;
  isVideo: boolean;
};

// INFO: DESIGN.md § 7.7. The avatar is a circle, so its crop is square and the ratio chips have nothing left to offer.
const AVATAR_ASPECT_RATIO = 1;

/**
 * The `media` row 사진 사용하기 was opened over.
 *
 * INFO: `isVideo` rather than the whole cell, because it is the only property the sheet branches on — a video reaches every row but the profile image and the wallpaper (§ 12.2., § 13.4.).
 */
export type ApplyPhotoSource = { isVideo: boolean; id: MediaId };

export type ApplyPhotoSheetProps = {
  className?: string;
  /** The `media` row the user is looking at, or `null` while the sheet is closed. */
  source: Nullable<ApplyPhotoSource>;
  onClose: () => void;
};

/**
 * REQUIREMENTS.md § 12.1., § 12.2., § 13.4. 사진/동영상 사용하기, offered over a photo
 * or clip in the library or in a chat bubble — the profile image, the profile cover,
 * the room's wallpaper, or a new emoticon.
 *
 * INFO: Five rows rather than one, because the slots do not mean the same thing — a
 * profile image is who this person is, a cover decorates their profile, a wallpaper is
 * the room both of them sit in (§ 12.2.), and an emoticon is neither. A single row
 * would pick one on the user's behalf, and any choice is a surprise most of the time.
 *
 * INFO: § 12.2. A video drops the profile image and the wallpaper — only the cover
 * takes a clip — but reaches both emoticon rows exactly as a photo does (§ 13.4.). The
 * viewer draws the control inside § 12.1.'s caps only (`isWearableBackgroundVideo`).
 *
 * WARN: The first three targets go through a crop the user draws, so those need the
 * original **pixels** rather than an id — see `readOriginalFile` for why they cannot
 * be taken off the display URL. The emoticon rows read the same original bytes, then
 * hand them to `EmoticonFormSheet`'s own editors instead of this sheet's crop.
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
  const queryClient = useQueryClient();
  const isVideoCrop = photo.cropping !== null && isVideoMime(photo.cropping.mime);
  // INFO: § 13.4. Which library the picker lists — set at the tap, since `source` (and its `id`) is gone by the time a pack is picked.
  const [emoticonPickerType, setEmoticonPickerType] = useState<Nullable<EmoticonPackType>>(null);
  const [emoticonSource, setEmoticonSource] = useState<Nullable<ApplyPhotoSource>>(null);
  const [emoticonDraft, setEmoticonDraft] = useState<Nullable<EmoticonDraft>>(null);

  return (
    <>
      <ActionSheet
        className={className}
        // WARN: Closed while an overlay is up, for § 13.4.'s reason — the editor portals into the app shell and this drawer portals into `body`, so no z-index inside the shell can lift it over this.
        isOpen={source !== null && photo.cropping === null}
        items={buildItems()}
        header={{
          title: source?.isVideo ? "동영상 사용하기" : "사진 사용하기",
          description: toDescription(),
        }}
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
      {emoticonPickerType && (
        <EmoticonPackPickerSheet
          type={emoticonPickerType}
          isOpen
          onClose={cancelEmoticonFlow}
          onPick={(pack) => void handlePackPicked(pack)}
        />
      )}
      {emoticonDraft && (
        <EmoticonFormSheet
          packId={emoticonDraft.pack.id}
          type={emoticonDraft.packType}
          isOpen
          initialFile={emoticonDraft.isVideo ? null : emoticonDraft.file}
          initialVideo={emoticonDraft.isVideo ? emoticonDraft.file : null}
          closesOnCancel
          onClose={cancelEmoticonFlow}
          onSaved={() => void handleEmoticonSaved()}
        />
      )}
    </>
  );

  /**
   * INFO: REQUIREMENTS.md § 12.2., § 13.4. A video drops the profile image and the
   * wallpaper — only the cover takes a clip — but reaches both emoticon rows exactly as
   * a photo does.
   * WARN: The dropped rows are the ones the description was written for, so the sentence moves with them.
   */
  function buildItems(): ActionSheetItem[] {
    const emoticonItems: ActionSheetItem[] = [
      {
        label: "이모티콘으로 추가하기",
        Icon: Smile,
        onSelect: () => void startEmoticon("emoticon"),
      },
      {
        label: "미니이모티콘으로 추가하기",
        Icon: Sticker,
        onSelect: () => void startEmoticon("mini"),
      },
    ];

    const profile: ActionSheetItem = {
      label: "프로필 배경으로",
      Icon: ImageIcon,
      onSelect: () => void start("profile"),
    };

    if (source?.isVideo) {
      return [profile, ...emoticonItems];
    }

    return [
      { label: "프로필 이미지로", Icon: UserRound, onSelect: () => void start("avatar") },
      profile,
      { label: "채팅방 배경으로", Icon: MessageSquare, onSelect: () => void start("chat") },
      ...emoticonItems,
    ];
  }

  // INFO: § 12.2. The sharing is stated wherever the wallpaper is offered; a video has no wallpaper row, so the sentence says what it can be used for instead.
  function toDescription(): string {
    return source?.isVideo
      ? "프로필 배경이나 이모티콘으로 쓸 수 있어요"
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

  // WARN: `source` is captured into state rather than read back later, for `start`'s reason — the sheet has closed by the time a pack is picked.
  function startEmoticon(type: EmoticonPackType) {
    if (!source) {
      return;
    }

    if (isApplyingRef.current) {
      toast.error("앞의 사진을 설정하고 있어요");

      return;
    }

    isApplyingRef.current = true;
    setEmoticonSource(source);
    setEmoticonPickerType(type);
    onClose();
  }

  async function handlePackPicked(pack: EmoticonPackSummary) {
    const type = emoticonPickerType;
    const picked = emoticonSource;

    if (!type || !picked) {
      return;
    }

    setEmoticonPickerType(null);

    const reading = toast.loading(
      picked.isVideo ? "영상을 불러오는 중이에요" : "사진을 불러오는 중이에요",
    );

    try {
      const file = await readOriginalFile(picked.id);

      toast.dismiss(reading);
      setEmoticonDraft({ packType: type, pack, file, isVideo: picked.isVideo });
    } catch {
      toast.dismiss(reading);
      toast.error(picked.isVideo ? "영상을 불러오지 못했어요" : "사진을 불러오지 못했어요");
      cancelEmoticonFlow();
    }
  }

  function cancelEmoticonFlow() {
    setEmoticonPickerType(null);
    setEmoticonSource(null);
    setEmoticonDraft(null);
    isApplyingRef.current = false;
  }

  /**
   * INFO: REQUIREMENTS.md § 13.1. A pack the reader had hidden is turned back on, or
   * the item they just made would land nowhere they can see it (§ 13.5.).
   */
  async function handleEmoticonSaved() {
    const draft = emoticonDraft;

    if (!draft) {
      return;
    }

    toast.success(`${josa(EMOTICON_KIND_NOUNS[draft.packType].kind, "을/를")} 추가했어요`);
    // WARN: § 13.6.'s tray caches a pack's items for a minute on the premise that authoring happens on other routes; this sheet authors on the chat route itself.
    void queryClient.invalidateQueries({
      queryKey: toEmoticonPackItemsQuery(draft.pack.id).queryKey,
    });

    if (!draft.pack.isEnabled) {
      try {
        await saveEmoticonPackEnabled(draft.pack.id, true);
      } catch {
        toast.error("묶음을 사용 설정하지 못했어요");
      }
    }
  }

  // INFO: The video crop answers a `File`, so it is read back into a draft the § 9. pipeline can upload — `MediaEditor` hands one over already made.
  async function wearCropped(file: File) {
    // WARN: § 12.1.'s cap is re-checked on the **result**. The source passed it, and a re-encode can still come out larger than what it was cut from — a long crop of a well-compressed clip is exactly that case.
    if (file.size > MAX_BACKGROUND_VIDEO_SIZE) {
      toast.error(`잘라낸 영상이 ${josa(formatSize(MAX_BACKGROUND_VIDEO_SIZE), "을/를")} 넘어요`);

      return;
    }

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
