"use client";

import type { TimeLetterTheme } from "@/entities/time-letter";
import { cn } from "@/shared/lib";
import { Sparkles } from "lucide-react";
import { useState } from "react";

export type WaxSealUnboxingProps = {
  className?: string;
  theme?: TimeLetterTheme;
  title?: string | null;
  isSent?: boolean;
  onUnsealed: () => void;
};

export function WaxSealUnboxing({
  className,
  theme = "classic",
  title,
  isSent = false,
  onUnsealed,
}: WaxSealUnboxingProps) {
  const [isBreaking, setIsBreaking] = useState<boolean>(false);

  const handleBreakSeal = () => {
    if (isBreaking) {
      return;
    }

    setIsBreaking(true);

    // INFO: Haptic tick on breaking seal
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate?.([40, 50, 70]);
      } catch {
        // INFO: Ignore
      }
    }

    setTimeout(() => {
      onUnsealed();
    }, 900);
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-md py-xl [perspective:1000px]",
        className,
      )}
    >
      {/* 3D Envelope */}
      <div
        className={cn(
          "relative flex h-52 w-72 flex-col items-center justify-between overflow-hidden rounded-xl border border-hairline-strong p-md shadow-xl transition-all duration-700 ease-out select-none",
          theme === "classic" && "border-hairline-strong bg-canvas text-ink",
          theme === "romantic" && "border-primary/30 bg-primary-tint/40 text-ink",
          theme === "midnight" &&
            "border-hairline/25 bg-surface-soft-private text-bubble-private-ink",
          theme === "kraft" && "border-hairline-strong bg-surface-strong/70 text-ink",
          isBreaking && "scale-105 shadow-2xl",
        )}
      >
        {/* Envelope back flap fold lines */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl opacity-25">
          <svg className="h-full w-full" viewBox="0 0 288 208" fill="none">
            <path
              className="text-hairline-strong"
              d="M0 0 L144 115 L288 0 M0 208 L115 105 M288 208 L173 105"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </div>

        {/* Top header on envelope */}
        <div className="z-10 flex items-center gap-1.5 text-caption text-meta">
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          <span>{isSent ? "도착한 타임머신 편지" : "전송된 타임머신 편지"}</span>
        </div>

        {/* Letter preview peek */}
        {title && (
          <div className="z-10 line-clamp-2 max-w-[85%] text-center text-title-sm font-semibold tracking-tight">
            &ldquo;{title}&rdquo;
          </div>
        )}

        {/* Interactive Wax Seal in center */}
        <button
          className={cn(
            "group relative z-20 flex size-20 cursor-pointer items-center justify-center rounded-full transition-transform duration-300",
            "outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-95",
          )}
          type="button"
          disabled={isBreaking}
          aria-label={isSent ? "편지 열기" : "편지 봉인 해제하기"}
          onClick={handleBreakSeal}
        >
          {/* Breaking seal fragments */}
          {isBreaking ? (
            <div className="relative size-full">
              {/* Left half breaking */}
              <div
                className={cn(
                  "absolute inset-y-0 left-0 w-1/2 overflow-hidden rounded-l-full bg-primary transition-all duration-700 ease-out",
                  "-translate-x-6 -translate-y-2 -rotate-24 opacity-0",
                )}
                style={{
                  boxShadow: "inset 0 2px 4px rgba(255, 255, 255, 0.3)",
                }}
              >
                <div className="absolute top-1/2 right-0 flex size-20 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-dashed border-on-primary/40">
                  <span className="text-xl font-bold text-on-primary">📮</span>
                </div>
              </div>

              {/* Right half breaking */}
              <div
                className={cn(
                  "absolute inset-y-0 right-0 w-1/2 overflow-hidden rounded-r-full bg-primary transition-all duration-700 ease-out",
                  "translate-x-6 translate-y-2 rotate-24 opacity-0",
                )}
                style={{
                  boxShadow: "inset 0 2px 4px rgba(255, 255, 255, 0.3)",
                }}
              >
                <div className="absolute top-1/2 left-0 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-dashed border-on-primary/40">
                  <span className="text-xl font-bold text-on-primary">📮</span>
                </div>
              </div>
            </div>
          ) : (
            /* Intact Wax Seal */
            <div
              className="flex size-full items-center justify-center rounded-full border-2 border-on-primary/20 bg-primary text-on-primary shadow-xl transition-shadow group-hover:shadow-2xl"
              style={{
                boxShadow:
                  "0 10px 25px -3px rgba(182, 92, 78, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.3)",
              }}
            >
              <div className="absolute inset-1.5 flex items-center justify-center rounded-full border border-dashed border-on-primary/40">
                <span className="text-2xl font-bold text-on-primary drop-shadow-xs select-none">
                  📮
                </span>
              </div>
            </div>
          )}
        </button>

        {/* Instruction label */}
        <p className="z-10 text-caption text-meta transition-opacity duration-300">
          {isBreaking
            ? isSent
              ? "편지를 펼치고 있어요..."
              : "봉인을 해제하고 있어요..."
            : isSent
              ? "실링 왁스를 터치하여 편지 읽기"
              : "실링 왁스를 터치하여 봉인 해제"}
        </p>
      </div>
    </div>
  );
}
