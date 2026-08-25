"use client";

import { useChatStream } from "@/features/chat-stream/@x/view-profile";
import { ProfileEditorSheet } from "@/features/update-profile/@x/view-profile";
import { toLlmProviderBranding } from "@/shared/config";
import { cn, useModalOverlay, type UserId } from "@/shared/lib";
import { Avatar, BackgroundMedia, HapticTarget, IconButton, ShellOverlay } from "@/shared/ui";
import { MessageCircle, Pencil, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProfileSubject } from "../model/profile-viewer-provider";

export type ProfileOverlayProps = {
  className?: string;
  /** @see ProfileSubject */
  subject: ProfileSubject;
  currentUserId: UserId;
  onClose: () => void;
};

/**
 * REQUIREMENTS.md § 12.3. The profile screen, reached by tapping an avatar anywhere
 * the tap is wired — the Settings header and a chat bubble's avatar (§ 12.).
 *
 * WARN: `absolute`, never `fixed` — `ShellOverlay` owns the viewport-sized box this
 * fills (DESIGN.md § 3.3.), and it is what puts this over the floating header and the
 * tab bar rather than under them.
 *
 * INFO: The cover is drawn under a two-stop scrim and the base is `scrim` itself, so
 * the name and the controls are `on-primary` whether or not a photo is set. A
 * background-dependent text colour would have to be sampled from the image.
 */
export function ProfileOverlay({
  className,
  subject,
  currentUserId,
  onClose,
}: ProfileOverlayProps) {
  // INFO: `Escape` and the focus trap, from the one owner this screen shares with the § 7.10. viewer its own avatar opens — needed by both branches below, so it is taken once up here.
  const overlayRef = useModalOverlay<HTMLDivElement>(onClose);

  if (subject.type === "llm") {
    return (
      <LlmProfileOverlay
        className={className}
        overlayRef={overlayRef}
        subject={subject}
        onClose={onClose}
      />
    );
  }

  return (
    <UserProfileOverlay
      className={className}
      overlayRef={overlayRef}
      userId={subject.userId}
      currentUserId={currentUserId}
      onClose={onClose}
    />
  );
}

type OverlayRef = ReturnType<typeof useModalOverlay<HTMLDivElement>>;

type UserProfileOverlayProps = {
  className?: string;
  overlayRef: OverlayRef;
  userId: UserId;
  currentUserId: UserId;
  onClose: () => void;
};

/**
 * REQUIREMENTS.md § 12.3. The profile screen, reached by tapping an avatar anywhere
 * the tap is wired — the Settings header and a chat bubble's avatar (§ 12.).
 *
 * WARN: `absolute`, never `fixed` — `ShellOverlay` owns the viewport-sized box this
 * fills (DESIGN.md § 3.3.), and it is what puts this over the floating header and the
 * tab bar rather than under them.
 *
 * INFO: The cover is drawn under a two-stop scrim and the base is `scrim` itself, so
 * the name and the controls are `on-primary` whether or not a photo is set. A
 * background-dependent text colour would have to be sampled from the image.
 */
function UserProfileOverlay({
  className,
  overlayRef,
  userId,
  currentUserId,
  onClose,
}: UserProfileOverlayProps) {
  const { participants } = useChatStream();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const router = useRouter();
  const participant = participants.find((candidate) => candidate.id === userId);
  const isMine = userId === currentUserId;

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
      <div
        ref={overlayRef}
        className={cn(
          "pointer-events-auto absolute inset-0 z-40 flex flex-col bg-scrim",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={`${participant.name} 프로필`}
      >
        {participant.profileBackgroundMediaId && (
          // WARN: DESIGN.md § 3.4. The photo is held at the *large* viewport height and anchored to the top, because the § 12.1. editor sheet raises the keyboard over this screen — and this box follows it, so an `inset-0` cover would re-crop and rescale the photo on every frame of the slide. The clipping wrapper keeps the taller box from painting past the shell.
          // WARN: `lvh` and not the visual viewport, `dvh`, or `documentElement.clientHeight` — a keyboard moves every one of those on one engine or the other, `dvh` and the layout viewport under Chromium's `interactive-widget=resizes-content` (which this app sets).
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[100lvh]">
              <BackgroundMedia
                className="size-full"
                mediaId={participant.profileBackgroundMediaId}
                isVideo={participant.isProfileBackgroundVideo}
              />
            </div>
          </div>
        )}
        {/* INFO: Two stops, not one. The top darkens the strip the close control sits in and the bottom darkens the name; a flat wash over the whole photo would dim the part the user came to look at. */}
        <div className="absolute inset-0 bg-gradient-to-b from-scrim/60 via-transparent to-scrim/85" />
        <div className="relative flex items-start justify-between p-sm pt-[max(var(--spacing-sm),env(safe-area-inset-top))]">
          {/* INFO: DESIGN.md § 7.15. The exit from a full-screen surface, which ticks — the same rule the § 7.10. viewer's 닫기 and a route's 뒤로 follow. */}
          <IconButton
            buttonClassName="text-on-scrim hover:bg-on-scrim/15 hover:text-on-scrim"
            Icon={X}
            haptic
            aria-label="닫기"
            onClick={onClose}
          />
          {isMine && (
            <IconButton
              className="text-on-scrim hover:bg-on-scrim/15 hover:text-on-scrim"
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
          <p className="text-title-md text-on-scrim">{participant.name}</p>
          {!isMine && (
            // INFO: REQUIREMENTS.md § 7. A raw button, so the haptic overlay is composed by hand rather than riding a `haptic` prop.
            <HapticTarget className="mt-xs flex rounded-full">
              <button
                className="inline-flex min-h-11 cursor-pointer items-center gap-xs rounded-full bg-on-scrim/15 px-md text-button-md text-on-scrim transition-colors outline-none group-active:bg-on-scrim/25 hover:bg-on-scrim/25 focus-visible:ring-2 focus-visible:ring-primary active:bg-on-scrim/25"
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

type LlmProfileOverlayProps = {
  className?: string;
  overlayRef: OverlayRef;
  subject: Extract<ProfileSubject, { type: "llm" }>;
  onClose: () => void;
};

/**
 * The same § 12.3. screen, worn by the AI's own avatar rather than a participant's —
 * "알잘딱" per the teammate spec: the branding's cover and name, the model id as the
 * one meta line when the row carries one, and no actions at all.
 */
function LlmProfileOverlay({ className, overlayRef, subject, onClose }: LlmProfileOverlayProps) {
  const branding = toLlmProviderBranding(subject.provider);

  return (
    <ShellOverlay>
      <div
        ref={overlayRef}
        className={cn(
          "pointer-events-auto absolute inset-0 z-40 flex flex-col bg-scrim",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={`${branding.name} 프로필`}
      >
        {branding.backgroundSrc && (
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[100lvh]">
              {/* eslint-disable-next-line @next/next/no-img-element -- a static asset under `public/llm`, not a stored `media` row `next/image` would otherwise optimize */}
              <img className="size-full object-cover" src={branding.backgroundSrc} alt="" />
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-scrim/60 via-transparent to-scrim/85" />
        <div className="relative flex items-start p-sm pt-[max(var(--spacing-sm),env(safe-area-inset-top))]">
          <IconButton
            buttonClassName="text-on-scrim hover:bg-on-scrim/15 hover:text-on-scrim"
            Icon={X}
            haptic
            aria-label="닫기"
            onClick={onClose}
          />
        </div>
        <div className="relative flex flex-1 flex-col items-center justify-end gap-sm px-md pb-[max(var(--spacing-2xl),env(safe-area-inset-bottom))]">
          {branding.avatarSrc ? (
            <span className="size-18 overflow-hidden rounded-full ring-1 ring-hairline ring-inset">
              {/* eslint-disable-next-line @next/next/no-img-element -- a static asset under `public/llm` */}
              <img className="size-full object-cover" src={branding.avatarSrc} alt="" />
            </span>
          ) : (
            <span className="flex size-18 items-center justify-center rounded-full bg-primary-tint ring-1 ring-hairline ring-inset">
              <Sparkles className="size-7 text-primary" strokeWidth={1.75} />
            </span>
          )}
          <p className="text-title-md text-on-scrim">{branding.name}</p>
          {subject.modelId && <p className="text-caption text-on-scrim/70">{subject.modelId}</p>}
        </div>
      </div>
    </ShellOverlay>
  );
}
