"use client";

import type { Emoticon } from "@/entities/emoticon";
import type { Participant } from "@/entities/user";
import { cn, formatTime, type Nullable, type Optional } from "@/shared/lib";
import { Avatar, IconButton, type MediaCell } from "@/shared/ui";
import { RotateCcw, X } from "lucide-react";
import { LONG_PRESS_TARGET_CLASS, useLongPress } from "../model/use-long-press";
import { EmoticonBubble } from "./emoticon-bubble";
import { MediaGrid } from "./media-grid";

export type MessageRowProps = {
  className?: string;
  bubbleClassName?: string;
  text: Nullable<string>;
  media?: MediaCell[];
  emoticon?: Nullable<Emoticon>;
  /** `0`–`1` while attachments upload. Ignored for a text message. */
  progress?: number;
  createdAt: string;
  sender: Optional<Participant>;
  isMine: boolean;
  isFirstOfGroup: boolean;
  isLastOfGroup: boolean;
  /** REQUIREMENTS.md § 8.8. Set on the newest of my messages the other participant's read cursor has passed. */
  isRead?: boolean;
  status: "sent" | "sending" | "failed";
  onLongPress?: () => void;
  onOpenMedia?: (index: number) => void;
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
  progress = 1,
  createdAt,
  sender,
  isMine,
  isFirstOfGroup,
  isLastOfGroup,
  isRead = false,
  status,
  onLongPress,
  onOpenMedia,
  onRetry,
  onCancel,
}: MessageRowProps) {
  const longPressHandlers = useLongPress(onLongPress);
  const hasMedia = media.length > 0;

  return (
    <div
      className={cn(
        "flex gap-xs px-md",
        isFirstOfGroup ? "pt-sm" : "pt-2xs",
        isMine && "justify-end",
        className,
      )}
    >
      {!isMine &&
        (isFirstOfGroup ? (
          // TODO: Point `src` at `GET /api/media/{sender.avatarMediaId}` once the profile editor lands — step 10 of REQUIREMENTS.md § 17.
          <Avatar name={sender?.name ?? ""} />
        ) : (
          // INFO: DESIGN.md § 6.3. Keeps the rest of the group indented to the avatar column.
          <span className="size-9 shrink-0" />
        ))}
      <div
        className={cn("flex max-w-[72%] flex-col gap-2xs", isMine ? "items-end" : "items-start")}
      >
        {!isMine && isFirstOfGroup && (
          <span className="px-2xs text-chat-name text-chat-meta">{sender?.name}</span>
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
            // WARN: No long-press handlers here on purpose — an attachment's hold belongs to the OS, whose sheet is the only route from a web page to the iOS photo library. Deleting one's own attachment lives in `MediaViewer` instead.
            <div>
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
              {text}
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
}
