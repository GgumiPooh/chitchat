"use client";

import type { ChatMessage } from "@/entities/message";
import { DELETED_MESSAGE_TEXT, toLlmProviderBranding } from "@/shared/config";
import { cn, formatTime } from "@/shared/lib";
import { MarkdownBody } from "@/shared/ui";
import { Sparkles } from "lucide-react";

export type MirrorAssistantRowProps = {
  className?: string;
  message: ChatMessage;
};

/**
 * DESIGN.md § 6.2., § 7.7. The finished AI answer, mirrored (REQUIREMENTS.md § 16.).
 *
 * WARN: `AssistantMessageRow` is not reused — it opens the profile viewer on a tap,
 * which a read-only mirror has no provider for (`MirrorChatRow`'s own reason for not
 * reusing `MessageRow`). The avatar here is a plain span rather than a button.
 */
export function MirrorAssistantRow({ className, message }: MirrorAssistantRowProps) {
  const branding = toLlmProviderBranding(message.llmProvider);

  return (
    <div className={cn("flex gap-2xs px-md pt-sm", className)}>
      <span className="block size-9 shrink-0 rounded-full">
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
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2xs">
        <span className="px-2xs text-chat-name text-chat-sender [[data-wallpaper]_&]:on-wallpaper">
          {branding.name}
        </span>
        <div className="flex items-end gap-2xs">
          <div
            className={cn(
              "min-w-0 flex-1 rounded-bubble rounded-tl-xs border border-hairline px-sm py-xs select-text",
              // INFO: REQUIREMENTS.md § 16.1. An answer to a private question reads the other theme's fill, exactly as `AssistantMessageRow`'s own swap.
              message.onlyMe
                ? "bg-bubble-theirs-private text-bubble-private-ink"
                : "bg-bubble-theirs text-bubble-ink",
              // INFO: DESIGN.md § 6.2.1. `MirrorChatRow`'s own tombstone treatment, for the same withdrawn answer `AssistantMessageRow` draws in the live room.
              message.isDeleted && [
                message.onlyMe ? "text-bubble-private-ink/55" : "text-bubble-ink/55",
                "italic select-none",
              ],
            )}
          >
            {message.isDeleted ? (
              DELETED_MESSAGE_TEXT
            ) : (
              <MarkdownBody isOnlyMe={message.onlyMe} text={message.text ?? ""} />
            )}
          </div>
          <div className="flex w-14 shrink-0 flex-col items-end text-chat-time whitespace-nowrap text-chat-meta [[data-wallpaper]_&]:on-wallpaper">
            <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          </div>
        </div>
      </div>
    </div>
  );
}
