"use client";

import { toMediaUrl } from "@/shared/config";
import { cn } from "@/shared/lib";
import { PreloadImage } from "@/shared/ui";

export type ChatBackdropProps = {
  className?: string;
  mediaId: string;
};

/**
 * REQUIREMENTS.md § 12.2. The wallpaper behind the conversation, under a fixed
 * `chat-scrim` wash.
 *
 * WARN: The wash is not decoration. Every meta colour in the room — `chat-meta`,
 * the date pill, `읽음` — was picked for contrast against `chat-canvas`
 * (DESIGN.md § 4.1.), and a photo underneath them is an arbitrary colour. The wash
 * is what puts them back on the surface they were designed against, which is why it
 * is fixed rather than a slider: a user-chosen opacity has a setting at which the
 * timestamps are unreadable.
 *
 * WARN: First child of the room, and every sibling after it is absolutely
 * positioned too (the scroller, the empty state). That is what orders them — both
 * layers are in the positioned-descendant paint order, so DOM order decides and no
 * `z-index` is involved. Adding one here would have to outrank the composer.
 *
 * INFO: `pointer-events-none` throughout. The photo sits under the § 8.3. scroller
 * and under the § 8.11. hold on every bubble; taking a tap here would mean a photo
 * in the wallpaper competing with the photos in the conversation.
 */
export function ChatBackdrop({ className, mediaId }: ChatBackdropProps) {
  return (
    // WARN: `overflow-hidden` is what lets the photo below stand taller than this box without extending `#app-scroll`'s scroll range — a phantom scroll on the one screen that must not have one.
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {/* INFO: `original`, not the thumbnail. This is drawn across the whole screen, where § 9.'s 720px long edge would be visibly soft. */}
      {/* WARN: No skeleton. The flat `chat-canvas` *is* the room's own floor, so a load that has not landed reads as a wallpaper that was never set; a pulsing plate the size of the screen behind the conversation is louder than the swap it covers. */}
      {/* WARN: DESIGN.md § 3.4. The **layout** viewport, and top-anchored — the one thing in the shell that must not follow the keyboard. Sized to the shell it is `object-cover` over a box that loses a third of its height, so every frame of the keyboard sliding re-crops and rescales the wallpaper behind the conversation. Held at its resting height it is simply clipped by the box above, and the photo does not move at all. */}
      <PreloadImage
        className="absolute inset-x-0 top-0 h-[var(--layout-viewport-height,100dvh)]"
        imgClassName="size-full object-cover"
        placeholderClassName="bg-chat-canvas"
        src={toMediaUrl(mediaId, "original")}
        hasSkeleton={false}
        alt=""
      />
      {/* INFO: The wash stays on the visible box rather than on the photo — it is answering for the contrast of what is on screen (DESIGN.md § 4.1.), not for the part of the wallpaper the keyboard has covered. */}
      <div className="absolute inset-0 bg-chat-scrim/45" />
    </div>
  );
}
