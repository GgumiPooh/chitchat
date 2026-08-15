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
 * REQUIREMENTS.md § 8.4.1. Shown while the app is dormant **and** the window is
 * visible, and dismissed by touching it anywhere — the touch reopens the request
 * gate.
 *
 * WARN: `absolute`, never `fixed` — `ShellOverlay` owns the viewport-sized box this
 * fills (DESIGN.md § 3.3.), and it is what puts this over the floating header and the
 * tab bar (§ 3.5.1.).
 */
export function DormantOverlay({ className, bodyClassName, onWake }: DormantOverlayProps) {
  return (
    // WARN: DESIGN.md § 3.5.1. The raise belongs on the layer, never on the button. `ShellOverlay` is `fixed` and seals its children into a stacking context of their own, so a `z-` inside it is resolved against nothing — this has to outrank the other overlays' layers, and it can only do that from here. Still under the `z-50` the `body`-level sheets are portalled at.
    <ShellOverlay className="z-[45]">
      <button
        className={cn(
          "pointer-events-auto absolute inset-0 flex flex-col items-center justify-center px-lg text-center",
          // WARN: DESIGN.md § 7.17. Its own surface, deliberately thinner than the `glass` of § 3.5.1. That utility is for floating chrome sitting on content; this covers the content, and at `glass` weight the screen behind it is gone rather than merely paused.
          "bg-canvas/45 backdrop-blur-md",
          // INFO: DESIGN.md § 3.2. No `hover:` — the surface is the whole screen, so a state change on entry would fire wherever the pointer happened to be.
          // WARN: DESIGN.md § 3.2. And no focus ring either, which is the one place that exception is right. This takes focus on mount, so the inset ring drew a primary border around the entire viewport the moment 절전 모드 arrived — a frame around the app rather than an affordance on a control. 화면을 누르면 다시 이어져요 is what says it is pressable.
          "outline-none active:bg-canvas/60",
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
          {/* INFO: DESIGN.md § 7.17. 서버 연결 rather than 실시간 연결, though this only ever stands over 채팅 — what a sleep shuts is every request the app makes, not just the stream behind this screen. */}
          <span className="text-body-sm text-meta">
            한동안 쓰지 않아 서버 연결을 잠시 끊었어요.
          </span>
          <span className="text-caption text-meta">화면을 누르면 다시 이어져요</span>
        </span>
      </button>
    </ShellOverlay>
  );
}
