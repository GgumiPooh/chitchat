"use client";

import { cn, type Nullable } from "@/shared/lib";
import { HapticTarget } from "@/shared/ui";
import { Delete } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

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

const KEY_BASE_CLASS_NAME =
  "flex h-16 w-full cursor-pointer press-bloom items-center justify-center rounded-xl outline-none select-none [--press-scale:0.94] group-hover:bg-surface-strong hover:bg-surface-strong group-active:bg-surface-pressed active:bg-surface-pressed data-[pressed]:bg-surface-pressed group-data-[pressed]:bg-surface-pressed focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-meta-soft";

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
  const [pressedKey, setPressedKey] = useState<Nullable<string>>(null);
  const pressedTimerRef = useRef<Nullable<ReturnType<typeof setTimeout>>>(null);

  // INFO: Reset digits during render when title or shakeKey changes (React adjusting state from props).
  if (title !== prevTitle || shakeKey !== prevShakeKey) {
    setPrevTitle(title);
    setPrevShakeKey(shakeKey);
    setDigits("");
  }

  const triggerKeyFlash = useCallback((key: string) => {
    if (pressedTimerRef.current) {
      clearTimeout(pressedTimerRef.current);
    }
    setPressedKey(key);
    pressedTimerRef.current = setTimeout(() => {
      setPressedKey(null);
      pressedTimerRef.current = null;
    }, 140);
  }, []);

  useEffect(
    () => () => {
      if (pressedTimerRef.current) {
        clearTimeout(pressedTimerRef.current);
      }
    },
    [],
  );

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
        triggerKeyFlash(event.key);
        handleAddDigit(event.key);
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        triggerKeyFlash("backspace");
        handleBackspace();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        triggerKeyFlash("clear");
        handleClear();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleAddDigit, handleBackspace, handleClear, isLocked, isSubmitting, triggerKeyFlash]);

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
          <HapticTarget key={digit} className="flex w-full" isTicking={!isDigitDisabled}>
            <button
              className={cn(KEY_BASE_CLASS_NAME, "text-display-lg text-ink tabular-nums")}
              type="button"
              disabled={isDigitDisabled}
              data-pressed={pressedKey === digit ? "" : undefined}
              onClick={() => handleAddDigit(digit)}
            >
              {digit}
            </button>
          </HapticTarget>
        ))}

        {/* Row 4: 전체 삭제, 0, Backspace */}
        <HapticTarget className="flex w-full" isTicking={!isActionDisabled}>
          <button
            className={cn(
              KEY_BASE_CLASS_NAME,
              "text-body-sm font-medium text-meta group-hover:text-ink group-active:text-ink group-data-[pressed]:text-ink hover:text-ink active:text-ink data-[pressed]:text-ink",
            )}
            type="button"
            disabled={isActionDisabled}
            data-pressed={pressedKey === "clear" ? "" : undefined}
            onClick={handleClear}
          >
            전체 삭제
          </button>
        </HapticTarget>

        <HapticTarget className="flex w-full" isTicking={!isDigitDisabled}>
          <button
            className={cn(KEY_BASE_CLASS_NAME, "text-display-lg text-ink tabular-nums")}
            type="button"
            disabled={isDigitDisabled}
            data-pressed={pressedKey === "0" ? "" : undefined}
            onClick={() => handleAddDigit("0")}
          >
            0
          </button>
        </HapticTarget>

        <HapticTarget className="flex w-full" isTicking={!isActionDisabled}>
          <button
            className={cn(KEY_BASE_CLASS_NAME, "text-ink")}
            type="button"
            disabled={isActionDisabled}
            data-pressed={pressedKey === "backspace" ? "" : undefined}
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
