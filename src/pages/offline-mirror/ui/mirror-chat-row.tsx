"use client";

import type { ChatMedia } from "@/entities/media";
import type { ChatMessage } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { DELETED_MESSAGE_TEXT } from "@/shared/config";
import { cn, formatTime, type Optional } from "@/shared/lib";
import { Avatar, FileCard, VoicePlayer } from "@/shared/ui";
import { Smile } from "lucide-react";
import { toMirrorCell } from "../model/to-mirror-cell";
import { MirrorMediaBox } from "./mirror-media-box";

export type MirrorChatRowProps = {
  className?: string;
  message: ChatMessage;
  sender: Optional<Participant>;
  /** The quoted message's sender, resolved from the same snapshot participant set (REQUIREMENTS.md § 8.7.). */
  replyToName: Optional<string>;
  isMine: boolean;
  isFirstOfGroup: boolean;
  isLastOfGroup: boolean;
};

// INFO: DESIGN.md § 6.5. The attachment column's width, which every box here is drawn inside.
const ATTACHMENT_WIDTH = 220;

/**
 * One bubble of the mirrored conversation (REQUIREMENTS.md § 16.).
 *
 * WARN: `MessageRow` is not reused — it is not published by `widgets/chat-room`, and
 * it opens the profile viewer, pulls to reply and holds for an action sheet, none of
 * which a read-only mirror may offer.
 *
 * WARN: Nothing here requests a byte. Attachments are their stored hash
 * (AGENTS.md § 5.3.), the avatar falls back to its initial, and the voice player is
 * handed no source at all.
 */
export function MirrorChatRow({
  className,
  message,
  sender,
  replyToName,
  isMine,
  isFirstOfGroup,
  isLastOfGroup,
}: MirrorChatRowProps) {
  const voiceCell = message.media[0]?.voice ? message.media[0] : null;
  const hasMedia = message.media.length > 0;

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
          <Avatar name={sender?.name ?? ""} />
        ) : (
          // INFO: DESIGN.md § 6.3. Keeps the rest of the group indented to the avatar column.
          <span className="size-9 shrink-0" />
        ))}
      <div
        className={cn("flex max-w-[72%] flex-col gap-2xs", isMine ? "items-end" : "items-start")}
      >
        {!isMine && isFirstOfGroup && (
          <span className="px-2xs text-chat-name text-chat-sender">{sender?.name}</span>
        )}
        <div className={cn("flex items-end gap-2xs", isMine && "flex-row-reverse")}>
          {renderBody()}
          {(isLastOfGroup || message.editedAt) && (
            <div className="flex w-14 shrink-0 flex-col items-end text-chat-time whitespace-nowrap text-chat-meta">
              {message.editedAt && <span>수정됨</span>}
              {isLastOfGroup && (
                <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  function renderBody() {
    // WARN: REQUIREMENTS.md § 8.13. Ahead of every other branch — a withdrawn row carries no text, no quote and no attachment.
    if (message.isDeleted) {
      return (
        <div className={cn(toBubbleClassName(), "text-bubble-ink/55 italic")}>
          {DELETED_MESSAGE_TEXT}
        </div>
      );
    }
    if (message.emoticon) {
      return renderEmoticon();
    }
    if (voiceCell) {
      // WARN: REQUIREMENTS.md § 9.3. `src` is null on purpose: the waveform and the running time are stored on the row, and the object behind them is not cached (§ 16.).
      return (
        <VoicePlayer
          src={null}
          durationMs={voiceCell.durationMs ?? 0}
          peaks={voiceCell.voice?.peaks ?? []}
          isMine={isMine}
        />
      );
    }
    if (hasMedia) {
      return <div className="flex flex-col gap-2xs">{message.media.map(renderAttachment)}</div>;
    }

    return (
      <div className={toBubbleClassName()}>
        {message.replyTo && renderQuote()}
        {message.text}
      </div>
    );
  }

  function toBubbleClassName() {
    // INFO: DESIGN.md § 6.2. The notch marks the sender's side and only on the first bubble of a group.
    return cn(
      "rounded-bubble px-sm py-xs text-chat-body break-words wrap-anywhere whitespace-pre-wrap text-bubble-ink",
      isMine ? "bg-bubble-mine" : "border border-hairline bg-bubble-theirs",
      isFirstOfGroup && (isMine ? "rounded-tr-xs" : "rounded-tl-xs"),
    );
  }

  // INFO: DESIGN.md § 6.10. One line of the quoted message, without the tap that would jump to it — the row it names may be outside the snapshot entirely.
  function renderQuote() {
    return (
      <div className="mb-2xs border-l-2 border-hairline-strong pl-xs text-caption text-meta">
        <p className="truncate">{replyToName}</p>
        <p className="truncate">{message.replyTo?.text ?? DELETED_MESSAGE_TEXT}</p>
      </div>
    );
  }

  /**
   * WARN: A sized stand-in rather than the artwork. An emoticon's asset lives in the
   * jandh-emoticons deployment (AGENTS.md § 4.2.1.) and carries no hash to fall back
   * to, so there is nothing offline to draw but the box it would have filled.
   */
  function renderEmoticon() {
    const { width, height } = message.emoticon ?? { width: 1, height: 1 };
    const scale = Math.min(1, ATTACHMENT_WIDTH / 2 / Math.max(width, height));

    return (
      <div
        className="flex items-center justify-center rounded-sm bg-surface-soft"
        role="img"
        style={{ width: width * scale, height: height * scale }}
        aria-label="이모티콘"
      >
        <Smile className="size-6 text-meta-soft" strokeWidth={1.5} />
      </div>
    );
  }

  function renderAttachment(media: ChatMedia) {
    if (media.filename) {
      return <FileCard key={media.id} filename={media.filename} sizeBytes={media.size} disabled />;
    }

    return (
      <MirrorMediaBox
        key={media.id}
        className="rounded-bubble"
        cell={toMirrorCell(media)}
        maxWidth={ATTACHMENT_WIDTH}
      />
    );
  }
}
