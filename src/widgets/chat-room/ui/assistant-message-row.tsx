"use client";

import type { ChatMessage, MessageReaction, ReplyPreview } from "@/entities/message";
import { ReactionBadges, type ReactionPayload } from "@/features/react-message";
import { useProfileViewer } from "@/features/view-profile";
import { DELETED_MESSAGE_TEXT, toLlmProviderBranding } from "@/shared/config";
import {
  cn,
  formatTime,
  LONG_PRESS_TARGET_CLASS,
  useDoubleTap,
  useLongPress,
  type LongPressPoint,
  type Nullable,
  type UserId,
} from "@/shared/lib";
import { IconButton, MarkdownBody } from "@/shared/ui";
import { Bookmark, ChevronDown, Share, Sparkles } from "lucide-react";
import { toBubbleTapHandler } from "../model/to-bubble-tap-handler";
import { isExpandableBody, toTruncatedBodyHeight } from "../model/to-truncated-body";
import { useSwipeToReply } from "../model/use-swipe-to-reply";
import { ExpandBodyButton } from "./expand-body-button";
import { ReplyQuote } from "./reply-quote";

export type AssistantMessageRowProps = {
  className?: string;
  message: ChatMessage;
  /** REQUIREMENTS.md § 8.5. `MessageRow`'s own prop of the same name — see there. */
  isSelecting?: boolean;
  /** REQUIREMENTS.md § 8.15. The question this answer was asked with, quoted inside the bubble the way `MessageRow` quotes a reply's parent. */
  replyTo?: Nullable<ReplyPreview>;
  /** `toQuoteHeading`'s sentence for `replyTo`, composed by the caller (DESIGN.md § 6.10.). */
  replyToHeading?: string;
  isCollapsed?: boolean;
  /** REQUIREMENTS.md § 8.19. `MessageRow`'s own prop of the same name. */
  isBookmarked?: boolean;
  /** REQUIREMENTS.md § 8.17. `MessageRow`'s own prop of the same name. */
  reactions?: MessageReaction[];
  currentUserId?: UserId;
  onToggleReaction?: (reaction: ReactionPayload) => void;
  onOpenReply?: () => void;
  /** REQUIREMENTS.md § 8.16. `MessageRow`'s own prop of the same name — a cut answer opens the § 6.2.2. sheet, which renders it as the markdown the bubble was drawing. */
  onExpand?: () => void;
  /** REQUIREMENTS.md § 8.17. `MessageRow`'s own prop of the same name — unfolds this answer in place, for this reader alone. */
  onUnfold?: () => void;
  /** REQUIREMENTS.md § 8.10. `MessageRow`'s own touch/pointer contract — a finished AI answer takes both exactly as a `theirs` text row does. */
  onLongPress?: (anchor: HTMLElement, point: LongPressPoint) => void;
  /** REQUIREMENTS.md § 8.15. Where a `theirs` row stages a quote, an answer opens AI 질문 모드 on itself — the pull and the sheet both land here. */
  onFollowUp?: () => void;
  onShare?: () => void;
};

/**
 * DESIGN.md § 6.2., § 6.3., § 7.7. The finished AI answer — the streaming
 * `AiAnswerRow`'s own shape (`ChatRoom`'s `ListFooter`) once the reply has landed
 * as a message: provider avatar and name, a `theirs` bubble sized to its
 * `MarkdownBody` content, the timestamp in its usual slot. Never grouped with a
 * neighbor (`buildChatRows`) — every one of these is its own group, avatar and
 * name included.
 */
export function AssistantMessageRow({
  className,
  message,
  isSelecting = false,
  isCollapsed = false,
  isBookmarked = false,
  replyTo,
  replyToHeading,
  reactions = [],
  currentUserId,
  onToggleReaction,
  onLongPress,
  onOpenReply,
  onExpand,
  onUnfold,
  onFollowUp,
  onShare,
}: AssistantMessageRowProps) {
  const { openLlmProfile } = useProfileViewer();
  const branding = toLlmProviderBranding(message.llmProvider);
  // WARN: REQUIREMENTS.md § 8.13. A withdrawn answer keeps its place as a tombstone and gives up every action along with its text — `isQuotable` refuses it anyway, so a 답장 offered here could only fail.
  const isDeleted = message.isDeleted;
  const followUp = isDeleted ? undefined : onFollowUp;
  const share = isDeleted ? undefined : onShare;
  // INFO: REQUIREMENTS.md § 8.5. `MessageRow`'s own rule — the sweep takes the row's gestures and leaves only the quote's and 전체보기's taps.
  const swipe = useSwipeToReply(isSelecting ? undefined : followUp, false);
  // WARN: REQUIREMENTS.md § 8.16. `MessageRow`'s own test on the same source `toAnswerHeight` prices — the answer's markdown, before any of it is laid out.
  const isTruncated = !isDeleted && !isCollapsed && isExpandableBody(message.text);
  const rawTapBubble = toBubbleTapHandler(
    isCollapsed ? onUnfold : isTruncated ? onExpand : onOpenReply,
  );
  const doubleTap = useDoubleTap({
    onDoubleTap: onToggleReaction
      ? () => onToggleReaction({ reactionType: "emoji", emoji: "❤️" })
      : undefined,
  });
  const onTapBubble = doubleTap.wrapSingleTap(rawTapBubble);
  const longPressHandlers = useLongPress(
    !isDeleted && !isSelecting && onLongPress
      ? (point, anchor) => onLongPress(anchor, point)
      : undefined,
    { onFire: swipe.cancel },
  );

  return (
    <div className={cn("group/row flex gap-2xs px-md pt-sm", className)}>
      <button
        className="block size-9 shrink-0 cursor-pointer rounded-full transition-opacity outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary active:opacity-70"
        type="button"
        aria-label={`${branding.name} 프로필 보기`}
        onClick={() => openLlmProfile(message.llmProvider, message.llmModel ?? undefined)}
      >
        {branding.avatarSrc ? (
          <span className="block size-full overflow-hidden rounded-full ring-1 ring-hairline ring-inset">
            {/* eslint-disable-next-line @next/next/no-img-element -- a static asset under `public/llm`, not a stored `media` row `next/image` would otherwise optimize */}
            <img className="size-full object-cover" src={branding.avatarSrc} alt="" />
          </span>
        ) : (
          <span className="flex size-full items-center justify-center rounded-full bg-primary-tint ring-1 ring-hairline ring-inset">
            <Sparkles className="size-4 text-primary" strokeWidth={1.75} />
          </span>
        )}
      </button>
      <div
        className={cn(
          // WARN: DESIGN.md § 6.11. `max-w-[calc(100%-44px)]`, not `flex-1` — the identical cap `MessageRow`'s own outer column takes, an AI answer sharing the § 6.11. wide cap being the whole point rather than a value of its own keyed to this row's `gap-2xs`. `flex-1` forced this box to the row's *full* available width regardless of the bubble's own content, which is what pushed the timestamp off to the row's true right edge on a short answer instead of hugging the bubble — a `max-width` shrink-wraps to content the way `flex-grow` cannot.
          // WARN: DESIGN.md § 4.7. `SelectableRow` translates this column 40px right rather than shrinking its container (`MessageRow`'s own comment gives the reason), so the extra 40px comes off this cap too, animated the same way.
          "relative flex flex-col gap-2xs transition-[max-width] duration-(--duration-state) ease-out motion-reduce:transition-none",
          isSelecting ? "max-w-[calc(100%-84px)]" : "max-w-[calc(100%-44px)]",
          // WARN: `pan-y` — without it WebKit claims the horizontal gesture for its own back-navigation swipe and the pull never completes.
          followUp && "touch-pan-y",
          !swipe.isDragging && "transition-transform duration-200",
        )}
        style={{ transform: `translateX(${swipe.offset}px)` }}
        {...swipe.handlers}
      >
        {renderPullIndicator()}
        <span className="px-2xs text-chat-name text-chat-sender [[data-wallpaper]_&]:on-wallpaper">
          {branding.name}
        </span>
        {/* WARN: DESIGN.md § 6.3. `max-w-full` (matching `MessageRow`'s own bubble row) is what carries the column's cap down to the bubble below — a flex item's default `flex-shrink: 1` then squeezes `min-w-0`'s bubble to `column − TIME_SLOT` only once its content actually needs it, rather than a `flex-1` sibling reserving that width whether or not the content does. */}
        <div className="flex max-w-full items-end gap-2xs">
          {/* INFO: DESIGN.md § 6.11. `w-fit max-w-full` inside the `min-w-0` slot, so a short answer draws a bubble as wide as its own line rather than the full column. */}
          <div className="min-w-0">
            <div
              className={cn(
                "w-fit max-w-full rounded-bubble rounded-tl-xs border border-hairline px-sm py-xs select-text",
                // INFO: REQUIREMENTS.md § 16.1. 나에게만 보내기 — the asker's own private question answered with the other theme's `theirs` fill, `MessageRow`'s own bubble reading the same pair for the mine side.
                message.onlyMe
                  ? "bg-bubble-theirs-private text-bubble-private-ink active:bg-bubble-theirs-private-pressed"
                  : "bg-bubble-theirs text-bubble-ink active:bg-bubble-theirs-pressed",
                // INFO: DESIGN.md § 6.2.1. `MessageRow`'s own tombstone treatment — the bubble keeps its shape and side and gives up its ink.
                isDeleted && (message.onlyMe ? "text-bubble-private-ink/55" : "text-bubble-ink/55"),
                isDeleted && "italic select-none",
                LONG_PRESS_TARGET_CLASS,
              )}
              {...longPressHandlers}
              onPointerDown={(e) => {
                longPressHandlers.onPointerDown(e);
                doubleTap.pointerHandlers.onPointerDown(e);
              }}
              onPointerUp={(e) => {
                longPressHandlers.onPointerUp();
                doubleTap.pointerHandlers.onPointerUp(e);
              }}
              onDoubleClick={doubleTap.onDoubleClick}
              onClick={replyTo || isTruncated || isCollapsed ? onTapBubble : undefined}
            >
              {isDeleted ? (
                DELETED_MESSAGE_TEXT
              ) : (
                <>
                  {replyTo && (
                    // INFO: DESIGN.md § 6.10. The divider belongs to the bubble, exactly as it does in `MessageRow` — `REQUIREMENTS.md § 8.3.` prices it at this same call site.
                    <ReplyQuote
                      className="mb-2xs border-b border-quote-divider pb-2xs"
                      replyTo={replyTo}
                      heading={replyToHeading ?? ""}
                      onOpen={onOpenReply}
                    />
                  )}
                  {/* WARN: REQUIREMENTS.md § 8.3. A px cap and not `MessageRow`'s `line-clamp` — an answer is a stack of blocks rather than a run of lines, and `-webkit-box` counts no line boxes through one. `toTruncatedBodyHeight` is the number `toAnswerHeight` prices, so the two cannot read the clamp differently. */}
                  {/* WARN: REQUIREMENTS.md § 8.17. Plain body text and never `MarkdownBody` — a folded answer is one line, and a one-line cap over markdown cuts an `h1` through the middle of its glyphs. `line-clamp-1` lays out exactly the line `toAssistantColumnHeight` prices. */}
                  {isCollapsed ? (
                    <span
                      className={cn(
                        "line-clamp-1 text-chat-body [word-break:normal]",
                        message.onlyMe ? "text-bubble-private-ink" : "text-bubble-ink",
                      )}
                    >
                      {message.text}
                    </span>
                  ) : isTruncated ? (
                    <div className="overflow-hidden" style={{ maxHeight: toTruncatedBodyHeight() }}>
                      <MarkdownBody isOnlyMe={message.onlyMe} text={message.text ?? ""} />
                    </div>
                  ) : (
                    <MarkdownBody isOnlyMe={message.onlyMe} text={message.text ?? ""} />
                  )}
                  {/* WARN: REQUIREMENTS.md § 8.3. `MessageRow`'s own note — never conditioned on the handler, which the estimate cannot see. */}
                  {isTruncated && <ExpandBodyButton label="전체보기" onClick={onExpand} />}
                  {isCollapsed && (
                    <ExpandBodyButton label="펼치기" Icon={ChevronDown} onClick={onUnfold} />
                  )}
                </>
              )}
            </div>
          </div>
          {/* WARN: DESIGN.md § 6.3. `relative`, and always rendered — the § 8.10./§ 8.11. pill overlays this exact box (`renderHoverActions`) in place of the timestamp on hover, rather than sitting beside it. */}
          <div className="relative flex w-[68px] shrink-0 flex-col items-start text-chat-time whitespace-nowrap text-chat-meta [[data-wallpaper]_&]:on-wallpaper">
            {/* INFO: REQUIREMENTS.md § 8.19. `MessageRow`'s own marker line — an AI answer carries no unread count or § 16.1. mark to share it with. */}
            {isBookmarked && (
              <span className="flex h-[1lh] items-center" role="img" aria-label="책갈피">
                <Bookmark className="size-3 fill-current" />
              </span>
            )}
            <time
              className={cn(
                "transition-opacity",
                (followUp || share) && "group-focus-within/row:opacity-0 group-hover/row:opacity-0",
              )}
              dateTime={message.createdAt}
            >
              {formatTime(message.createdAt)}
            </time>
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

  /** @see MessageRow's own `renderPullIndicator` (DESIGN.md § 6.10.) — an assistant row is always `theirs`, so it pulls rightward exactly as one does, on `ai` and a `Sparkles` since the release opens AI 질문 모드 rather than staging a quote (REQUIREMENTS.md § 8.15.). */
  function renderPullIndicator() {
    if (!followUp || swipe.offset === 0) {
      return null;
    }

    return (
      <span
        className={cn(
          "pointer-events-none absolute top-1/2 right-full mr-2xs flex size-8 -translate-y-1/2 items-center justify-center rounded-full transition-colors",
          swipe.isArmed ? "bg-ai text-on-primary" : "bg-surface-soft text-meta",
        )}
        aria-hidden
      >
        <Sparkles className="size-4" strokeWidth={1.75} />
      </span>
    );
  }

  /**
   * @see MessageRow's own `renderHoverActions` (AGENTS.md § 4.2.) — the pointer
   * half of the gestures above.
   *
   * WARN: DESIGN.md § 6.3. Fills the same `w-[68px]` box the timestamp renders in
   * (`inset-x-0 bottom-0`) rather than sitting beside or past it, and is `absolute`
   * so a one-line answer whose slot is shorter than the pill lets it overflow
   * **upward** instead of adding flow height.
   */
  function renderHoverActions() {
    if (!followUp && !share) {
      return null;
    }

    return (
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex items-center gap-0.5 rounded-full border border-hairline bg-surface-soft px-1 py-0.5 shadow-raised",
          "pointer-events-none opacity-0 transition-opacity group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100",
        )}
      >
        {followUp && (
          <IconButton
            className="size-7"
            iconClassName="size-4"
            Icon={Sparkles}
            aria-label="이어서 질문"
            onClick={followUp}
          />
        )}
        {share && (
          <IconButton
            className="size-7"
            iconClassName="size-4"
            Icon={Share}
            aria-label="공유"
            onClick={share}
          />
        )}
      </div>
    );
  }
}
