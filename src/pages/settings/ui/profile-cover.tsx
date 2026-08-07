"use client";

import { useProfileViewer } from "@/features/view-profile";
import { cn, type Nullable } from "@/shared/lib";
import { Avatar, BackgroundMedia } from "@/shared/ui";

export type ProfileCoverProps = {
  className?: string;
  userId: string;
  name: string;
  avatarMediaId: Nullable<string>;
  profileBackgroundMediaId: Nullable<string>;
  /** REQUIREMENTS.md § 12.1. A cover may be a video, and the element to draw it in cannot be inferred from the id. */
  isProfileBackgroundVideo: boolean;
};

// WARN: DESIGN.md § 3.4. The whole band, photo included, is held against the *layout* viewport — the keyboard must not resize it. Stabilising only the photo inside a band that still shrank was the half-fix: the picture stopped rescaling and the band went on collapsing around it, which is the same thing to look at.
// WARN: Still never `50vh`. `vh` is the large viewport on WebKit, so it ignores the browser chrome the shell is already sized around — that half of the original objection stands, and `--layout-viewport-height` answers it while `vh` does not.
const BAND_HEIGHT = "calc(var(--layout-viewport-height, 100dvh) * 0.5)";

/**
 * DESIGN.md § 7.16. The Settings screen's own header — half the layout viewport,
 * with the § 12.1. profile cover behind the avatar and the name.
 *
 * INFO: REQUIREMENTS.md § 12.3. Tapping the avatar opens the profile screen, which
 * is where enlarging the photo now lives. The two used to be the same tap here, and
 * only one of them can be.
 */
export function ProfileCover({
  className,
  userId,
  name,
  avatarMediaId,
  profileBackgroundMediaId,
  isProfileBackgroundVideo,
}: ProfileCoverProps) {
  const { openProfile } = useProfileViewer();
  const hasCover = profileBackgroundMediaId !== null;

  return (
    <div
      className={cn(
        // WARN: `shrink-0` — this is the only item in the settings column with real shrink headroom (half the viewport against ~16px per row), so an overflowing screen would absorb all of it here and collapse the band DESIGN.md § 7.16. specifies. `RouteTransition`'s spacer carries the same warning for the same reason.
        "relative flex shrink-0 flex-col items-center justify-end gap-sm overflow-hidden pb-lg",
        // INFO: The floor under a missing cover is `surface-soft` rather than `scrim` — an empty half-screen of near-black would read as a broken image rather than as a profile nobody has decorated yet.
        hasCover ? "bg-scrim" : "bg-surface-soft",
        className,
      )}
      style={{ height: BAND_HEIGHT }}
    >
      {/* INFO: Plain `inset-0` — the band above no longer moves under the keyboard, so the photo needs no stable height of its own to be held at. */}
      {profileBackgroundMediaId && (
        <BackgroundMedia
          className="absolute inset-0"
          mediaId={profileBackgroundMediaId}
          isVideo={isProfileBackgroundVideo}
        />
      )}
      {/* INFO: Two stops for `ProfileOverlay`'s reason — the top darkens the strip the floating 설정 header sits in, the bottom darkens the name, and the middle is left alone. */}
      {/* WARN: No `pointer-events-none`. Nothing under the tint takes a press — the avatar and the name are later `relative` siblings and hit-test above it — so letting presses through only reaches the cover's own `<img>`/`<video>` and opens the OS "이미지 저장" callout on the Settings screen. */}
      {hasCover && (
        <div className="absolute inset-0 bg-gradient-to-b from-scrim/55 via-transparent to-scrim/80" />
      )}
      <Avatar
        className="relative"
        fallbackClassName={hasCover ? "bg-surface-strong/90" : undefined}
        name={name}
        mediaId={avatarMediaId}
        size="profile"
        onClick={() => openProfile(userId)}
      />
      <p className={cn("relative text-title-md", hasCover ? "text-on-primary" : "text-ink")}>
        {name}
      </p>
    </div>
  );
}
