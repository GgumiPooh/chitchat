"use client";

import type { Emoticon } from "@/entities/emoticon";
import type { ReplyPreview } from "@/entities/message";
import type { Participant } from "@/entities/user";
import {
  LONG_PRESS_TARGET_CLASS,
  cn,
  findFirstUrl,
  formatTime,
  useLongPress,
  type Nullable,
  type Optional,
} from "@/shared/lib";
import { Avatar, IconButton, type MediaCell } from "@/shared/ui";
import { CornerUpLeft, RotateCcw, Share, X } from "lucide-react";
import { useSwipeToReply } from "../model/use-swipe-to-reply";
import { EmoticonBubble } from "./emoticon-bubble";
import { LinkPreviewCard } from "./link-preview-card";
import { MediaGrid } from "./media-grid";
import { MessageText } from "./message-text";
import { ReplyQuote } from "./reply-quote";

export type MessageRowProps = {
  className?: string;
  bubbleClassName?: string;
  text: Nullable<string>;
  media?: MediaCell[];
  emoticon?: Nullable<Emoticon>;
  /** REQUIREMENTS.md § 8.10. The message this one quotes, already resolved by the room. */
  replyTo?: Nullable<ReplyPreview>;
  /** The quoted message's sender name, resolved from the participant set (§ 8.7.). */
  replyToName?: Optional<string>;
  /** `0`–`1` while attachments upload. Ignored for a text message. */
  progress?: number;
  createdAt: string;
  sender: Optional<Participant>;
  isMine: boolean;
  isFirstOfGroup: boolean;
  isLastOfGroup: boolean;
  /** REQUIREMENTS.md § 8.8. Set on the newest of my messages the other participant's read cursor has passed. */
  isRead?: boolean;
  /** DESIGN.md § 6.8. Flashes behind the row on arrival from a quote or a search result. */
  isHighlighted?: boolean;
  status: "sent" | "sending" | "failed";
  onLongPress?: () => void;
  onOpenMedia?: (index: number) => void;
  /** REQUIREMENTS.md § 8.10. The pointer affordance; touch reaches the same action through `onLongPress`. */
  onReply?: () => void;
  /** REQUIREMENTS.md § 8.11. As `onReply`: the hover control here, the action sheet on touch. Omitted for a message with nothing to hand the OS. */
  onShare?: () => void;
  onOpenReply?: () => void;
  onRetry?: () => void;
  onCancel?: () => void;
};

// INFO: DESIGN.md § 6.1. Every gap is padding inside the row — the virtualizer positions rows absolutely and never sees a container `gap`.
export function MessageRow({
  className,
  bubbleClassName,
  text,
  media = [],
  emoticon,
  replyTo,
  replyToName,
  progress = 1,
  createdAt,
  sender,
  isMine,
  isFirstOfGroup,
  isLastOfGroup,
  isRead = false,
  isHighlighted = false,
  status,
  onLongPress,
  onOpenMedia,
  onReply,
  onShare,
  onOpenReply,
  onRetry,
  onCancel,
}: MessageRowProps) {
  const swipe = useSwipeToReply(onReply, isMine);
  const longPressHandlers = useLongPress(onLongPress, { onFire: swipe.cancel });
  const hasMedia = media.length > 0;
  // INFO: REQUIREMENTS.md § 8.9. One card per bubble — the first link, not every link, because a message pasted from a share sheet routinely carries several.
  // INFO: DESIGN.md § 6.5. A bubble-less message carries an attachment rather than text, so there is no link in it to preview.
  const previewUrl = emoticon || hasMedia ? undefined : findFirstUrl(text);

  return (
    // INFO: DESIGN.md § 6.8. The flash is on the row rather than on the bubble's own fill, so a media or emoticon message — which has no fill — highlights the same way a text one does.
    <div
      className={cn(
        "group/row flex gap-xs px-md transition-colors duration-300",
        isFirstOfGroup ? "pt-sm" : "pt-2xs",
        isMine && "justify-end",
        isHighlighted && "bg-primary-tint",
        className,
      )}
    >
      {!isMine &&
        (isFirstOfGroup ? (
          // INFO: REQUIREMENTS.md § 8.7. Resolved from the participant set at render time, never copied onto the message row, so a profile change reaches every past bubble.
          <Avatar name={sender?.name ?? ""} mediaId={sender?.avatarMediaId} canEnlarge />
        ) : (
          // INFO: DESIGN.md § 6.3. Keeps the rest of the group indented to the avatar column.
          <span className="size-9 shrink-0" />
        ))}
      <div
        className={cn(
          "relative flex max-w-[72%] flex-col gap-2xs",
          isMine ? "items-end" : "items-start",
          // WARN: `pan-y` — without it WebKit claims the horizontal gesture for its own back-navigation swipe and the pull never completes.
          onReply && "touch-pan-y",
          !swipe.isDragging && "transition-transform duration-200",
        )}
        style={{ transform: `translateX(${swipe.offset}px)` }}
        {...swipe.handlers}
      >
        {renderPullIndicator()}
        {!isMine && isFirstOfGroup && (
          <span className="px-2xs text-chat-name text-chat-meta">{sender?.name}</span>
        )}
        {/* INFO: DESIGN.md § 6.10. A bubble-less message quotes in a card of its own; a text one quotes inside its bubble, where the fill already frames it. */}
        {replyTo && (emoticon || hasMedia) && (
          // WARN: Capped at DESIGN.md § 6.5.'s 220px attachment width. Left to the column's 72%, a long quote would stretch the card well past the photo it sits on top of.
          <ReplyQuote
            className="max-w-55"
            replyTo={replyTo}
            name={replyToName}
            variant="card"
            onOpen={onOpenReply}
          />
        )}
        {renderHoverActions()}
        {/* INFO: DESIGN.md § 6.9. Outside the bubble and above it, at § 6.5.'s attachment width — a sibling in this column, so it takes the sender's side and the column's cap without re-deriving either. */}
        {/* WARN: The hold lives on this wrapper and not on the card, because `useLongPress`'s click capture only reaches a target it is above — on the anchor itself the release would still follow the link out from under the sheet. */}
        {previewUrl && (
          <div className={cn("w-full max-w-55", LONG_PRESS_TARGET_CLASS)} {...longPressHandlers}>
            <LinkPreviewCard url={previewUrl} />
          </div>
        )}
        <div className={cn("flex items-end gap-2xs", isMine && "flex-row-reverse")}>
          {emoticon ? (
            // INFO: DESIGN.md § 6.5. An emoticon renders without a bubble, border or background, for the same reason an attachment does.
            <div
              className={cn(LONG_PRESS_TARGET_CLASS, status !== "sent" && "opacity-60")}
              {...longPressHandlers}
            >
              <EmoticonBubble emoticon={emoticon} />
            </div>
          ) : hasMedia ? (
            // INFO: DESIGN.md § 6.5. Attachments render without a bubble — a container around a photo is redundant chrome.
            // WARN: REQUIREMENTS.md § 8.11. The hold is the app's, not the OS's: iOS's own callout would open on top of the action sheet, and 공유 inside that sheet is what reaches the photo library instead. The OS menu keeps the § 7.10. viewer to itself.
            <div className={LONG_PRESS_TARGET_CLASS} {...longPressHandlers}>
              <MediaGrid
                cells={media}
                progress={progress}
                isPending={status !== "sent"}
                onOpen={onOpenMedia}
              />
            </div>
          ) : (
            // INFO: DESIGN.md § 6.2. The notch marks the sender's side and only on the first bubble of a group; the rest stay fully rounded.
            <div
              className={cn(
                "rounded-bubble px-sm py-xs text-chat-body break-words wrap-anywhere whitespace-pre-wrap text-bubble-ink transition-colors select-text",
                LONG_PRESS_TARGET_CLASS,
                isMine
                  ? "bg-bubble-mine active:bg-bubble-mine-pressed"
                  : "border border-hairline bg-bubble-theirs active:bg-bubble-theirs-pressed",
                isFirstOfGroup && (isMine ? "rounded-tr-xs" : "rounded-tl-xs"),
                // INFO: DESIGN.md § 6.5. Optimistic and failed bubbles dim instead of showing a spinner.
                status !== "sent" && "opacity-60",
                bubbleClassName,
              )}
              {...longPressHandlers}
            >
              {replyTo && (
                <ReplyQuote
                  className="mb-2xs"
                  replyTo={replyTo}
                  name={replyToName}
                  onOpen={onOpenReply}
                />
              )}
              {text && <MessageText text={text} />}
            </div>
          )}
          {status === "failed" ? (
            // INFO: DESIGN.md § 6.5. The failure affordance sits on the outer side of the bubble; cancel is beside retry so a send that cannot succeed can still be cleared.
            <div className="flex shrink-0 flex-col">
              <IconButton
                className="size-9 text-semantic-error hover:bg-primary-tint hover:text-semantic-error-hover"
                iconClassName="size-4"
                Icon={RotateCcw}
                haptic
                aria-label="다시 보내기"
                onClick={onRetry}
              />
              <IconButton
                className="size-9"
                iconClassName="size-4"
                Icon={X}
                aria-label="전송 취소"
                onClick={onCancel}
              />
            </div>
          ) : (
            (isLastOfGroup || isRead) && (
              // INFO: DESIGN.md § 6.3. One timestamp per minute-group, on its last bubble; § 8.8.'s 읽음 stacks above it on the one bubble that carries it.
              <div className="flex shrink-0 flex-col items-end text-chat-time text-chat-meta">
                {isRead && <span>읽음</span>}
                {isLastOfGroup && <time dateTime={createdAt}>{formatTime(createdAt)}</time>}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );

  /**
   * DESIGN.md § 6.10. Sits in the gap the pull opens behind the row, on the edge
   * the row is moving away from, and fills in as the threshold is approached so
   * the release is never a guess.
   */
  function renderPullIndicator() {
    if (!onReply || swipe.offset === 0) {
      return null;
    }

    return (
      <span
        className={cn(
          "pointer-events-none absolute top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full transition-colors",
          swipe.isArmed ? "bg-primary text-on-primary" : "bg-surface-soft text-meta",
          isMine ? "left-full ml-2xs" : "right-full mr-2xs",
        )}
        aria-hidden
      >
        <CornerUpLeft className="size-4" strokeWidth={1.75} />
      </span>
    );
  }

  /**
   * AGENTS.md § 4.2. The pointer half of REQUIREMENTS.md § 8.10. and § 8.11. — touch
   * reaches the same actions by holding the row for the action sheet, and reply also
   * by pulling it sideways.
   *
   * WARN: Positioned out of flow on the outer side rather than added to the row.
   * In flow they would only exist while hovered, and their appearance would shove the
   * bubble sideways under the cursor that is aiming at them.
   */
  function renderHoverActions() {
    if (!onReply && !onShare) {
      return null;
    }

    return (
      <div
        className={cn(
          "absolute top-1/2 flex -translate-y-1/2 items-center",
          // INFO: `hover:` already resolves under `@media (hover: hover)`, so a touch device never reveals these and never has to.
          "pointer-events-none opacity-0 transition-opacity group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100",
          // INFO: 답장 stays the control nearest the bubble on either side, so the reach for it does not move with the sender.
          isMine ? "right-full mr-2xs flex-row-reverse" : "left-full ml-2xs",
        )}
      >
        {onReply && (
          <IconButton
            className="size-8"
            iconClassName="size-4"
            Icon={CornerUpLeft}
            aria-label="답장"
            onClick={onReply}
          />
        )}
        {onShare && (
          <IconButton
            className="size-8"
            iconClassName="size-4"
            Icon={Share}
            aria-label="공유"
            onClick={onShare}
          />
        )}
      </div>
    );
  }
}
