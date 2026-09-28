"use client";

import { cn, countDays, formatMonthDay, formatTime } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { Eye, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

export type WaxSealUnboxingProps = {
  className?: string;
  title?: string | null;
  isSent?: boolean;
  scheduledDate?: Date | string | null;
  writtenDateStr?: string;
  onUnsealed: () => void;
  onClose?: () => void;
  onCancel?: () => void;
  onEdit?: () => void;
  onPreview?: () => void;
};

export function WaxSealUnboxing({
  className,
  title,
  isSent = false,
  scheduledDate,
  writtenDateStr,
  onUnsealed,
  onClose,
  onCancel,
  onEdit,
  onPreview,
}: WaxSealUnboxingProps) {
  const [isBreaking, setIsBreaking] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState<boolean>(false);

  const dDayStr = useMemo(() => {
    if (!scheduledDate) {
      return null;
    }
    const days = countDays(new Date(), scheduledDate);
    if (days > 0) {
      return `D-${days}`;
    }
    if (days === 0) {
      return "D-Day";
    }
    return null;
  }, [scheduledDate]);

  const scheduledDateStr = useMemo(() => {
    if (!scheduledDate) {
      return null;
    }
    const date = new Date(scheduledDate);
    return `${formatMonthDay(date)} ${formatTime(date)}`;
  }, [scheduledDate]);

  const handleSealClick = () => {
    if (isBreaking) {
      return;
    }

    if (!isSent) {
      setIsShaking(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate?.([30, 40, 30]);
        } catch {
          // INFO: Ignore
        }
      }
      toast.info("아직 개봉 시각이 되지 않아 봉인되어 있어요!");
      setTimeout(() => {
        setIsShaking(false);
      }, 360);
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
        "relative flex size-full flex-col items-center justify-between px-lg py-md select-none sm:py-lg",
        onCancel || onPreview || onEdit
          ? "min-h-[320px] sm:min-h-[340px]"
          : "min-h-[290px] sm:min-h-[310px]",
        isBreaking && "scale-[1.02]",
        className,
      )}
    >
      {/* Envelope back flap fold lines spanning the entire modal */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <svg className="size-full" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none">
          <polygon className="fill-hairline/20" points="0,0 100,0 50,52" />
          <path
            className="text-hairline-strong opacity-40"
            d="M 0 0 L 50 52 L 100 0 M 0 100 L 42 52 M 100 100 L 58 52"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {/* Top right close button on envelope */}
      {onClose && (
        <button
          className="absolute top-2.5 right-2.5 z-30 inline-flex size-8 cursor-pointer items-center justify-center rounded-full text-meta transition-colors hover:bg-surface-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-strong"
          type="button"
          aria-label="닫기"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      )}

      {/* Top header on envelope */}
      <div className="z-10 flex flex-col items-center gap-0.5 pt-1">
        <div className="flex items-center gap-1.5 text-caption font-medium text-meta">
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          <span>{isSent ? "과거에서 온 편지" : "미래로 보내는 편지"}</span>
        </div>

        {writtenDateStr && (
          <span className="text-chat-time text-meta/80">{writtenDateStr} 작성</span>
        )}

        {/* Letter preview peek */}
        {title && (
          <div className="mt-1 line-clamp-2 max-w-[290px] text-center text-title-sm font-semibold tracking-tight text-balance break-keep text-ink sm:max-w-[320px]">
            &ldquo;{title}&rdquo;
          </div>
        )}
      </div>

      {/* Interactive Wax Seal in center */}
      <button
        className={cn(
          "group relative z-20 flex size-[72px] cursor-pointer items-center justify-center rounded-full transition-transform duration-300 sm:size-20",
          "outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-95",
          isShaking && "animate-wax-shake",
        )}
        type="button"
        disabled={isBreaking}
        aria-label={isSent ? "편지 열기" : "봉인된 실링 왁스"}
        onClick={handleSealClick}
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
              <div className="absolute top-1/2 right-0 flex size-[72px] translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-dashed border-on-primary/40 sm:size-20">
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
              <div className="absolute top-1/2 left-0 flex size-[72px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-dashed border-on-primary/40 sm:size-20">
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

      {/* Bottom area: Instruction label & action buttons */}
      <div className="z-10 flex flex-col items-center gap-1.5 pb-2">
        {isSent ? (
          <p className="text-caption text-meta transition-opacity duration-300">
            {isBreaking ? "편지를 펼치고 있어요..." : "실링 왁스를 터치하여 편지 읽기"}
          </p>
        ) : (
          <div className="flex flex-col items-center gap-0.5 text-center">
            <p className="text-caption font-medium text-meta">
              {scheduledDateStr
                ? `${scheduledDateStr} 개봉 가능`
                : "개봉 예정 시각에 왁스를 풀 수 있어요"}
              {dDayStr && <span className="ml-1 text-primary">({dDayStr})</span>}
            </p>
            <p className="text-[11px] text-meta-soft">
              개봉 시각까지 안전하게 봉인 보관 중이에요 ⏳
            </p>
          </div>
        )}

        {(onPreview || onEdit || onCancel) && (
          <div className="flex items-center gap-2 pt-0.5">
            {onPreview && (
              <button
                className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-caption text-ink transition-colors hover:bg-surface-soft active:bg-surface-strong"
                type="button"
                onClick={onPreview}
              >
                <Eye className="size-3.5" />
                <span>편지 미리보기</span>
              </button>
            )}
            {onEdit && (
              <button
                className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-caption text-ink transition-colors hover:bg-surface-soft active:bg-surface-strong"
                type="button"
                onClick={onEdit}
              >
                <Pencil className="size-3.5" />
                <span>편지 수정</span>
              </button>
            )}
            {onCancel && (
              <button
                className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-caption text-semantic-error transition-colors hover:bg-semantic-error/10 active:bg-semantic-error/20"
                type="button"
                onClick={onCancel}
              >
                <Trash2 className="size-3.5" />
                <span>봉인 취소</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
