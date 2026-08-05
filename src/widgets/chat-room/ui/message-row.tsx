"use client";

import type { Emoticon } from "@/entities/emoticon";
import type { ReplyPreview } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { cn, findFirstUrl, formatTime, type Nullable, type Optional } from "@/shared/lib";
import { Avatar, IconButton, type MediaCell } from "@/shared/ui";
import { CornerUpLeft, RotateCcw, X } from "lucide-react";
import { useLongPress } from "../model/use-long-press";
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
  onOpenReply,
  onRetry,
  onCancel,
}: MessageRowProps) {
  const longPressHandlers = useLongPress(onLongPress);
  const hasMedia = media.length > 0;
  // INFO: REQUIREMENTS.md § 8.9. One card per bubble — the first link, not every link, because a message pasted from a share sheet routinely carries several.
  const previewUrl = findFirstUrl(text);

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
        )}
      >
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
        {renderReplyButton()}
        <div className={cn("flex items-end gap-2xs", isMine && "flex-row-reverse")}>
          {emoticon ? (
            // INFO: DESIGN.md § 6.5. An emoticon renders without a bubble, border or background, for the same reason an attachment does.
            <div className={cn(status !== "sent" && "opacity-60")} {...longPressHandlers}>
              <EmoticonBubble emoticon={emoticon} />
            </div>
          ) : hasMedia ? (
            // INFO: DESIGN.md § 6.5. Attachments render without a bubble — a container around a photo is redundant chrome.
            <div {...longPressHandlers}>
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
              {/* INFO: DESIGN.md § 6.10. Above the link card, because the quote is what the message is answering and the card is part of what it says. */}
              {replyTo && (
                <ReplyQuote
                  className="mb-2xs"
                  replyTo={replyTo}
                  name={replyToName}
                  onOpen={onOpenReply}
                />
              )}
              {/* INFO: DESIGN.md § 6.9. The card sits above the text, inset from the bubble's own padding, so the bubble stays the one shape the message is drawn in. */}
              {previewUrl && <LinkPreviewCard className="mb-2xs" url={previewUrl} />}
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
   * AGENTS.md § 4.2. The pointer half of REQUIREMENTS.md § 8.10. — touch reaches the
   * same action by holding the bubble, which is what opens the action sheet.
   *
   * WARN: Positioned out of flow on the outer side rather than added to the row.
   * In flow it would only exist while hovered, and its appearance would shove the
   * bubble sideways under the cursor that is aiming at it.
   */
  function renderReplyButton() {
    if (!onReply) {
      return null;
    }

    return (
      <IconButton
        className={cn(
          "absolute top-1/2 size-8 -translate-y-1/2 opacity-0 transition-opacity",
          // INFO: `hover:` already resolves under `@media (hover: hover)`, so a touch device never reveals this and never has to.
          "pointer-events-none group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100",
          isMine ? "right-full mr-2xs" : "left-full ml-2xs",
        )}
        iconClassName="size-4"
        Icon={CornerUpLeft}
        aria-label="답장"
        onClick={onReply}
      />
    );
  }
}
