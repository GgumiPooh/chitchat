"use client";

import type { ChatMessage, MessageReaction } from "@/entities/message";
import { ReactionBadges, type ReactionPayload } from "@/features/react-message";
import { MESSAGE_FLASH_DURATION, TIME_LETTERS_ROUTE } from "@/shared/config";
import {
  cn,
  formatDate,
  formatTime,
  idToDate,
  LONG_PRESS_TARGET_CLASS,
  toDayKey,
  useLongPress,
  type LongPressPoint,
  type Nullable,
  type UserId,
} from "@/shared/lib";
import { HapticTarget, IconButton, Link, toast } from "@/shared/ui";
import { josa } from "es-hangul";
import {
  Bookmark,
  ChevronRight,
  CornerUpLeft,
  CornerUpRight,
  Heart,
  Lock,
  Mail,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { CSSProperties, MouseEvent } from "react";
import { useSwipeToReply } from "../model/use-swipe-to-reply";

export type TimeLetterArrivalNoticeCardProps = {
  className?: string;
  cardClassName?: string;
  message: ChatMessage;
  senderName: string;
  currentUserId?: UserId;
  isMine?: boolean;
  isSelecting?: boolean;
  isBookmarked?: boolean;
  isHighlighted?: boolean;
  unreadCount?: number;
  readerTotal?: number;
  reactions?: MessageReaction[];
  onReply?: () => void;
  onToggleReaction?: (reaction: ReactionPayload) => void;
  onOpen?: () => void;
  onLongPress?: (anchor: HTMLElement, point: LongPressPoint) => void;
};

const FLASH_STYLE: CSSProperties = {
  animationDuration: `${MESSAGE_FLASH_DURATION}ms`,
};

type TimeLetterNoticeData = {
  letterId: string;
  title: string;
  onlyMe?: boolean;
};

function parseNoticeData(rawText: Nullable<string>): TimeLetterNoticeData {
  if (!rawText) {
    return { letterId: "", title: "", onlyMe: false };
  }

  try {
    const parsed = JSON.parse(rawText) as {
      letterId?: string;
      title?: string;
      onlyMe?: boolean;
    };
    return {
      letterId: parsed.letterId ?? "",
      title: parsed.title ?? "",
      onlyMe: Boolean(parsed.onlyMe),
    };
  } catch {
    return {
      letterId: rawText,
      title: "",
      onlyMe: false,
    };
  }
}

export function TimeLetterArrivalNoticeCard({
  className,
  cardClassName,
  message,
  senderName,
  currentUserId,
  isMine = false,
  isSelecting = false,
  isBookmarked = false,
  isHighlighted = false,
  unreadCount = 0,
  readerTotal = 0,
  reactions = [],
  onReply,
  onToggleReaction,
  onOpen,
  onLongPress,
}: TimeLetterArrivalNoticeCardProps) {
  const router = useRouter();
  const { letterId, title, onlyMe } = parseNoticeData(message.text);
  const isBlind = Boolean(onlyMe && !isMine);
  const href = isBlind
    ? "#"
    : letterId
      ? `${TIME_LETTERS_ROUTE}?id=${letterId}`
      : TIME_LETTERS_ROUTE;

  const writtenDate = letterId ? idToDate(letterId) : new Date(message.createdAt);
  const arrivalDate = new Date(message.createdAt);
  const timeString = formatTime(message.createdAt);
  const hasTitle = Boolean(title.trim());

  const diffMs = Math.max(0, arrivalDate.getTime() - writtenDate.getTime());
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const isSameDay = toDayKey(writtenDate) === toDayKey(arrivalDate);

  let writtenDateStr = "";
  if (diffMinutes < 1) {
    writtenDateStr = "방금 전 작성";
  } else if (diffMinutes < 60) {
    writtenDateStr = `${diffMinutes}분 전 작성`;
  } else if (isSameDay) {
    writtenDateStr = `${diffHours}시간 전 작성`;
  } else {
    writtenDateStr = `${toDayKey(writtenDate).replace(/-/g, ".")} 작성`;
  }

  let elapsedText = "";
  if (diffMinutes < 1) {
    elapsedText = "방금 전 ";
  } else if (diffMinutes < 60) {
    elapsedText = `${diffMinutes}분 전 `;
  } else if (diffHours < 24) {
    elapsedText = `${diffHours}시간 전 `;
  } else if (diffDays < 30) {
    elapsedText = `${diffDays}일 전 `;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    elapsedText = `${months}개월 전 `;
  } else {
    const years = Math.floor(diffDays / 365);
    elapsedText = `${years}년 전 `;
  }

  const formattedSender = senderName.endsWith("님") ? senderName : `${senderName}님`;
  const senderTitle = isMine ? "과거의 나 (타임머신)" : `${formattedSender}의 타임머신`;

  const swipe = useSwipeToReply(isSelecting ? undefined : onReply, false);

  const longPressHandlers = useLongPress(
    !isSelecting && onLongPress ? (point, element) => onLongPress(element, point) : undefined,
    { onFire: swipe.cancel },
  );

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (isBlind) {
      event.preventDefault();
      toast.info(`${formattedSender} 본인만 열람할 수 있는 비밀 편지예요 🤫`);
      return;
    }
    if (onOpen) {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      className={cn(
        "group/row flex items-start gap-xs px-md pt-sm",
        isHighlighted && "message-flash",
        className,
      )}
      style={isHighlighted ? FLASH_STYLE : undefined}
    >
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
          onReply && "touch-pan-y",
          !swipe.isDragging && "transition-transform duration-200",
        )}
        style={{ transform: `translateX(${swipe.offset}px)` }}
        {...swipe.handlers}
      >
        {renderPullIndicator()}

        {/* Sender Name */}
        <span className="px-2xs text-chat-name text-chat-sender [[data-wallpaper]_&]:on-wallpaper">
          {senderTitle}
        </span>

        {/* Card + Time beside it */}
        <div className="flex max-w-full items-end gap-2xs">
          <Link
            className={cn(
              "group relative flex max-w-[340px] min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border p-md text-left transition-all outline-none",
              isBlind
                ? "shadow-card border-hairline bg-canvas hover:border-meta/30"
                : "shadow-card border-primary/30 bg-canvas hover:border-primary/50 hover:shadow-floating active:scale-[0.99]",
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
              <span
                className="shrink-0 text-caption font-medium whitespace-nowrap text-meta"
                title={`${formatDate(writtenDate)} ${formatTime(writtenDate)} 작성`}
              >
                {writtenDateStr}
              </span>
            </div>

            {/* Sender announcement & Title */}
            <div className="mt-sm flex flex-col gap-1">
              <p className="text-caption break-keep text-meta">
                {isMine ? (
                  <span>내가 {elapsedText}과거에서 보낸 편지예요</span>
                ) : isBlind ? (
                  <>
                    <span className="font-semibold text-ink">{senderName}</span>
                    {josa(senderName, "이/가")} 과거의 자신에게 보낸 편지가 도착했어요 📮
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-ink">{senderName}</span>님이 {elapsedText}
                    과거에서 보낸 편지예요
                  </>
                )}
              </p>
              <h4 className="line-clamp-2 text-body-md leading-snug font-bold tracking-tight text-ink">
                {isBlind
                  ? `“${formattedSender}의 비밀 편지 🔒”`
                  : hasTitle
                    ? `“${title}”`
                    : onlyMe
                      ? "나에게 쓴 비밀 편지 💌"
                      : "비밀스럽게 봉인된 편지 💌"}
              </h4>
            </div>

            {/* Action Callout Button */}
            {isBlind ? (
              <div className="mt-md flex items-center justify-between rounded-xl bg-surface-soft/70 px-3 py-2.5 transition-colors group-hover:bg-surface-soft">
                <div className="flex items-center gap-2">
                  <div className="bg-surface flex size-7 items-center justify-center rounded-full text-meta shadow-xs ring-1 ring-hairline">
                    <Lock className="size-3.5" />
                  </div>
                  <span className="text-button-sm font-medium text-meta">
                    본인만 열람할 수 있는 편지예요
                  </span>
                </div>
                <Lock className="size-3.5 text-meta/70" />
              </div>
            ) : (
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
            )}
          </Link>

          {/* Time beside bubble */}
          <div className="relative flex w-[68px] shrink-0 flex-col items-start pb-0.5 text-chat-time whitespace-nowrap text-chat-meta select-none [[data-wallpaper]_&]:on-wallpaper">
            <div
              className={cn(
                "flex flex-col items-start transition-opacity",
                onReply && "group-focus-within/row:opacity-0 group-hover/row:opacity-0",
              )}
            >
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
            {renderHoverActions()}
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

  function renderPullIndicator() {
    if (!onReply || swipe.offset === 0) {
      return null;
    }

    return (
      <span
        className={cn(
          "pointer-events-none absolute top-1/2 right-full mr-2xs flex size-8 -translate-y-1/2 items-center justify-center rounded-full transition-colors",
          swipe.isArmed ? "bg-primary text-on-primary" : "bg-surface-soft text-meta",
        )}
        aria-hidden
      >
        <CornerUpRight className="size-4" strokeWidth={1.75} />
      </span>
    );
  }

  function renderHoverActions() {
    if (!onReply) {
      return null;
    }

    return (
      <div
        className={cn(
          "absolute bottom-0 left-0 flex w-fit items-center gap-0.5 rounded-full border border-hairline bg-surface-soft px-1 py-0.5 shadow-raised",
          // WARN: DESIGN.md § 6.3. `w-fit left-0` on the bubble's own edge of the 68px slot, never `inset-x-0` — a row with 답장 alone would otherwise stretch the pill across the slot and hang half of it empty.
          // INFO: `hover:` already resolves under `@media (hover: hover)`, so a touch device never reveals these and never has to.
          "pointer-events-none opacity-0 transition-opacity group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100",
        )}
      >
        <IconButton
          className="size-7"
          iconClassName="size-4"
          Icon={CornerUpLeft}
          aria-label="답장"
          onClick={onReply}
        />
      </div>
    );
  }
}
