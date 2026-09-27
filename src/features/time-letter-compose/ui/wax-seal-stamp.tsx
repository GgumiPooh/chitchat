"use client";

import type { TimeLetterTheme } from "@/entities/time-letter";
import { cn, type Nullable } from "@/shared/lib";
import { Check, Mail } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export type WaxSealStampProps = {
  className?: string;
  isSealing: boolean;
  isCompleted?: boolean;
  theme?: TimeLetterTheme;
  onAnimationComplete?: () => void;
};

export function WaxSealStamp({
  className,
  isSealing,
  isCompleted = false,
  theme = "classic",
  onAnimationComplete,
}: WaxSealStampProps) {
  const [isStamped, setIsStamped] = useState(false);
  const body = useSyncExternalStore(subscribe, readBody, readServerBody);

  useEffect(() => {
    if (!isSealing) {
      return;
    }

    // INFO: Trigger first haptic vibration when folding starts
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate?.(40);
      } catch {
        // INFO: Silently ignore devices that block vibrate
      }
    }

    const stampTimer = setTimeout(() => {
      setIsStamped(true);
      // INFO: Stronger impact vibration when wax seal stamps down
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate?.([50, 40, 80]);
        } catch {
          // INFO: Ignore
        }
      }
    }, 600);

    return () => {
      clearTimeout(stampTimer);
      setIsStamped(false);
    };
  }, [isSealing]);

  useEffect(() => {
    if (!isCompleted) {
      return;
    }

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate?.(60);
      } catch {
        // INFO: Ignore
      }
    }

    const finishTimer = setTimeout(() => {
      onAnimationComplete?.();
    }, 600);

    return () => {
      clearTimeout(finishTimer);
    };
  }, [isCompleted, onAnimationComplete]);

  const activeStep: "finished" | "folding" | "idle" | "stamped" = !isSealing
    ? "idle"
    : isCompleted
      ? "finished"
      : isStamped
        ? "stamped"
        : "folding";

  if (!isSealing || !body || activeStep === "idle") {
    return null;
  }

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[70] flex flex-col items-center justify-center bg-scrim/60 p-md backdrop-blur-xs transition-opacity duration-300",
        className,
      )}
      aria-label="편지 봉인 진행 중"
      aria-live="polite"
    >
      <div className="relative flex flex-col items-center [perspective:1000px]">
        {/* Envelope back & folding card */}
        <div
          className={cn(
            "relative flex h-48 w-72 flex-col items-center justify-center overflow-hidden rounded-lg border border-hairline-strong bg-surface-soft p-md shadow-2xl transition-all duration-700 ease-out",
            theme === "midnight" && "border-hairline/25 bg-surface-soft-private",
            theme === "romantic" && "border-primary/30 bg-primary-tint/50",
            theme === "kraft" && "border-hairline-strong bg-surface-strong/80",
            activeStep === "folding" && "scale-95 rotate-x-12",
            (activeStep === "stamped" || activeStep === "finished") && "scale-100 rotate-x-0",
          )}
        >
          {/* Subtle envelope lines */}
          <div className="pointer-events-none absolute inset-0 opacity-30">
            <svg className="h-full w-full" fill="none" viewBox="0 0 288 192">
              <path
                className="text-hairline-strong"
                d="M0 0 L144 110 L288 0 M0 192 L110 95 M288 192 L178 95"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </div>

          <Mail
            className={cn(
              "size-8 text-meta-soft transition-transform duration-500",
              activeStep === "folding" && "scale-90 opacity-60",
              (activeStep === "stamped" || activeStep === "finished") && "scale-100 opacity-90",
            )}
            aria-hidden
          />

          {/* Stamped Wax Seal */}
          <div
            className={cn(
              "absolute z-10 flex size-20 items-center justify-center rounded-full transition-all duration-300 ease-out",
              "border-2 border-on-primary/20 bg-primary text-on-primary shadow-xl",
              activeStep === "folding" && "-translate-y-6 scale-150 opacity-0",
              (activeStep === "stamped" || activeStep === "finished") &&
                "translate-y-0 scale-100 opacity-100",
            )}
            style={{
              boxShadow:
                "0 10px 25px -3px rgba(182, 92, 78, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.3)",
            }}
          >
            {/* Concentric inner embossed ring */}
            <div className="absolute inset-1.5 flex items-center justify-center rounded-full border border-dashed border-on-primary/40">
              {activeStep === "finished" ? (
                <Check className="size-8 animate-in text-on-primary duration-200 zoom-in-50" />
              ) : (
                <span className="text-xl font-bold tracking-widest text-on-primary select-none">
                  📮
                </span>
              )}
            </div>

            {/* Ripple ring effect when stamping */}
            {activeStep === "stamped" && (
              <span className="pointer-events-none absolute inset-0 animate-ping rounded-full border-2 border-primary duration-700" />
            )}
          </div>
        </div>

        {/* Status text */}
        <p className="animate-fade-in mt-lg text-center text-title-sm font-medium tracking-tight text-on-scrim">
          {activeStep === "folding" && "편지를 접어 타임캡슐에 넣고 있어요..."}
          {activeStep === "stamped" && "붉은 왁스 인장으로 소중히 봉인하는 중..."}
          {activeStep === "finished" && "편지가 안전하게 봉인되었어요!"}
        </p>
      </div>
    </div>,
    body,
  );
}

const subscribe = () => () => {};

function readBody(): Nullable<HTMLElement> {
  return typeof document !== "undefined" ? document.body : null;
}

function readServerBody(): Nullable<HTMLElement> {
  return null;
}
