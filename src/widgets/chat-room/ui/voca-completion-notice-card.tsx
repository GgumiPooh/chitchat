"use client";

import type { ChatMessage, MessageReaction } from "@/entities/message";
import { ReactionBadges, type ReactionPayload } from "@/features/react-message";
import { VOCA_ROUTE } from "@/shared/config";
import {
  cn,
  formatTime,
  LONG_PRESS_TARGET_CLASS,
  useLongPress,
  type LongPressPoint,
  type UserId,
} from "@/shared/lib";
import { HapticTarget, Link } from "@/shared/ui";
import { josa } from "es-hangul";
import { Bookmark, BookOpen, ChevronRight, Heart, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

export type VocaCompletionNoticeCardProps = {
  className?: string;
  cardClassName?: string;
  message: ChatMessage;
  senderName: string;
  currentUserId?: UserId;
  isMine?: boolean;
  isSelecting?: boolean;
  isBookmarked?: boolean;
  unreadCount?: number;
  readerTotal?: number;
  reactions?: MessageReaction[];
  onToggleReaction?: (reaction: ReactionPayload) => void;
  onOpen?: () => void;
  onLongPress?: (anchor: HTMLElement, point: LongPressPoint) => void;
};

export function VocaCompletionNoticeCard({
  className,
  cardClassName,
  message,
  senderName,
  currentUserId,
  isMine = false,
  isSelecting = false,
  isBookmarked = false,
  unreadCount = 0,
  readerTotal = 0,
  reactions = [],
  onToggleReaction,
  onOpen,
  onLongPress,
}: VocaCompletionNoticeCardProps) {
  const router = useRouter();
  const count = message.text ?? "0";
  const timeString = formatTime(message.createdAt);

  const baseName =
    senderName.endsWith("님") && senderName.length > 1 ? senderName.slice(0, -1) : senderName;
  const isSelf = baseName === "나";
  const honorific = isSelf ? "나" : `${baseName}님`;
  const senderTitle = "단어장 알리미";
  const subjectParticle = isSelf ? "가" : josa.pick(honorific, "이/가");

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
      {/* 1. Voca Study Avatar */}
      <HapticTarget keepsScroll>
        <button
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary-tint text-primary shadow-xs ring-1 ring-primary/25 transition-transform outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-95"
          type="button"
          aria-label="단어장 열기"
          onClick={() => router.push(VOCA_ROUTE)}
        >
          <BookOpen className="size-4.5 text-primary" strokeWidth={2} />
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
              "group relative flex max-w-[340px] min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border p-md text-left transition-all outline-none",
              "shadow-card border-primary/30 bg-canvas",
              "hover:border-primary/50 hover:shadow-floating active:scale-[0.99]",
              "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              LONG_PRESS_TARGET_CLASS,
              cardClassName,
            )}
            href={VOCA_ROUTE}
            onClick={handleClick}
            {...longPressHandlers}
          >
            {/* Top Header Badge */}
            <div className="flex items-center">
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-tint/70 px-2 py-0.5 text-caption font-semibold whitespace-nowrap text-primary">
                <Sparkles className="size-3 text-primary" aria-hidden />
                <span>단어 학습 완료</span>
              </span>
            </div>

            {/* Subtext Announcement & Title */}
            <div className="mt-sm flex flex-col gap-1">
              <p className="truncate text-caption text-meta">
                <span className="font-semibold text-ink">{isSelf ? "내가" : baseName}</span>
                {isSelf
                  ? " 오늘 목표 단어 학습을 달성했어요! 👏"
                  : `님${subjectParticle} 오늘 목표 단어 학습을 달성했어요! 👏`}
              </p>
              <h4 className="line-clamp-2 text-body-md leading-snug font-bold tracking-tight text-ink">
                {`오늘 영단어 ${count}개 완독 달성 🎉`}
              </h4>
            </div>

            {/* Action Callout Button */}
            <div className="mt-md flex items-center justify-between rounded-xl bg-surface-soft px-3 py-2.5 transition-colors group-hover:bg-primary-tint/40">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-full bg-primary text-on-primary shadow-xs">
                  <BookOpen className="size-3.5" />
                </div>
                <span className="text-button-sm font-semibold text-ink">
                  {isMine ? "단어장에서 복습하기" : "나도 단어 학습하러 가기"}
                </span>
              </div>
              <ChevronRight className="size-4 text-meta transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
          </Link>

          {/* Time beside bubble */}
          <div className="flex shrink-0 flex-col items-start pb-0.5 text-chat-time whitespace-nowrap text-chat-meta select-none [[data-wallpaper]_&]:on-wallpaper">
            {(unreadCount > 0 || isBookmarked) && (
              <span className="flex h-[1lh] items-center gap-1">
                {unreadCount > 0 &&
                  (readerTotal === 1 ? (
                    <span
                      className="flex items-center text-unread"
                      role="img"
                      aria-label="읽지 않음"
                    >
                      <Heart className="size-2.5 fill-current" strokeWidth={0} />
                    </span>
                  ) : (
                    <span
                      className="text-unread tabular-nums"
                      aria-label={`읽지 않음 ${unreadCount}`}
                    >
                      {unreadCount}
                    </span>
                  ))}
                {isBookmarked && (
                  <span className="flex items-center" role="img" aria-label="책갈피">
                    <Bookmark className="size-3 fill-current" />
                  </span>
                )}
              </span>
            )}
            <time dateTime={message.createdAt}>{timeString}</time>
          </div>
        </div>

        {reactions.length > 0 && currentUserId && onToggleReaction && (
          <ReactionBadges
            className="justify-start"
            reactions={reactions}
            currentUserId={currentUserId}
            onToggleReaction={onToggleReaction}
          />
        )}
      </div>
    </div>
  );
}
