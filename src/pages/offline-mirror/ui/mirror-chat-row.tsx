"use client";

import type { ChatMedia } from "@/entities/media";
import type { ChatMessage } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { SearchHighlight } from "@/features/search-messages";
import { DELETED_MESSAGE_TEXT, toMessageSummary } from "@/shared/config";
import { cn, formatTime, type Optional } from "@/shared/lib";
import { Avatar, FileCard, MediaTombstone, SilentRing, VoicePlayer } from "@/shared/ui";
import { BellOff, Smile } from "lucide-react";
import type { CSSProperties } from "react";
import { toMirrorCell } from "../model/to-mirror-cell";
import { MirrorMediaBox } from "./mirror-media-box";

export type MirrorChatRowProps = {
  className?: string;
  style?: CSSProperties;
  message: ChatMessage;
  sender: Optional<Participant>;
  /** The quoted message's sender, resolved from the same snapshot participant set (REQUIREMENTS.md § 8.7.). */
  /** `toQuoteHeading`'s sentence for the quoted message, composed by the screen (DESIGN.md § 6.10.). */
  replyToHeading: Optional<string>;
  isMine: boolean;
  isFirstOfGroup: boolean;
  isLastOfGroup: boolean;
  /** DESIGN.md § 6.2. The first bubble of a run wears the notch corner, and `buildMirrorRows` restarts the run at every § 6.5. attachment or emoticon, which have none. */
  hasNotch: boolean;
  /** REQUIREMENTS.md § 8.6.1. The submitted query, while a search is open — lights the words matched inside a text bubble, the way `MessageRow`'s own `search-hit` mark does. */
  searchQuery?: string;
  /** REQUIREMENTS.md § 8.6.1. What a search jump scrolls to and `document.getElementById` resolves — the mirror renders every row at once rather than through a virtualizer. */
  id?: string;
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
  style,
  message,
  sender,
  replyToHeading,
  isMine,
  isFirstOfGroup,
  isLastOfGroup,
  hasNotch,
  searchQuery,
  id,
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
      style={style}
      id={id}
    >
      {!isMine &&
        (isFirstOfGroup ? (
          <Avatar name={sender?.name ?? ""} />
        ) : (
          // INFO: DESIGN.md § 6.3. Keeps the rest of the group indented to the avatar column.
          <span className="size-9 shrink-0" />
        ))}
      <div
        // INFO: DESIGN.md § 6.2., § 6.11. `MessageRow`'s own wide cap — the row's content box less the avatar (`size-9`) and its `gap-xs` — never the § 6.5. 72%.
        className={cn(
          "flex max-w-[calc(100%-44px)] flex-col gap-2xs",
          isMine ? "items-end" : "items-start",
        )}
      >
        {!isMine && isFirstOfGroup && (
          <span className="px-2xs text-chat-name text-chat-sender [[data-wallpaper]_&]:on-wallpaper">
            {sender?.name}
          </span>
        )}
        {/* INFO: DESIGN.md § 6.10. A bubble-less message quotes above itself, exactly as the live row does — a text one quotes inside its bubble, where the fill already frames it. Without this a photo sent as a reply showed its quote online and dropped it here, and the mirror is meant to be the same transcript. */}
        {!message.isDeleted &&
          message.replyTo &&
          (message.emoticon || hasMedia) &&
          renderQuote(
            cn(
              "max-w-55 rounded-bubble px-sm py-xs",
              isMine
                ? message.onlyMe
                  ? "bg-bubble-mine-private"
                  : "bg-bubble-mine"
                : "border border-hairline bg-bubble-theirs",
              hasNotch && (isMine ? "rounded-tr-xs" : "rounded-tl-xs"),
            ),
          )}
        {/* WARN: DESIGN.md § 6.2. `max-w-full` is what holds the bubble inside the column's own wide cap — the column aligns rather than stretches, so this stack is sized `fit-content`, which floors at min-content. */}
        <div className={cn("flex max-w-full items-end gap-2xs", isMine && "flex-row-reverse")}>
          {renderBody()}
          {(isLastOfGroup || message.editedAt || message.silent) && (
            <div className="flex w-14 shrink-0 flex-col items-end text-chat-time whitespace-nowrap text-chat-meta [[data-wallpaper]_&]:on-wallpaper">
              {/* INFO: REQUIREMENTS.md § 16.1. The live row's own mark, on the live stack's own top line — a snapshot taken before the field existed simply reads undefined here and draws nothing. */}
              {message.silent && (
                <span
                  className="flex h-[1lh] items-center"
                  role="img"
                  aria-label="조용히 보낸 메시지"
                >
                  <BellOff className="size-3" />
                </span>
              )}
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
        <div
          className={cn(
            toBubbleClassName(),
            message.onlyMe ? "text-bubble-private-ink/55" : "text-bubble-ink/55",
            "italic",
          )}
        >
          {DELETED_MESSAGE_TEXT}
        </div>
      );
    }
    if (message.emoticon) {
      return renderEmoticon();
    }
    if (voiceCell) {
      // INFO: The live row routes a withdrawn clip to the tombstone too — the peaks are still on the row, so without this the one destroyed object in the app still draws its own contents here. `VOICE_CARD_HEIGHT`'s own `h-14` and the player's radius, so the row keeps its height and its shape.
      if (voiceCell.isDeleted) {
        return (
          <MediaTombstone
            className="h-14 w-55 flex-row rounded-bubble"
            cell={toMirrorCell(voiceCell)}
          />
        );
      }

      // WARN: REQUIREMENTS.md § 9.3. `src` is null on purpose: the waveform and the running time are stored on the row, and the object behind them is not cached (§ 16.).
      return (
        <VoicePlayer
          className={cn(hasNotch && (isMine ? "rounded-tr-xs" : "rounded-tl-xs"))}
          src={null}
          durationMs={voiceCell.durationMs ?? 0}
          peaks={voiceCell.voice?.peaks ?? []}
          isMine={isMine}
          isSilent={message.silent}
        />
      );
    }
    if (hasMedia) {
      return <div className="flex flex-col gap-2xs">{message.media.map(renderAttachment)}</div>;
    }

    return (
      <div className={toBubbleClassName()}>
        {message.replyTo && renderQuote("mb-2xs border-b border-quote-divider pb-2xs")}
        {/* INFO: REQUIREMENTS.md § 13. The mirror reads `text` and draws no emoticons, so each placeholder reads as `(이모티콘)` rather than reaching the transcript as tofu — the same summary the § 16.1. banner and the § 8.10. quote take. */}
        {searchQuery ? (
          <SearchHighlight text={toMessageSummary(message.text ?? "")} query={searchQuery} />
        ) : (
          toMessageSummary(message.text ?? "")
        )}
      </div>
    );
  }

  function toBubbleClassName() {
    // INFO: DESIGN.md § 6.2. The notch marks the sender's side and only on the first bubble of a group.
    // WARN: DESIGN.md § 4.2.3. The arbitrary property and never `break-normal`, which would take `overflow-wrap` with it and leave a long URL overflowing the column.
    // WARN: `min-w-0` is the other half of the stack's `max-w-full` — a flex item does not shrink below its own min-content, and the quote's `truncate` is min-content the whole width of its line.
    return cn(
      "min-w-0 rounded-bubble px-sm py-xs text-chat-body wrap-anywhere [word-break:normal] whitespace-pre-wrap",
      message.onlyMe ? "text-bubble-private-ink" : "text-bubble-ink",
      // INFO: REQUIREMENTS.md § 16.1. The live bubble's own quieter fill and dashed line, drawn the same layout-neutral way.
      isMine
        ? message.onlyMe
          ? "bg-bubble-mine-private"
          : message.silent
            ? "bg-bubble-mine-silent outline-1 -outline-offset-1 outline-bubble-silent-line outline-dashed"
            : "bg-bubble-mine"
        : message.silent
          ? "border border-dashed border-bubble-silent-line bg-bubble-theirs-silent"
          : "border border-hairline bg-bubble-theirs",
      hasNotch && (isMine ? "rounded-tr-xs" : "rounded-tl-xs"),
    );
  }

  // INFO: DESIGN.md § 6.10. One line of the quoted message, without the tap that would jump to it — the row it names may be outside the snapshot entirely.
  // INFO: DESIGN.md § 6.10. The shape is the caller's: a card above a bubble-less message, and a divider under the one inside a bubble.
  // INFO: The card above the bubble caps at § 6.5.'s 220px attachment width; left to the column's own wide cap a long quote would stretch past the photo it sits on.
  function renderQuote(className: string) {
    return (
      <div className={cn("text-caption text-meta", className)}>
        <p className="truncate">{replyToHeading}</p>
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
        className="relative flex items-center justify-center rounded-sm bg-surface-soft"
        role="img"
        style={{ width: width * scale, height: height * scale }}
        aria-label="이모티콘"
      >
        <Smile className="size-6 text-meta-soft" strokeWidth={1.5} />
        {message.silent && <SilentRing className="rounded-sm" />}
      </div>
    );
  }

  function renderAttachment(media: ChatMedia, index: number) {
    if (media.filename) {
      return (
        <FileCard
          key={media.id}
          filename={media.filename}
          sizeBytes={media.size}
          isSilent={message.silent}
          disabled
        />
      );
    }

    return (
      <MirrorMediaBox
        key={media.id}
        className="rounded-bubble"
        cell={toMirrorCell(media)}
        maxWidth={ATTACHMENT_WIDTH}
        isSilent={message.silent}
        // INFO: Once per bubble. The boxes are stacked rather than gridded here, so the second one down would be the same sentence twice on one message.
        isIconOnly={index > 0}
      />
    );
  }
}
