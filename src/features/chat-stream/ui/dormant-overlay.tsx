"use client";

import { cn } from "@/shared/lib";
import { ShellOverlay } from "@/shared/ui";
import { Moon } from "lucide-react";

export type DormantOverlayProps = {
  className?: string;
  bodyClassName?: string;
  onWake: () => void;
};

/**
 * REQUIREMENTS.md § 8.4.1. Shown while the stream is dropped for idleness, and
 * dismissed by touching it anywhere — the touch is what reopens the connection.
 *
 * WARN: `absolute`, never `fixed` (AGENTS.md § 4.4.). `ShellOverlay` is what puts
 * it over the floating header and the tab bar (DESIGN.md § 3.5.1.).
 */
export function DormantOverlay({ className, bodyClassName, onWake }: DormantOverlayProps) {
  return (
    <ShellOverlay>
      <button
        className={cn(
          "absolute inset-0 z-50 flex flex-col items-center justify-center px-lg text-center",
          // WARN: DESIGN.md § 7.17. Its own surface, deliberately thinner than the `glass` of § 3.5.1. That utility is for floating chrome sitting on content; this covers the content, and at `glass` weight the screen behind it is gone rather than merely paused.
          "bg-canvas/45 backdrop-blur-md",
          // INFO: DESIGN.md § 3.2. No `hover:` — the surface is the whole screen, so a state change on entry would fire wherever the pointer happened to be.
          "outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-canvas/60",
          className,
        )}
        type="button"
        // WARN: DESIGN.md § 7.17. Focus is taken on mount, not merely made available. It is usually still in the composer when this arrives, and the keystrokes that follow would go into a field the user can no longer see.
        autoFocus
        onClick={onWake}
      >
        <span className={cn("flex flex-col items-center gap-xs", bodyClassName)}>
          <Moon className="size-8 text-meta" aria-hidden />
          <span className="text-display-sm text-ink">절전 모드</span>
          <span className="text-body-sm text-meta">
            한동안 쓰지 않아 실시간 연결을 잠시 끊었어요.
          </span>
          <span className="text-caption text-meta">화면을 누르면 다시 이어져요</span>
        </span>
      </button>
    </ShellOverlay>
  );
}
