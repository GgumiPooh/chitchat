"use client";

import type { TimeLetter } from "@/entities/time-letter";
import { cn, formatDate, type UserId } from "@/shared/lib";
import { Clock, ImageIcon, Lock, MailOpen } from "lucide-react";

export type TimeLetterCardProps = {
  className?: string;
  currentUserId: UserId;
  isSelected?: boolean;
  letter: TimeLetter;
  onClick: () => void;
};

export function TimeLetterCard({
  className,
  currentUserId,
  isSelected = false,
  letter,
  onClick,
}: TimeLetterCardProps) {
  const isSender = letter.senderId === currentUserId;
  const isScheduled = letter.status === "scheduled";
  const isTeaser = isScheduled && !isSender;

  const targetDateStr = formatDate(
    isScheduled ? letter.scheduledAt : (letter.sentAt ?? letter.scheduledAt),
  );

  let senderLabel = "";
  if (isSender) {
    senderLabel = letter.onlyMe ? "나에게" : "내가 보냄";
  } else {
    senderLabel = `${letter.senderName ?? "상대방"}님이 보냄`;
  }

  const titleText = isTeaser
    ? "비밀 편지 🔒"
    : letter.title || (letter.content ? letter.content.slice(0, 30) : "제목 없는 편지");

  const previewText = isTeaser
    ? "개봉일까지 내용과 사진이 비밀로 유지돼요"
    : letter.content
      ? letter.content.slice(0, 70)
      : "";

  return (
    <button
      className={cn(
        "group flex w-full cursor-pointer flex-col gap-xs rounded-xl border p-md text-left transition-all outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary",
        isSelected
          ? "border-primary bg-primary-tint/30 dark:bg-primary-tint/20"
          : "bg-surface border-hairline hover:border-hairline-strong hover:bg-surface-soft active:bg-surface-strong",
        className,
      )}
      tabIndex={isSelected ? 0 : -1}
      type="button"
      data-letter-item
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-xs text-caption text-meta">
        <div className="flex items-center gap-1 font-medium">
          {isScheduled ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-soft px-2 py-0.5 text-primary">
              <Lock className="size-3" />
              <span>{isSender ? "봉인됨" : "전송 예정"}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-soft px-2 py-0.5 text-meta">
              <MailOpen className="size-3" />
              <span>전송됨</span>
            </span>
          )}
          <span>·</span>
          <span>{senderLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="size-3" />
          <span>{targetDateStr}</span>
        </div>
      </div>

      <h3
        className={cn(
          "line-clamp-1 text-body-md font-semibold transition-colors",
          isSelected ? "text-primary" : "text-ink",
        )}
      >
        {titleText}
      </h3>

      {previewText && (
        <p className="line-clamp-2 text-body-sm leading-relaxed text-meta">{previewText}</p>
      )}

      {letter.media && letter.media.length > 0 && !isTeaser && (
        <div className="mt-1 flex items-center gap-1 text-caption text-meta">
          <ImageIcon className="size-3.5" />
          <span>사진 {letter.media.length}장</span>
        </div>
      )}
    </button>
  );
}
