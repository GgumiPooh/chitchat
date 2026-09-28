"use client";

import type { ChatMessage } from "@/entities/message";
import { TIME_LETTERS_ROUTE } from "@/shared/config";
import { cn, formatTime, type Nullable } from "@/shared/lib";
import { Link } from "@/shared/ui";
import { ChevronRight, Mail, Sparkles } from "lucide-react";
import type { MouseEvent } from "react";

export type TimeLetterArrivalNoticeCardProps = {
  className?: string;
  cardClassName?: string;
  message: ChatMessage;
  senderName: string;
  isMine?: boolean;
  onOpen?: () => void;
};

type TimeLetterNoticeData = {
  letterId: string;
  title: string;
};

function parseNoticeData(rawText: Nullable<string>): TimeLetterNoticeData {
  if (!rawText) {
    return { letterId: "", title: "" };
  }

  try {
    const parsed = JSON.parse(rawText) as { letterId?: string; title?: string };
    return {
      letterId: parsed.letterId ?? "",
      title: parsed.title ?? "",
    };
  } catch {
    return {
      letterId: rawText,
      title: "",
    };
  }
}

export function TimeLetterArrivalNoticeCard({
  className,
  cardClassName,
  message,
  senderName,
  isMine = false,
  onOpen,
}: TimeLetterArrivalNoticeCardProps) {
  const { letterId, title } = parseNoticeData(message.text);
  const href = letterId ? `${TIME_LETTERS_ROUTE}?id=${letterId}` : TIME_LETTERS_ROUTE;
  const timeString = formatTime(message.createdAt);
  const hasTitle = Boolean(title.trim());

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (onOpen) {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div className={cn("flex justify-center px-md py-sm", className)}>
      <Link
        className={cn(
          "group relative flex w-full max-w-[340px] cursor-pointer flex-col overflow-hidden rounded-2xl border p-md text-left transition-all outline-none",
          "shadow-card border-primary/30 bg-canvas",
          "hover:border-primary/50 hover:shadow-floating active:scale-[0.99]",
          "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          cardClassName,
        )}
        href={href}
        onClick={handleClick}
      >
        {/* Top Header Badge & Date */}
        <div className="flex items-center justify-between gap-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-tint/70 px-2.5 py-0.5 text-caption font-semibold text-primary">
            <Sparkles className="size-3.5 text-primary" aria-hidden />
            <span>타임머신 편지 도착</span>
          </span>
          <span className="text-caption text-meta">{timeString}</span>
        </div>

        {/* Sender announcement & Title */}
        <div className="mt-sm flex flex-col gap-1">
          <p className="text-caption text-meta">
            {isMine ? (
              <span>내가 과거에서 보낸 편지예요</span>
            ) : (
              <>
                <span className="font-semibold text-ink">{senderName}</span>님이 과거에서 보낸
                편지예요
              </>
            )}
          </p>
          <h4 className="line-clamp-2 text-body-md leading-snug font-bold tracking-tight text-ink">
            {hasTitle ? `“${title}”` : "비밀스럽게 봉인된 편지 💌"}
          </h4>
        </div>

        {/* Action Callout Button */}
        <div className="mt-md flex items-center justify-between rounded-xl bg-surface-soft px-3 py-2.5 transition-colors group-hover:bg-primary-tint/40">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full bg-primary text-on-primary shadow-xs">
              <Mail className="size-3.5" />
            </div>
            <span className="text-button-sm font-semibold text-ink">실링 왁스 풀고 개봉하기</span>
          </div>
          <ChevronRight className="size-4 text-meta transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
      </Link>
    </div>
  );
}
