"use client";

import { cn, type Nullable } from "@/shared/lib";
import { HapticTarget } from "@/shared/ui";
import { Delete } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

export type PinKeypadProps = {
  className?: string;
  title: string;
  subtitle?: Nullable<string>;
  errorMessage?: Nullable<string>;
  isSubmitting?: boolean;
  isLocked?: boolean;
  shakeKey?: number;
  footer?: ReactNode;
  onComplete: (pin: string) => void;
};

const DIGIT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function PinKeypad({
  className,
  title,
  subtitle,
  errorMessage,
  isSubmitting = false,
  isLocked = false,
  shakeKey = 0,
  footer,
  onComplete,
}: PinKeypadProps) {
  const [digits, setDigits] = useState("");
  const [prevTitle, setPrevTitle] = useState(title);
  const [prevShakeKey, setPrevShakeKey] = useState(shakeKey);

  // INFO: Reset digits during render when title or shakeKey changes (React adjusting state from props).
  if (title !== prevTitle || shakeKey !== prevShakeKey) {
    setPrevTitle(title);
    setPrevShakeKey(shakeKey);
    setDigits("");
  }

  const handleAddDigit = useCallback(
    (digit: string) => {
      if (isSubmitting || isLocked) {
        return;
      }
      setDigits((prev) => {
        if (prev.length >= 6) {
          return prev;
        }
        const next = prev + digit;
        if (next.length === 6) {
          onComplete(next);
        }
        return next;
      });
    },
    [isSubmitting, isLocked, onComplete],
  );

  const handleBackspace = useCallback(() => {
    if (isSubmitting || isLocked) {
      return;
    }
    setDigits((prev) => prev.slice(0, -1));
  }, [isSubmitting, isLocked]);

  const handleClear = useCallback(() => {
    if (isSubmitting || isLocked) {
      return;
    }
    setDigits("");
  }, [isSubmitting, isLocked]);

  // INFO: Supports physical keyboard input on desktop without ever opening mobile soft keyboard.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || isSubmitting || isLocked) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      if (event.key >= "0" && event.key <= "9") {
        event.preventDefault();
        handleAddDigit(event.key);
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        handleBackspace();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        handleClear();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleAddDigit, handleBackspace, handleClear, isLocked, isSubmitting]);

  const isActionDisabled = digits.length === 0 || isSubmitting || isLocked;
  const isDigitDisabled = digits.length >= 6 || isSubmitting || isLocked;

  return (
    <div className={cn("flex w-full flex-col items-center select-none", className)}>
      <h2 className="text-center text-display-md text-ink">{title}</h2>

      <div className="mt-1.5 flex min-h-[20px] items-center justify-center">
        {errorMessage ? (
          <p
            className="text-center text-body-sm text-semantic-error"
            role="status"
            aria-live="polite"
          >
            {errorMessage}
          </p>
        ) : subtitle ? (
          <p className="text-center text-body-sm text-meta">{subtitle}</p>
        ) : null}
      </div>

      {/* 6 indicator dots */}
      <div
        key={shakeKey}
        className={cn(
          "my-8 flex items-center justify-center gap-4",
          shakeKey > 0 ? "animate-wax-shake" : "",
        )}
        aria-hidden="true"
      >
        {Array.from({ length: 6 }).map((_, index) => {
          const isFilled = index < digits.length;
          return (
            <span
              key={index}
              className={cn(
                "h-3.5 w-3.5 rounded-full transition-all duration-150",
                isFilled
                  ? "scale-105 bg-primary"
                  : "border border-hairline-strong bg-surface-strong",
              )}
            />
          );
        })}
      </div>

      {/* 3x4 Touch Number Pad */}
      <div className="mx-auto grid w-full max-w-[320px] grid-cols-3 gap-x-4 gap-y-2">
        {DIGIT_KEYS.map((digit) => (
          <HapticTarget key={digit} className="flex w-full" keepsFocus isTicking={!isDigitDisabled}>
            <button
              className="flex h-16 w-full items-center justify-center rounded-2xl text-display-lg text-ink tabular-nums transition-colors select-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-pressed disabled:pointer-events-none disabled:text-meta-soft"
              type="button"
              disabled={isDigitDisabled}
              onClick={() => handleAddDigit(digit)}
            >
              {digit}
            </button>
          </HapticTarget>
        ))}

        {/* Row 4: 전체 삭제, 0, Backspace */}
        <HapticTarget className="flex w-full" keepsFocus isTicking={!isActionDisabled}>
          <button
            className="flex h-16 w-full items-center justify-center rounded-2xl text-body-sm font-medium text-meta transition-colors select-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-pressed disabled:pointer-events-none disabled:text-meta-soft"
            type="button"
            disabled={isActionDisabled}
            onClick={handleClear}
          >
            전체 삭제
          </button>
        </HapticTarget>

        <HapticTarget className="flex w-full" keepsFocus isTicking={!isDigitDisabled}>
          <button
            className="flex h-16 w-full items-center justify-center rounded-2xl text-display-lg text-ink tabular-nums transition-colors select-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-pressed disabled:pointer-events-none disabled:text-meta-soft"
            type="button"
            disabled={isDigitDisabled}
            onClick={() => handleAddDigit("0")}
          >
            0
          </button>
        </HapticTarget>

        <HapticTarget className="flex w-full" keepsFocus isTicking={!isActionDisabled}>
          <button
            className="flex h-16 w-full items-center justify-center rounded-2xl text-ink transition-colors select-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-pressed disabled:pointer-events-none disabled:text-meta-soft"
            type="button"
            disabled={isActionDisabled}
            aria-label="한 글자 지우기"
            onClick={handleBackspace}
          >
            <Delete className="size-6" />
          </button>
        </HapticTarget>
      </div>

      {footer && <div className="mt-6 flex w-full justify-center">{footer}</div>}
    </div>
  );
}
