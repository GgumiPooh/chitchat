"use client";

import { toMediaUrl } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { PreloadImage } from "@/shared/ui";

export type ChatBackdropProps = {
  className?: string;
  mediaId: string;
  /**
   * REQUIREMENTS.md § 9. The wallpaper's stored hash, and the largest asset any
   * screen loads — so it is the one placeholder a reader spends real time on.
   *
   * WARN: § 12.2. It is also the hash `useChromeTint` has already published a colour
   * from. Withheld here, the two bars are tinted with the photo while the screen they
   * border is still flat `chat-canvas` — the shade-off-the-room failure DESIGN.md
   * § 3.3. exists to prevent, for the whole of the download.
   *
   * WARN: No `blurhashRatio` goes with it, so the hash decodes square (DESIGN.md § 7.8.). The wallpaper reaches this screen as an id and a hash (`ChatStreamProvider`) with no `media` row behind them, so the shape the photo will be cropped to is not knowable here.
   */
  blurhash?: Nullable<string>;
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
export function ChatBackdrop({ className, mediaId, blurhash }: ChatBackdropProps) {
  return (
    // WARN: `absolute`, never `fixed` — the room is a bounded box inside the § 3.4. chat screen, so this already spans exactly what is on screen. Going `fixed` would only take it out of the wash's own stacking order.
    // WARN: `overflow-hidden` is what lets the photo below stand taller than this box without extending the room's scroll range — a phantom scroll on the one screen that must not have one.
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {/* INFO: `original`, not the thumbnail. This is drawn across the whole screen, where § 9.'s 720px long edge would be visibly soft. */}
      {/* WARN: No skeleton. The flat `chat-canvas` *is* the room's own floor, so a load that has not landed reads as a wallpaper that was never set; a pulsing plate the size of the screen behind the conversation is louder than the swap it covers. The hash below is the opposite case and replaces it outright (DESIGN.md § 7.8.) — it is the photo rather than a plate over it. */}
      {/* WARN: DESIGN.md § 3.4. The **large** viewport, and top-anchored — the one thing in the shell that must not follow the keyboard. Sized to the shell it is `object-cover` over a box that loses a third of its height, so every frame of the keyboard sliding re-crops and rescales the wallpaper behind the conversation. Held at its resting height it is simply clipped by the box above, and the photo does not move at all. */}
      {/* WARN: `lvh` and not the visual viewport, `dvh`, or `documentElement.clientHeight` — a keyboard moves every one of those on one engine or the other, `dvh` and the layout viewport under Chromium's `interactive-widget=resizes-content` (which this app sets). */}
      {/* WARN: No `crossOrigin`, and never again. It existed only to feed a canvas read of this photo's average colour, which `useChromeTint` now takes off the § 9. blurhash instead — and in CORS mode a bucket whose rules do not name this origin turns a lost tint into a lost *wallpaper*, because the image errors and `PreloadImage` falls to its failure state. It also cost the § 12.2. preload, which asks for the plain response: the two are cached separately, so the room downloaded the full-size photo twice. */}
      <PreloadImage
        className="absolute inset-x-0 top-0 h-[100lvh]"
        imgClassName="size-full object-cover"
        placeholderClassName="bg-chat-canvas"
        src={toMediaUrl(mediaId, "original")}
        blurhash={blurhash}
        hasSkeleton={false}
        alt=""
      />
      {/* INFO: The wash stays on the visible box rather than on the photo — it is answering for the contrast of what is on screen (DESIGN.md § 4.1.), not for the part of the wallpaper the keyboard has covered. */}
      {/* WARN: `useChromeTint` carries this same 45%, because the colour bordering iOS 26's chrome is the photo under this wash and not the photo. Changing it here alone leaves the status bar a shade off the room it is meant to disappear into. */}
      <div className="absolute inset-0 bg-chat-scrim/45" />
    </div>
  );
}
