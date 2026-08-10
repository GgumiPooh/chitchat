"use client";

import { toMediaUrl } from "@/shared/config";
import { cn, type Maybe, type Nullable } from "@/shared/lib";
import { Avatar as AvatarPrimitive } from "radix-ui";
import { useMemo, useState } from "react";
import type { MediaCell } from "./media-cell";
import { MediaViewer } from "./media-viewer";

export type AvatarProps = {
  className?: string;
  fallbackClassName?: string;
  src?: Maybe<string>;
  /** REQUIREMENTS.md § 12. The `media` row behind the photo. Resolves `src` and is what the full-screen view reads. */
  mediaId?: Nullable<string>;
  /** Resolved display name. Its first character is the fallback, per DESIGN.md § 7.7. */
  name: string;
  size?: "chat" | "row" | "profile";
  /**
   * Makes the avatar a button that opens the photo full screen.
   *
   * WARN: Off by default, and it must stay off inside another interactive element —
   * the calendar's day agenda renders one inside the row button that opens an event
   * (§ 11.4.), where a nested `button` is invalid markup and swallows that tap.
   */
  canEnlarge?: boolean;
  /**
   * Makes the avatar a button that runs this instead of enlarging the photo.
   *
   * INFO: REQUIREMENTS.md § 12.3. What opens the profile screen. It takes
   * precedence over `canEnlarge`, because the enlargement moved one level in — it
   * is what the avatar *inside* the profile screen does, and one avatar can only
   * mean one thing per screen (§ 12.).
   *
   * WARN: `shared/ui` cannot reach the provider that owns the profile screen (§ 2.),
   * so the tap is wired by whoever renders the avatar. The calendar's day agenda
   * deliberately wires neither this nor `canEnlarge` (§ 12.).
   */
  onClick?: () => void;
};

const SIZE_CLASS_NAME = {
  chat: "size-9",
  row: "size-11",
  profile: "size-18",
};

// INFO: DESIGN.md § 7.7. The inset hairline ring exists at every size so light photos cannot bleed into `canvas`.
export function Avatar({
  className,
  fallbackClassName,
  src,
  mediaId,
  name,
  size = "chat",
  canEnlarge = false,
  onClick,
}: AvatarProps) {
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const resolvedSrc = src ?? (mediaId ? toMediaUrl(mediaId) : undefined);
  const cells = useMemo(() => (mediaId ? [toAvatarCell(mediaId)] : []), [mediaId]);
  const isEnlargeable = canEnlarge && cells.length > 0;
  // INFO: A caller-supplied tap works with no photo at all — an initial-letter avatar still names a person whose profile there is to open (DESIGN.md § 7.7.).
  const isTappable = onClick !== undefined || isEnlargeable;

  const face = (
    <AvatarPrimitive.Root
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full ring-1 ring-hairline select-none ring-inset",
        // WARN: The button below takes over sizing when it wraps this, or a caller's `size-*` would size the wrapper while the circle kept its own — the calendar's day agenda passes exactly that (§ 11.4.).
        isTappable ? "size-full" : cn(SIZE_CLASS_NAME[size], className),
      )}
    >
      {resolvedSrc && (
        <AvatarPrimitive.Image className="aspect-square size-full" src={resolvedSrc} alt={name} />
      )}
      <AvatarPrimitive.Fallback
        className={cn(
          "flex size-full items-center justify-center bg-surface-strong text-title-sm text-meta",
          fallbackClassName,
        )}
      >
        {[...name][0] ?? ""}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );

  if (!isTappable) {
    return face;
  }

  return (
    <>
      <button
        className={cn(
          "shrink-0 cursor-pointer rounded-full transition-opacity outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary active:opacity-70",
          SIZE_CLASS_NAME[size],
          className,
        )}
        type="button"
        aria-label={onClick ? `${name} 프로필 보기` : `${name} 프로필 사진 크게 보기`}
        onClick={onClick ?? (() => setIsViewerOpen(true))}
      >
        {face}
      </button>
      {isViewerOpen && (
        <MediaViewer cells={cells} initialIndex={0} onClose={() => setIsViewerOpen(false)} />
      )}
    </>
  );
}

/**
 * WARN: `1 / 1` is a fact about the stored object, not a convenience. The profile
 * editor crops every avatar square before it uploads (REQUIREMENTS.md § 12.), which
 * is what lets the viewer reserve a box without a round trip for the real
 * dimensions — an avatar written any other way would show letterboxed here.
 */
function toAvatarCell(mediaId: string): MediaCell {
  return {
    id: mediaId,
    previewUrl: toMediaUrl(mediaId),
    // INFO: The cell is built from an id and nothing else, so the row's own hash is out of reach here — DESIGN.md § 7.8.'s skeleton fills the box instead.
    blurhash: null,
    originalUrl: toMediaUrl(mediaId, "original"),
    // INFO: REQUIREMENTS.md § 9.1. An avatar is never a file attachment — the scope refuses one at registration — so it names none and reports no size the viewer would show.
    filename: null,
    sizeBytes: 0,
    // INFO: No save control. A profile photo is the person, not an attachment they shared, and § 7.10.'s viewer hides the affordance when there is nothing to point it at.
    downloadUrl: null,
    width: 1,
    height: 1,
    durationMs: null,
    isVideo: false,
  };
}
