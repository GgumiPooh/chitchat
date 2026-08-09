"use client";

import { cn } from "@/shared/lib";
import { Upload } from "lucide-react";

export type FileDropOverlayProps = {
  className?: string;
  labelClassName?: string;
  isActive: boolean;
  /** What the drop lands in, said in the screen's own words — the composer attaches, the library adds. Required, so a new drop surface cannot silently inherit another screen's copy. */
  label: string;
};

/**
 * What a drag over the drop target looks like (REQUIREMENTS.md § 9.2.).
 *
 * WARN: `pointer-events-none` throughout, and it is load-bearing rather than
 * tidiness. An overlay that takes pointer events appears under the cursor mid-drag,
 * which the browser reports to the target below as a `dragleave` — the overlay then
 * unmounts, the pointer is over the target again, and the whole thing flickers at
 * frame rate while the drop never lands.
 */
export function FileDropOverlay({
  className,
  labelClassName,
  isActive,
  label,
}: FileDropOverlayProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-md transition-opacity duration-150",
        // WARN: Kept mounted wherever the fade is wanted — the transition needs both ends of it in the tree. A shelf is the exception and mounts this only while the drag is over it, because its `ShellOverlay` costs 보관함 the translucent chrome for as long as one is up (DESIGN.md § 3.3.); it arrives at `opacity-100` with no fade, which is the price of that.
        isActive ? "opacity-100" : "opacity-0",
        className,
      )}
      aria-hidden
    >
      <div className="absolute inset-2xs rounded-lg border-2 border-dashed border-primary bg-scrim/20" />
      <span
        className={cn(
          "relative inline-flex items-center gap-2xs rounded-full border border-hairline glass px-md py-xs text-body-sm text-ink shadow-floating",
          labelClassName,
        )}
      >
        <Upload className="size-4 text-primary" strokeWidth={1.75} />
        {label}
      </span>
    </div>
  );
}
