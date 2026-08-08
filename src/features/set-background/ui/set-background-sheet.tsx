"use client";

import { useChatStream } from "@/features/chat-stream/@x/set-background";
import { updateProfile } from "@/features/update-profile/@x/set-background";
import type { Nullable } from "@/shared/lib";
import { ActionSheet, toast } from "@/shared/ui";
import { ImageIcon, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { copyToBackground } from "../api/copy-to-background";
import { setChatBackground } from "../api/set-chat-background";

type BackgroundSlot = "profile" | "chat";

export type SetBackgroundSheetProps = {
  className?: string;
  /** The `media` row the user is looking at, or `null` while the sheet is closed. */
  sourceId: Nullable<string>;
  onClose: () => void;
};

/**
 * REQUIREMENTS.md § 12.1., § 12.2. 배경으로 설정, offered over a photo in the
 * library or in a chat bubble.
 *
 * INFO: Two rows rather than one, because there are two backgrounds and they do not
 * mean the same thing — a cover decorates this person's profile, a wallpaper is the
 * room both of them sit in (§ 12.2.). A single 배경으로 설정 would have to pick one
 * of those on the user's behalf, and either choice is a surprise half the time.
 *
 * WARN: The two rows used to differ in who could *see* the result, and no longer do.
 * Both are visible to the other participant now, so the header says which one also
 * changes their screen — the labels alone cannot, and this sheet is reached from a
 * photo rather than from 설정, where the § 12.2. row explains it at length.
 *
 * WARN: The copy runs once per row, not once per sheet. Setting the same photo as
 * both leaves the two columns pointing at two objects, which is what lets either be
 * replaced later without `discardScopedMedia` deleting the other's bytes (§ 12.).
 */
export function SetBackgroundSheet({ className, sourceId, onClose }: SetBackgroundSheetProps) {
  // WARN: A ref, not state, and it is the only thing standing between a slow connection and a leaked object. `ActionSheet` closes itself in the same tick it fires `onSelect`, so this component is already unmounted-in-effect before the first `await` resolves and no `isBusy` state it holds can gate a second tap. The viewer underneath stays up, 배경으로 설정 is still there, and each tap mints another `background/` copy that only the last write is reachable through.
  const isApplyingRef = useRef(false);
  const { setChatBackgroundMediaId } = useChatStream();
  const router = useRouter();

  return (
    <ActionSheet
      className={className}
      isOpen={sourceId !== null}
      header={{ title: "배경으로 설정", description: "채팅방 배경은 상대방 화면에도 같이 깔려요" }}
      items={[
        { label: "프로필 배경으로", Icon: ImageIcon, onSelect: () => void apply("profile") },
        { label: "채팅방 배경으로", Icon: MessageSquare, onSelect: () => void apply("chat") },
      ]}
      onClose={onClose}
    />
  );

  async function apply(slot: BackgroundSlot) {
    if (!sourceId) {
      return;
    }

    // WARN: The refusal has to be said out loud. `ActionSheet` closes itself on every select (§ 12.1.), so a swallowed second tap is a sheet dismissing exactly as it does on success — and the loading toast still up is the *first* tap's, which reads as confirming a slot the user did not pick.
    if (isApplyingRef.current) {
      toast.error("앞의 배경을 설정하고 있어요");

      return;
    }

    isApplyingRef.current = true;
    // INFO: The sheet is already closing and the copy is a full-resolution R2 duplicate, so without this the user taps and watches nothing happen for several seconds. `toast.promise` is the only surface still on screen to say so.
    const applied = copyAndWear(sourceId, slot);

    toast.promise(applied, {
      loading: "배경으로 설정하는 중이에요",
      success:
        slot === "profile" ? "프로필 배경으로 설정했어요" : "상대방 화면에도 이 배경이 깔렸어요",
      error: "배경으로 설정하지 못했어요",
    });

    try {
      await applied;
      // INFO: § 12.1. The profile cover is read from a Server Component render, so it needs this. The § 12.2. wallpaper does not — the room takes it from the stream, which the write has already moved — but the Settings row behind this sheet is server-rendered too, so the refresh covers both.
      router.refresh();
    } catch {
      // INFO: Reported by the toast above; swallowed here so the rejection is not also unhandled.
    } finally {
      isApplyingRef.current = false;
      onClose();
    }
  }

  // WARN: The id is a parameter rather than a read of `sourceId`. The sheet closes as it starts, so the state is `null` by the time this resolves — captured at the tap, it is still the photo the user was looking at.
  // WARN: Two writes, not one, and REQUIREMENTS.md § 12.2. is why: the cover is a column on the caller's own row and the wallpaper is a row of the room's, so they are different endpoints. The copy above is still the caller's either way — the object lands under their own `background/` prefix whichever slot wears it.
  async function copyAndWear(id: string, slot: BackgroundSlot) {
    const media = await copyToBackground(id, slot);

    if (slot === "profile") {
      await updateProfile({ profileBackgroundMediaId: media.id });

      return;
    }

    // WARN: REQUIREMENTS.md § 12.2. Pushed into the stream state, exactly as the 설정 row does and for the same reason: this sheet is reached from 보관함 as well as 채팅, and § 8.4.2. mounts the socket in 채팅 alone — so on the library screen the write's own `user_changed` arrives nowhere.
    setChatBackgroundMediaId(await setChatBackground(media.id));
  }
}
