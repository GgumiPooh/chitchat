import { cn } from "@/shared/lib";

export type PrivateRingProps = {
  className?: string;
};

/**
 * REQUIREMENTS.md § 16.1. 나에게만 보내기's ring on a bubble-less attachment — a
 * layered overlay rather than a ring/border on the box it decorates. An inset ring
 * on a wrapper paints *under* a same-size child that fills it exactly (an
 * emoticon's image, a photo's `object-cover`) and is invisible until an
 * `active:scale` transform opens a gap for it to show through; an outward one is
 * clipped away by whichever ancestor's `overflow-hidden` gives the tile its rounded
 * corners. **Neither escape works by moving the ring onto the `<img>`/`<video>`
 * itself, either** — a replaced element's own decoded content paints over its own
 * inset `box-shadow` the same way a same-size child does, confirmed against
 * Chrome's computed styles (the shadow is there; nothing of it is visible).
 * Painted last, on top of the content, this overlay is covered by none of the three.
 *
 * WARN: The caller's own box must be `position: relative` (or another positioning
 * context) — `inset-0` sizes this to it — and pass whatever `rounded-*` that box
 * carries, since this has no radius of its own to inherit.
 *
 * WARN: Lives in `shared/ui` rather than beside any one caller. `widgets/chat-room`
 * and `widgets/archive-shelves` both draw it and a widget cannot import a sibling
 * widget (REQUIREMENTS.md § 2.), so this is what the two share.
 */
export function PrivateRing({ className }: PrivateRingProps) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute inset-0 border-[2px] border-ring-private",
        className,
      )}
      aria-hidden
    />
  );
}
