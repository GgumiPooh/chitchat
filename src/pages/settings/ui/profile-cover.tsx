"use client";

import { useProfileViewer } from "@/features/view-profile";
import { toMediaUrl } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { Avatar, PreloadImage } from "@/shared/ui";

export type ProfileCoverProps = {
  className?: string;
  userId: string;
  name: string;
  avatarMediaId: Nullable<string>;
  profileBackgroundMediaId: Nullable<string>;
};

/**
 * DESIGN.md § 7.16. The Settings screen's own header — half the visual viewport,
 * with the § 12.1. profile cover behind the avatar and the name.
 *
 * INFO: REQUIREMENTS.md § 12.3. Tapping the avatar opens the profile screen, which
 * is where enlarging the photo now lives. The two used to be the same tap here, and
 * only one of them can be.
 *
 * WARN: Measured against `--viewport-height`, never `50vh` (DESIGN.md § 3.4.). `vh`
 * is the *layout* viewport on WebKit, so it does not shrink for the keyboard and
 * ignores the browser chrome the shell is already sized around.
 */
export function ProfileCover({
  className,
  userId,
  name,
  avatarMediaId,
  profileBackgroundMediaId,
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
      style={{ height: "calc(var(--viewport-height, 100dvh) * 0.5)" }}
    >
      {profileBackgroundMediaId && (
        <PreloadImage
          className="absolute inset-0"
          imgClassName="size-full object-cover"
          placeholderClassName="bg-scrim"
          src={toMediaUrl(profileBackgroundMediaId, "original")}
          alt=""
        />
      )}
      {/* INFO: Two stops for `ProfileOverlay`'s reason — the top darkens the strip the floating 설정 header sits in, the bottom darkens the name, and the middle is left alone. */}
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
