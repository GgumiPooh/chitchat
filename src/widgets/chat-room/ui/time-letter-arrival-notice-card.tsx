"use client";

import type { ChatMessage } from "@/entities/message";
import { TIME_LETTERS_ROUTE } from "@/shared/config";
import {
  cn,
  formatTime,
  idToDate,
  LONG_PRESS_TARGET_CLASS,
  toDayKey,
  useLongPress,
  type LongPressPoint,
  type Nullable,
} from "@/shared/lib";
import { HapticTarget, Link } from "@/shared/ui";
import { ChevronRight, Mail, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

export type TimeLetterArrivalNoticeCardProps = {
  className?: string;
  cardClassName?: string;
  message: ChatMessage;
  senderName: string;
  isMine?: boolean;
  isSelecting?: boolean;
  onOpen?: () => void;
  onLongPress?: (anchor: HTMLElement, point: LongPressPoint) => void;
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
  isSelecting = false,
  onOpen,
  onLongPress,
}: TimeLetterArrivalNoticeCardProps) {
  const router = useRouter();
  const { letterId, title } = parseNoticeData(message.text);
  const href = letterId ? `${TIME_LETTERS_ROUTE}?id=${letterId}` : TIME_LETTERS_ROUTE;

  const writtenDate = letterId ? idToDate(letterId) : new Date(message.createdAt);
  const writtenDateStr = `${toDayKey(writtenDate).replace(/-/g, ".")} 작성`;
  const timeString = formatTime(message.createdAt);
  const hasTitle = Boolean(title.trim());

  const daysDiff = Math.max(
    0,
    Math.floor(
      (new Date(message.createdAt).getTime() - writtenDate.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );

  let elapsedText = "";
  if (daysDiff >= 365) {
    const years = Math.floor(daysDiff / 365);
    elapsedText = `${years}년 전 `;
  } else if (daysDiff >= 30) {
    const months = Math.floor(daysDiff / 30);
    elapsedText = `${months}개월 전 `;
  } else if (daysDiff > 0) {
    elapsedText = `${daysDiff}일 전 `;
  }

  const formattedSender = senderName.endsWith("님") ? senderName : `${senderName}님`;
  const senderTitle = isMine ? "과거의 나 (타임머신)" : `${formattedSender}의 타임머신`;

  const longPressHandlers = useLongPress(
    !isSelecting && onLongPress ? (point, element) => onLongPress(element, point) : undefined,
  );

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (onOpen) {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div className={cn("group/row flex items-start gap-xs px-md pt-sm", className)}>
      {/* 1. Time Machine Postman Avatar */}
      <HapticTarget keepsScroll>
        <button
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary-tint text-primary shadow-xs ring-1 ring-primary/25 transition-transform outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-95"
          type="button"
          aria-label="타임머신 보관함 열기"
          onClick={() => router.push(TIME_LETTERS_ROUTE)}
        >
          <Mail className="size-4.5 text-primary" strokeWidth={2} />
        </button>
      </HapticTarget>

      {/* 2. Main Column */}
      <div
        className={cn(
          "relative flex flex-col gap-2xs transition-[max-width] duration-(--duration-state) ease-out motion-reduce:transition-none",
          isSelecting ? "max-w-[calc(100%-84px)]" : "max-w-[calc(100%-44px)]",
        )}
      >
        {/* Sender Name */}
        <span className="px-2xs text-chat-name text-chat-sender [[data-wallpaper]_&]:on-wallpaper">
          {senderTitle}
        </span>

        {/* Card + Time beside it */}
        <div className="flex max-w-full items-end gap-2xs">
          <Link
            className={cn(
              "group relative flex w-full max-w-[340px] cursor-pointer flex-col overflow-hidden rounded-2xl border p-md text-left transition-all outline-none",
              "shadow-card border-primary/30 bg-canvas",
              "hover:border-primary/50 hover:shadow-floating active:scale-[0.99]",
              "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              LONG_PRESS_TARGET_CLASS,
              cardClassName,
            )}
            href={href}
            onClick={handleClick}
            {...longPressHandlers}
          >
            {/* Top Header Badge & Written Date */}
            <div className="flex items-center justify-between gap-xs">
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-tint/70 px-2 py-0.5 text-caption font-semibold whitespace-nowrap text-primary">
                <Sparkles className="size-3 text-primary" aria-hidden />
                <span>타임머신 도착</span>
              </span>
              <span className="shrink-0 text-caption font-medium whitespace-nowrap text-meta">
                {writtenDateStr}
              </span>
            </div>

            {/* Sender announcement & Title */}
            <div className="mt-sm flex flex-col gap-1">
              <p className="text-caption text-meta">
                {isMine ? (
                  <span>내가 {elapsedText}과거에서 보낸 편지예요</span>
                ) : (
                  <>
                    <span className="font-semibold text-ink">{senderName}</span>님이 {elapsedText}
                    과거에서 보낸 편지예요
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
                <span className="text-button-sm font-semibold text-ink">
                  실링 왁스 풀고 개봉하기
                </span>
              </div>
              <ChevronRight className="size-4 text-meta transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
          </Link>

          {/* Time beside bubble */}
          <div className="flex flex-col items-start pb-0.5 text-chat-time text-meta select-none">
            <time dateTime={message.createdAt}>{timeString}</time>
          </div>
        </div>
      </div>
    </div>
  );
}
