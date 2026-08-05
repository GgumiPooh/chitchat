"use client";

import type { Participant } from "@/entities/user";
import { cn, formatTime, type Nullable, type Optional } from "@/shared/lib";
import { Avatar, IconButton } from "@/shared/ui";
import { RotateCcw, X } from "lucide-react";
import type { MediaCell } from "../model/to-media-cells";
import { useLongPress } from "../model/use-long-press";
import { MediaGrid } from "./media-grid";

export type MessageRowProps = {
  className?: string;
  bubbleClassName?: string;
  text: Nullable<string>;
  media?: MediaCell[];
  /** `0`–`1` while attachments upload. Ignored for a text message. */
  progress?: number;
  createdAt: string;
  sender: Optional<Participant>;
  isMine: boolean;
  isFirstOfGroup: boolean;
  isLastOfGroup: boolean;
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
  progress = 1,
  createdAt,
  sender,
  isMine,
  isFirstOfGroup,
  isLastOfGroup,
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
          {hasMedia ? (
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
            // INFO: DESIGN.md § 6.3. One timestamp per minute-group, on its last bubble.
            isLastOfGroup && (
              <time className="shrink-0 text-chat-time text-chat-meta" dateTime={createdAt}>
                {formatTime(createdAt)}
              </time>
            )
          )}
        </div>
      </div>
    </div>
  );
}
