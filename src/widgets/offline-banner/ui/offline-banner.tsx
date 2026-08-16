"use client";

import { useNetworkProbe } from "@/shared/api";
import { cn, useIsOffline } from "@/shared/lib";
import { ShellOverlay } from "@/shared/ui";
import { WifiOff } from "lucide-react";

const OFFLINE_LABEL = "오프라인 모드";

export type OfflineBannerProps = {
  className?: string;
  pillClassName?: string;
};

/**
 * The standing 오프라인 모드 strip, held under the floating header for as long as
 * the device reports no network.
 *
 * WARN: DESIGN.md § 3.3. `--app-header-inset` and nothing nearer the top edge. iOS 26 Safari tints its status bar from the `fixed` element bordering the obscured content inset, so a strip pinned to the top chrome would take that tint off `body` — and off `ChatScreen`'s wallpaper (REQUIREMENTS.md § 12.2.) — for the whole session, since Safari samples once and never re-samples.
 */
export function OfflineBanner({ className, pillClassName }: OfflineBannerProps) {
  const isOffline = useIsOffline();

  // INFO: REQUIREMENTS.md § 16.2. The evidence `useIsOffline` waits for, asked for rather than waited out — and here because this is the one component the shell and the mirror each mount exactly one of.
  useNetworkProbe();

  return (
    <>
      {/* WARN: Emptied rather than unmounted, and it is the one part that outlives the strip — a live region inserted together with its text is announced only intermittently. */}
      {/* INFO: `status` rather than `alert`: nothing is lost here, so an assertive region would cut the reader off to say what the strip already shows. */}
      <p className="sr-only" role="status">
        {isOffline ? OFFLINE_LABEL : ""}
      </p>
      {isOffline && (
        // WARN: DESIGN.md § 3.5.1. `ShellOverlay` rather than a `fixed` box of its own, which is what keeps AGENTS.md § 4.4. at four elements. No `z-` on the child either — the layer is `fixed` and seals it into a stacking context, so a raise only means anything up there.
        <ShellOverlay>
          {/* WARN: Pointers are left off, inherited from the layer — this reports a state and nothing under it may stop being tappable. */}
          {/* WARN: `aria-hidden`, or the copy is announced twice over — the region above is what speaks. */}
          <div
            className={cn(
              "absolute inset-x-0 top-(--app-header-inset) flex justify-center px-md",
              className,
            )}
            aria-hidden
          >
            <div
              className={cn(
                "flex items-center gap-2xs rounded-full border border-hairline glass px-sm py-2xs shadow-floating",
                pillClassName,
              )}
            >
              <WifiOff className="size-4 shrink-0 text-meta" strokeWidth={1.75} />
              <p className="text-body-sm text-body">{OFFLINE_LABEL}</p>
            </div>
          </div>
        </ShellOverlay>
      )}
    </>
  );
}
