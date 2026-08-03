"use client";

import { cn, formatTime, type Optional } from "@/shared/lib";
import { Avatar, IconButton } from "@/shared/ui";
import { RotateCcw } from "lucide-react";
import type { ChatParticipant } from "../model/types";
import { useLongPress } from "../model/use-long-press";

export type MessageRowProps = {
  className?: string;
  bubbleClassName?: string;
  text: string;
  createdAt: string;
  sender: Optional<ChatParticipant>;
  isMine: boolean;
  isFirstOfGroup: boolean;
  isLastOfGroup: boolean;
  status: "sent" | "sending" | "failed";
  onLongPress?: () => void;
  onRetry?: () => void;
};

// INFO: DESIGN.md § 6.1. Every gap is padding inside the row — the virtualizer positions rows absolutely and never sees a container `gap`.
export function MessageRow({
  className,
  bubbleClassName,
  text,
  createdAt,
  sender,
  isMine,
  isFirstOfGroup,
  isLastOfGroup,
  status,
  onLongPress,
  onRetry,
}: MessageRowProps) {
  const longPressHandlers = useLongPress(onLongPress);

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
          <Avatar src={sender?.avatarSrc} name={sender?.name ?? ""} />
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
          {/* INFO: DESIGN.md § 6.2. The notch marks the sender's side and only on the first bubble of a group; the rest stay fully rounded. */}
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
          {status === "failed" ? (
            <IconButton
              className="text-semantic-error hover:bg-primary-tint hover:text-semantic-error-hover"
              iconClassName="size-4"
              Icon={RotateCcw}
              aria-label="다시 보내기"
              onClick={onRetry}
            />
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
