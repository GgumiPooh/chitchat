"use client";

import { useChatStream } from "@/features/chat-stream/@x/view-profile";
import { ProfileEditorSheet } from "@/features/update-profile/@x/view-profile";
import { toMediaUrl } from "@/shared/config";
import { cn } from "@/shared/lib";
import { Avatar, HapticTarget, IconButton, PreloadImage, ShellOverlay } from "@/shared/ui";
import { MessageCircle, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// INFO: What every overlay in `shared/ui` renders, plus the § 7.10. viewer, which composes no `Dialog` and marks itself instead.
const OVERLAY_ABOVE_SELECTOR = '[role="dialog"][data-state="open"], [data-media-viewer]';

export type ProfileOverlayProps = {
  className?: string;
  /** The participant being looked at. Resolved live, so a rename reaches an open profile (REQUIREMENTS.md § 8.7.). */
  userId: string;
  currentUserId: string;
  onClose: () => void;
};

/**
 * REQUIREMENTS.md § 12.3. The profile screen, reached by tapping an avatar anywhere
 * the tap is wired — the Settings header and a chat bubble's avatar (§ 12.).
 *
 * WARN: `absolute`, never `fixed` — AGENTS.md § 4.4. keeps the app shell as the
 * app's one fixed element. `ShellOverlay` is what puts this over the floating header
 * and the tab bar rather than under them.
 *
 * INFO: The cover is drawn under a two-stop scrim and the base is `scrim` itself, so
 * the name and the controls are `on-primary` whether or not a photo is set. A
 * background-dependent text colour would have to be sampled from the image.
 */
export function ProfileOverlay({ className, userId, currentUserId, onClose }: ProfileOverlayProps) {
  const { participants } = useChatStream();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const router = useRouter();
  const participant = participants.find((candidate) => candidate.id === userId);
  const isMine = userId === currentUserId;

  // INFO: DESIGN.md § 7.10. This composes no `Dialog`, so the dismissal `Modal` gets from Radix is written out here.
  useEffect(() => {
    // WARN: Only when nothing is open above. The avatar's own § 7.10. viewer and the 프로필 편집 sheet both answer `Escape` themselves, and without this the key would take this screen down with them.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(OVERLAY_ABOVE_SELECTOR)) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // INFO: A participant that is not in the set is a row this client has not been told about yet (§ 8.4.); there is nothing to draw and the screen closes itself rather than showing an empty one.
  useEffect(() => {
    if (!participant) {
      onClose();
    }
  }, [participant, onClose]);

  if (!participant) {
    return null;
  }

  return (
    <ShellOverlay>
      {/* WARN: `role`/`aria-modal` by hand, because this composes no Radix primitive (§ 12.3.). Without them a screen reader announces the chat screen underneath as live content with no boundary — the opaque fill hides it from the eye and from the pointer, and nothing else was telling assistive tech that it is gone. */}
      {/* TODO: A focus trap is still missing here and in the § 7.10. viewer, which has the same hand-rolled shape — Tab walks into the composer behind this. It needs one owner for both rather than a second copy. */}
      <div
        className={cn("absolute inset-0 z-40 flex flex-col bg-scrim", className)}
        role="dialog"
        aria-modal="true"
        aria-label={`${participant.name} 프로필`}
      >
        {participant.profileBackgroundMediaId && (
          <PreloadImage
            className="absolute inset-0"
            imgClassName="size-full object-cover"
            placeholderClassName="bg-scrim"
            src={toMediaUrl(participant.profileBackgroundMediaId, "original")}
            alt=""
          />
        )}
        {/* INFO: Two stops, not one. The top darkens the strip the close control sits in and the bottom darkens the name; a flat wash over the whole photo would dim the part the user came to look at. */}
        <div className="absolute inset-0 bg-gradient-to-b from-scrim/60 via-transparent to-scrim/85" />
        <div className="relative flex items-start justify-between p-sm pt-[max(var(--spacing-sm),env(safe-area-inset-top))]">
          <IconButton
            className="text-on-primary hover:bg-canvas/15 hover:text-on-primary"
            Icon={X}
            aria-label="닫기"
            onClick={onClose}
          />
          {isMine && (
            <IconButton
              className="text-on-primary hover:bg-canvas/15 hover:text-on-primary"
              Icon={Pencil}
              haptic
              aria-label="프로필 편집"
              onClick={() => setIsEditorOpen(true)}
            />
          )}
        </div>
        <div className="relative flex flex-1 flex-col items-center justify-end gap-sm px-md pb-[max(var(--spacing-2xl),env(safe-area-inset-bottom))]">
          {/* INFO: REQUIREMENTS.md § 12. Tapping the circle still enlarges the photo, which is what an avatar tap meant before this screen existed — the gesture kept its meaning and moved one level in. */}
          <Avatar
            fallbackClassName="bg-surface-strong/90"
            name={participant.name}
            mediaId={participant.avatarMediaId}
            size="profile"
            canEnlarge
          />
          <p className="text-title-md text-on-primary">{participant.name}</p>
          {!isMine && (
            // INFO: REQUIREMENTS.md § 7. A raw button, so the haptic overlay is composed by hand rather than riding a `haptic` prop.
            <HapticTarget className="mt-xs flex rounded-full">
              <button
                className="inline-flex min-h-11 cursor-pointer items-center gap-xs rounded-full bg-canvas/15 px-md text-button-md text-on-primary transition-colors outline-none group-active:bg-canvas/25 hover:bg-canvas/25 focus-visible:ring-2 focus-visible:ring-primary active:bg-canvas/25"
                type="button"
                onClick={openConversation}
              >
                <MessageCircle className="size-4.5" strokeWidth={1.75} />
                대화하기
              </button>
            </HapticTarget>
          )}
        </div>
      </div>
      {isMine && (
        <ProfileEditorSheet
          // WARN: Keyed by what it seeds from, for `ProfileSettingsRow`'s reason — the sheet holds the name in its own state, so a save has to remount it or the next open reseeds from the value that was replaced.
          key={`${participant.name}:${participant.avatarMediaId}:${participant.profileBackgroundMediaId}`}
          isOpen={isEditorOpen}
          nickname={participant.name}
          avatarMediaId={participant.avatarMediaId}
          profileBackgroundMediaId={participant.profileBackgroundMediaId}
          onClose={() => setIsEditorOpen(false)}
          // INFO: The participant set is refreshed over `user_changed` (§ 8.4.), so this screen redraws on its own — the refresh is for the Server Components underneath it.
          onSaved={() => router.refresh()}
        />
      )}
    </ShellOverlay>
  );

  function openConversation() {
    onClose();
    router.push("/chat");
  }
}
