"use client";

import type { Emoticon } from "@/entities/emoticon";
import type { ReplyPreview } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { useProfileViewer } from "@/features/view-profile";
import { DELETED_MESSAGE_TEXT, MESSAGE_FLASH_DURATION } from "@/shared/config";
import {
  LONG_PRESS_TARGET_CLASS,
  cn,
  findFirstUrl,
  formatTime,
  useLongPress,
  type Nullable,
  type Optional,
} from "@/shared/lib";
import { Avatar, IconButton, MediaTombstone, VoicePlayer, type MediaCell } from "@/shared/ui";
import { CornerUpLeft, RotateCcw, Share, X } from "lucide-react";
import type { CSSProperties } from "react";
import { useSwipeToReply } from "../model/use-swipe-to-reply";
import { EmoticonBubble } from "./emoticon-bubble";
import { LinkPreviewCard } from "./link-preview-card";
import { MediaGrid } from "./media-grid";
import { MessageText } from "./message-text";
import { ReplyQuote } from "./reply-quote";

// INFO: Hoisted because the length is a constant — a fresh object per render of every flashing row is an allocation that can never differ from this one.
const FLASH_STYLE = {
  "--message-flash-duration": `${MESSAGE_FLASH_DURATION}ms`,
} as CSSProperties;

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
  /** REQUIREMENTS.md § 8.13. The sender has corrected the text since sending it. */
  isEdited?: boolean;
  /** REQUIREMENTS.md § 8.13. Withdrawn by its sender. The bubble keeps its place and reads `삭제된 메시지예요`; every other prop but `createdAt` and the grouping flags is ignored. */
  isDeleted?: boolean;
  /** DESIGN.md § 6.8. Flashes behind the row on arrival from a quote (§ 8.10.1.), which has no substring to mark instead. */
  isHighlighted?: boolean;
  /** REQUIREMENTS.md § 8.6.1. The open search's query, lit inside the bubble. */
  searchQuery?: string;
  status: "sent" | "sending" | "failed";
  onLongPress?: () => void;
  /** REQUIREMENTS.md § 13.9. A tap on the emoticon, which opens the picker where that emoticon is. */
  onFollowEmoticon?: () => void;
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
  isEdited = false,
  isDeleted = false,
  isHighlighted = false,
  searchQuery,
  status,
  onLongPress,
  onFollowEmoticon,
  onOpenMedia,
  onReply,
  onShare,
  onOpenReply,
  onRetry,
  onCancel,
}: MessageRowProps) {
  // INFO: REQUIREMENTS.md § 12.3. Read here rather than threaded down from the room — the row is what renders the avatar, and the provider is in the shell either way.
  const { openProfile } = useProfileViewer();
  const swipe = useSwipeToReply(onReply, isMine);
  const longPressHandlers = useLongPress(onLongPress, { onFire: swipe.cancel });
  const hasMedia = media.length > 0;
  // INFO: REQUIREMENTS.md § 9.3. A voice message is one attachment and § 6. keeps a bubble's attachments all of one kind, so the first cell answers for the bubble exactly as `filename` does for a file card.
  const voiceCell = media[0]?.voice ? media[0] : null;
  // INFO: REQUIREMENTS.md § 8.9. One card per bubble — the first link, not every link, because a message pasted from a share sheet routinely carries several.
  // INFO: DESIGN.md § 6.5. A bubble-less message carries an attachment rather than text, so there is no link in it to preview.
  const previewUrl = emoticon || hasMedia ? undefined : findFirstUrl(text);

  return (
    // INFO: DESIGN.md § 6.10. The flash is on the row rather than on the bubble's own fill, so a media or emoticon message — which has no fill — highlights the same way a text one does.
    // WARN: `message-flash` paints and times itself, and it is the row's *background* — nothing here may become a border, a ring or a spacer, since REQUIREMENTS.md § 8.3.'s estimate prices this box without ever seeing the flash.
    // WARN: The class and the variable travel together. `message-flash` reads its length from `--message-flash-duration` alone, and an unresolved `var()` there is an animation that never plays rather than an error.
    <div
      className={cn(
        "group/row flex gap-xs px-md",
        isFirstOfGroup ? "pt-sm" : "pt-2xs",
        isMine && "justify-end",
        isHighlighted && "message-flash",
        className,
      )}
      style={isHighlighted ? FLASH_STYLE : undefined}
    >
      {!isMine &&
        (isFirstOfGroup ? (
          // INFO: REQUIREMENTS.md § 8.7. Resolved from the participant set at render time, never copied onto the message row, so a profile change reaches every past bubble.
          // INFO: REQUIREMENTS.md § 12.3. The tap opens the profile screen rather than the photo — the enlargement is still there, one level in, on that screen's own avatar.
          <Avatar
            name={sender?.name ?? ""}
            mediaId={sender?.avatarMediaId}
            onClick={sender ? () => openProfile(sender.id) : undefined}
          />
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
          // INFO: DESIGN.md § 4.1.4. `chat-sender`, not `chat-meta` — the name says who is speaking and has to clear AA at 12px, which the clock's tone does not.
          <span className="px-2xs text-chat-name text-chat-sender">{sender?.name}</span>
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
          /* WARN: `empty:hidden` because `LinkPreviewCard` renders nothing until the scrape answers, and for most links it never does (REQUIREMENTS.md § 8.9.). An empty flex item still takes the column's `gap-2xs`, so without this every link message carries 4px of dead space that § 8.3.'s estimate cannot see. */
          <div
            className={cn("w-full max-w-55 empty:hidden", LONG_PRESS_TARGET_CLASS)}
            {...longPressHandlers}
          >
            <LinkPreviewCard url={previewUrl} />
          </div>
        )}
        <div className={cn("flex items-end gap-2xs", isMine && "flex-row-reverse")}>
          {emoticon ? (
            // INFO: DESIGN.md § 6.5. An emoticon renders without a bubble, border or background, for the same reason an attachment does.
            // WARN: REQUIREMENTS.md § 13.9. The marker the room's panel dismissal looks for. A tap on the history closes the emoticon panel (§ 13.6.), and this tap re-aims it — without the exclusion the `pointerup` closes it a frame before the `click` opens it again.
            <div
              className={cn(LONG_PRESS_TARGET_CLASS, status !== "sent" && "opacity-60")}
              data-emoticon-bubble
              {...longPressHandlers}
            >
              <EmoticonBubble emoticon={emoticon} onFollow={onFollowEmoticon} />
            </div>
          ) : voiceCell ? (
            // INFO: REQUIREMENTS.md § 9.3. `VoicePlayer` draws its own fill, so the row hands it only the notch corner the group rule asks for (DESIGN.md § 6.2.).
            // WARN: The waveform's tap is a `pointerdown` on a descendant of this wrapper, so the hold's click capture still reaches it — a held finger opens the sheet and the seek it would have made is swallowed with the release.
            <div className={LONG_PRESS_TARGET_CLASS} {...longPressHandlers}>
              {voiceCell.isDeleted ? (
                // INFO: RESTRUCTURE.md § 4.3. `VOICE_CARD_HEIGHT`'s own `h-14` and the player's own radius, so the row keeps its height and its shape — the transport would otherwise draw a waveform over an object that is gone.
                <MediaTombstone className="h-14 w-55 flex-row rounded-bubble" cell={voiceCell} />
              ) : (
                <VoicePlayer
                  className={cn(isFirstOfGroup && (isMine ? "rounded-tr-xs" : "rounded-tl-xs"))}
                  src={voiceCell.originalUrl}
                  durationMs={voiceCell.durationMs ?? 0}
                  peaks={voiceCell.voice?.peaks ?? []}
                  isMine={isMine}
                  isPending={status !== "sent"}
                />
              )}
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
                // INFO: DESIGN.md § 6.2.1. A tombstone keeps the bubble's shape and side so the timeline still reads as a conversation, and gives up its ink — it is a note about a message rather than one.
                isDeleted && "text-bubble-ink/55 italic select-none",
                bubbleClassName,
              )}
              {...longPressHandlers}
            >
              {/* WARN: REQUIREMENTS.md § 8.13. Ahead of everything else in the bubble, and it returns nothing else. A withdrawn row carries no text, no quote and no attachment, so every branch below it would render empty — but the estimate in `estimateRowHeight` prices exactly this one line, and a stray sibling here is height it cannot see. */}
              {isDeleted ? (
                DELETED_MESSAGE_TEXT
              ) : (
                <>
                  {replyTo && (
                    <ReplyQuote
                      className="mb-2xs"
                      replyTo={replyTo}
                      name={replyToName}
                      onOpen={onOpenReply}
                    />
                  )}
                  {text && <MessageText text={text} query={searchQuery} />}
                </>
              )}
            </div>
          )}
          {status === "failed" ? (
            // INFO: DESIGN.md § 6.5. The failure affordance sits on the outer side of the bubble; cancel is beside retry so a send that cannot succeed can still be cleared.
            <div className="flex shrink-0 flex-col">
              <IconButton
                buttonClassName="size-9 text-semantic-error hover:bg-primary-tint hover:text-semantic-error-hover"
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
            (isLastOfGroup || isRead || isEdited) && (
              // INFO: DESIGN.md § 6.3. One timestamp per minute-group, on its last bubble; § 8.8.'s 읽음 and § 8.13.'s 수정됨 stack above it on the bubbles that carry them.
              // WARN: REQUIREMENTS.md § 8.3. A fixed `w-14`, wide enough for the longest `오후 12:34`. It is beside the bubble rather than under it, so its width comes off the width the text wraps in — left to size itself, the § 8.3. row estimate would have to re-measure a string it cannot see, and would flip a whole line wherever it guessed wrong.
              // WARN: `whitespace-nowrap` guards the fixed width above. `오후 12:34` clears 56px only just, and the app's font is `display: swap` — a wider fallback on the first paint would wrap the time onto a second line, breaking § 6.3.'s one-line rule and the § 8.3. estimate that trusts it. Invisible to a developer whose webfont is already cached.
              // INFO: DESIGN.md § 7.16. The clock keeps `chat-meta`'s quiet tone and takes the lift instead — over a wallpaper it is unreadable for the same reason the name was, but making it darker would give it emphasis it is not owed.
              <div className="flex w-14 shrink-0 flex-col items-end text-chat-time whitespace-nowrap text-chat-meta">
                {/* INFO: REQUIREMENTS.md § 8.13. Beside the bubble rather than inside it — the § 8.3. estimate wraps the body text in one font, and a label of another size sharing that measurement is exactly what it cannot express. Here it is a whole line whose height is already known. */}
                {isEdited && <span>수정됨</span>}
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
