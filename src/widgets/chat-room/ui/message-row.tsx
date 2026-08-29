"use client";

import type { Emoticon } from "@/entities/emoticon";
import type { MessageReaction, ReplyPreview } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { ReactionBadges } from "@/features/react-message";
import { useProfileViewer } from "@/features/view-profile";
import {
  DELETED_MESSAGE_TEXT,
  MESSAGE_FLASH_DURATION,
  type InlineEmoticonMap,
} from "@/shared/config";
import {
  cn,
  findFirstUrl,
  formatTime,
  LONG_PRESS_TARGET_CLASS,
  useDoubleTap,
  useLongPress,
  type EmoticonItemId,
  type LongPressPoint,
  type Nullable,
  type Optional,
  type UserId,
} from "@/shared/lib";
import { OFFLINE_QUEUED_SEND_TEXT } from "@/shared/offline-ux";
import {
  Avatar,
  IconButton,
  InlineEmoticon,
  MediaTombstone,
  VoicePlayer,
  type MediaCell,
} from "@/shared/ui";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Clock, CornerUpLeft, Heart, RotateCcw, Share, X } from "lucide-react";
import type { CSSProperties } from "react";
import { toLinkPreviewQuery } from "../model/link-preview-query";
import { toBubbleTapHandler } from "../model/to-bubble-tap-handler";
import { toSoloEmoticonBox } from "../model/to-emoticon-box";
import { toInlineContent } from "../model/to-inline-content";
import { toLinkOnlyUrl } from "../model/to-link-only";
import { isExpandableBody, TRUNCATED_TEXT_CLASS } from "../model/to-truncated-body";
import { useSwipeToReply } from "../model/use-swipe-to-reply";
import { EmoticonBubble } from "./emoticon-bubble";
import { ExpandBodyButton } from "./expand-body-button";
import { InlineEmoticonTombstone } from "./inline-emoticon-tombstone";
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
  /** REQUIREMENTS.md § 13. One id per `OBJECT_PLACEHOLDER` in `text`, and empty for every message written before the format existed. */
  inlineEmoticonItemIds: EmoticonItemId[];
  /**
   * REQUIREMENTS.md § 13. What those ids draw, out of the map the page came down with
   * (§ 8.3.) — the same one `RowEstimateContext.readInlineEmoticon` reads.
   *
   * WARN: Required, both of them, and that is the whole of why. Optional, a caller that
   * forgot them rendered every placeholder as the font's replacement glyph and neither
   * the compiler nor the estimate said a word — which is exactly what shipped to the
   * first run of this feature.
   */
  inlineEmoticons: InlineEmoticonMap;
  media?: MediaCell[];
  emoticon?: Nullable<Emoticon>;
  /** REQUIREMENTS.md § 8.10. The message this one quotes, already resolved by the room. */
  replyTo?: Nullable<ReplyPreview>;
  /** The quoted message's sender name, resolved from the participant set (§ 8.7.). */
  /** `toQuoteHeading`'s sentence for the quoted message, composed by the room (DESIGN.md § 6.10.). */
  replyToHeading?: string;
  /** `0`–`1` while attachments upload. Ignored for a text message. */
  progress?: number;
  /** DESIGN.md § 6.5.1. The `media` index currently re-encoding, paired with `encodeProgress`. */
  encodingIndex?: Nullable<number>;
  /** `0`–`1` for the cell at `encodingIndex`. Ignored unless that index is set. */
  encodeProgress?: Nullable<number>;
  createdAt: string;
  sender: Optional<Participant>;
  isMine: boolean;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — only ever true on a bubble this reader sent, since every other read path filters the other participant's own onlyMe rows out before they reach here. */
  isOnlyMe?: boolean;
  isFirstOfGroup: boolean;
  isLastOfGroup: boolean;
  /** REQUIREMENTS.md § 8.8. How many participants have yet to read this message. `0` draws nothing — the marker counts down and disappears rather than settling on a read state. */
  unreadCount?: number;
  /** REQUIREMENTS.md § 8.8. How many participants could read it at all — a room of one reader draws the heart instead of the `1` it would otherwise count down from. */
  readerTotal?: number;
  /** REQUIREMENTS.md § 8.13. The sender has corrected the text since sending it. */
  isEdited?: boolean;
  /** REQUIREMENTS.md § 8.13. Withdrawn by its sender. The bubble keeps its place and reads `삭제된 메시지예요`; every other prop but `createdAt` and the grouping flags is ignored. */
  isDeleted?: boolean;
  /** DESIGN.md § 6.8. Flashes behind the row on arrival from a quote (§ 8.10.1.), which has no substring to mark instead. */
  isHighlighted?: boolean;
  /** REQUIREMENTS.md § 8.6.1. The open search's query, lit inside the bubble. */
  searchQuery?: string;
  /** `queued` is REQUIREMENTS.md § 8.5.'s outbox holding a send the network went out from under — it retries itself, so it takes 전송 취소 without 다시 보내기. */
  status: "sent" | "sending" | "queued" | "failed";
  /** REQUIREMENTS.md § 8.5. `SelectableRow`'s own gutter takes 40px of the row's content box that this bubble's own wide cap must give back, or the translated column overflows the row's right edge. */
  isSelecting?: boolean;
  /** REQUIREMENTS.md § 13.6. Passed straight to `EmoticonBubble`, which carries the contract — the room sets it for the one row it is about to sound. */
  awaitsArrivalSound?: boolean;
  /** REQUIREMENTS.md § 8.17. Folded away by either participant — the bubble keeps its quote and one line, and the rest is behind 펼치기. */
  isCollapsed?: boolean;
  reactions?: MessageReaction[];
  currentUserId?: UserId;
  /** AGENTS.md § 4.1. Carries the held or right-clicked element and the pointer's own position — the room anchors the desktop menu to the point, so a bubble taller than the visible area cannot carry it off screen. */
  onLongPress?: (anchor: HTMLElement, point: LongPressPoint) => void;
  /** REQUIREMENTS.md § 8.16. A tap anywhere on a cut bubble, which opens the § 6.2.2. sheet holding the whole message. */
  onExpand?: () => void;
  /** REQUIREMENTS.md § 8.17. A tap anywhere on a folded bubble, which unfolds it in place for this reader alone. */
  onUnfold?: () => void;
  /** REQUIREMENTS.md § 13.9. A tap on the emoticon, which opens the picker where that emoticon is. */
  onFollowEmoticon?: () => void;
  /** REQUIREMENTS.md § 13.6. The bubble's picture is on screen, so the room may play the sound. */
  onArrivalSoundReady?: () => void;
  /** INFO: DESIGN.md § 4.7.3. `origin` is the cell the viewer's opening morph expands out of; a file attachment passes none. */
  onOpenMedia?: (index: number, origin?: HTMLElement) => void;
  /** REQUIREMENTS.md § 8.10. The pointer affordance; touch reaches the same action through `onLongPress`. */
  onReply?: () => void;
  /** REQUIREMENTS.md § 8.11. As `onReply`: the hover control here, the action sheet on touch. Omitted for a message with nothing to hand the OS. */
  onShare?: () => void;
  onToggleReaction?: (
    reaction:
      | { reactionType: "emoji"; emoji: string }
      | { reactionType: "emoticon"; emoticonItemId: EmoticonItemId },
  ) => void;
  onOpenReply?: () => void;
  onRetry?: () => void;
  onCancel?: () => void;
};

// INFO: DESIGN.md § 6.1. Every gap is padding inside the row — the virtualizer positions rows absolutely and never sees a container `gap`.
export function MessageRow({
  className,
  bubbleClassName,
  text,
  inlineEmoticonItemIds,
  inlineEmoticons,
  media = [],
  emoticon,
  replyTo,
  replyToHeading,
  progress = 1,
  encodingIndex = null,
  encodeProgress = null,
  createdAt,
  sender,
  isMine,
  isOnlyMe = false,
  isFirstOfGroup,
  isLastOfGroup,
  unreadCount = 0,
  readerTotal = 0,
  isEdited = false,
  isDeleted = false,
  isCollapsed = false,
  isHighlighted = false,
  searchQuery,
  status,
  isSelecting = false,
  awaitsArrivalSound,
  reactions = [],
  currentUserId,
  onLongPress,
  onExpand,
  onUnfold,
  onFollowEmoticon,
  onArrivalSoundReady,
  onOpenMedia,
  onReply,
  onShare,
  onToggleReaction,
  onOpenReply,
  onRetry,
  onCancel,
}: MessageRowProps) {
  // INFO: REQUIREMENTS.md § 12.3. Read here rather than threaded down from the room — the row is what renders the avatar, and the provider is in the shell either way.
  const { openProfile } = useProfileViewer();
  // INFO: REQUIREMENTS.md § 8.5. The sweep takes the row's gestures; only the quote and 전체보기 keep a tap of their own, and neither is a swipe or a hold.
  const swipe = useSwipeToReply(isSelecting ? undefined : onReply, isMine);
  // WARN: REQUIREMENTS.md § 8.16. The same test `estimateRowHeight` makes, off `text` alone — the two decide whether this bubble is cut, and a second input to either is a bubble the estimate has not priced.
  // INFO: § 8.17. A folded row is one line already, so there is nothing left for the cut to take.
  const isTruncated = !isDeleted && !isCollapsed && isExpandableBody(text);
  // INFO: REQUIREMENTS.md § 8.16., § 8.17. Whichever of the three the bubble is offering — the fold first, since it hides the most; the quote's own tap still jumps past either.
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
    onLongPress && !isSelecting ? (point, anchor) => onLongPress(anchor, point) : undefined,
    { onFire: swipe.cancel },
  );
  const hasMedia = media.length > 0;
  // INFO: REQUIREMENTS.md § 9.3. A voice message is one attachment and § 6. keeps a bubble's attachments all of one kind, so the first cell answers for the bubble exactly as `filename` does for a file card.
  const voiceCell = media[0]?.voice ? media[0] : null;
  // WARN: REQUIREMENTS.md § 8.3. The same call `estimateRowHeight` makes, off the same two props. A lone emoticon draws bubble-less like an emoticon message, so it decides the quote's variant and the link card below exactly as an attachment does — and the estimate has already priced whichever answer this returns.
  const inline = toInlineContent(text, inlineEmoticonItemIds);
  const soloInfo = inline.kind === "solo" ? inlineEmoticons?.[inline.itemId] : undefined;
  // INFO: The id and its box together, so the branch below needs no re-narrowing of `inline` to reach either.
  // WARN: REQUIREMENTS.md § 8.17. `isCollapsed` closes this at the source rather than only in `hasArt` — the branch below tests `soloEmoticon` itself, and a folded lone mini would draw its picture where the estimate priced one clamped line.
  const soloEmoticon =
    !isCollapsed && inline.kind === "solo" && soloInfo
      ? { itemId: inline.itemId, info: soloInfo }
      : undefined;
  const soloBox = soloEmoticon ? toSoloEmoticonBox(soloEmoticon.info) : undefined;
  // WARN: § 8.3. The resolved box and not `inline.kind`. An id the page's map does not carry has nothing to draw large, so it falls through to the bubble below — and a row that still called itself bubble-less would quote twice and be priced at a picture it never draws.
  // WARN: REQUIREMENTS.md § 8.17. `estimateRowHeight`'s own rule — a folded row is the ordinary text bubble whatever its content would otherwise draw, so every art and link branch below is closed for one.
  const hasArt = !isCollapsed && (Boolean(emoticon) || hasMedia || Boolean(soloEmoticon));

  const linkOnlyUrl = hasArt || isCollapsed ? null : toLinkOnlyUrl(text, inline);
  // WARN: § 8.3. A subscription where the estimate makes a cache read, and on purpose: a link-only row priced as a bubble before the scrape answered re-renders as the card the moment it does, which is a re-measure the virtualizer compensates — a row drawing one thing while the estimate prices another is not.
  const { data: linkOnlyPreview } = useQuery({
    ...toLinkPreviewQuery(linkOnlyUrl ?? ""),
    enabled: linkOnlyUrl !== null,
  });
  // INFO: DESIGN.md § 6.9. The card stands in the bubble's place only once there is one — most links never answer (REQUIREMENTS.md § 8.9.), and a bubble-less row with nothing to draw is a blank line in the conversation.
  const linkOnlyCard = linkOnlyUrl !== null && linkOnlyPreview ? linkOnlyUrl : null;
  const isBubbleless = hasArt || linkOnlyCard !== null;
  // INFO: DESIGN.md § 6.10. An emoticon answering alone wears a badge beside itself instead of a card above — the same predicate `estimateRowHeight` reads, so the card's height is never priced for it.
  const hasReplyBadge = Boolean(replyTo) && (Boolean(emoticon) || Boolean(soloEmoticon));
  // INFO: REQUIREMENTS.md § 8.9. One card per bubble — the first link, not every link, because a message pasted from a share sheet routinely carries several.
  // INFO: DESIGN.md § 6.5. A bubble-less message carries an attachment rather than text, so there is no link in it to preview.
  const previewUrl = isBubbleless || isCollapsed ? undefined : findFirstUrl(text);

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
          // INFO: DESIGN.md § 6.2., § 6.11. The row's own content box less the avatar (`size-9`) and its `gap-xs`, matching `AssistantMessageRow`'s wide bubble — never the § 6.5. 72%. `100%` here is the row's content box, which a flex item's percentage max-width resolves against regardless of the avatar sibling actually being there for `isMine`.
          // WARN: DESIGN.md § 4.7., § 6.11. `SelectableRow` translates a `theirs` row's content 40px right rather than shrinking its container, so the extra 40px comes off `theirs`' cap instead. A `mine` row is never translated (`isTranslated={false}` on its own `SelectableRow`) — its column is already right-aligned inside the ordinary 44px cap, which is all the room the check circle on the left ever needs — so it keeps its ordinary cap even while selecting; only `isMine ? false : isSelecting` gives the gutter back.
          "relative flex flex-col gap-2xs transition-[max-width] duration-(--duration-state) ease-out motion-reduce:transition-none",
          isSelecting && !isMine ? "max-w-[calc(100%-84px)]" : "max-w-[calc(100%-44px)]",
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
        {replyTo && isBubbleless && !hasReplyBadge && (
          // WARN: Capped at DESIGN.md § 6.5.'s 220px attachment width. Left to the column's own wide cap, a long quote would stretch the card well past the photo it sits on top of.
          <ReplyQuote
            className="max-w-55"
            replyTo={replyTo}
            heading={replyToHeading ?? ""}
            variant="card"
            isMine={isMine}
            isFirstOfGroup={isFirstOfGroup}
            onOpen={onOpenReply}
          />
        )}
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
        {/* WARN: `max-w-full` is what holds the bubble inside the column's own wide cap. The column aligns rather than stretches, so this stack is sized `fit-content` — and that floors at min-content, which a quote's `truncate` makes the whole width of its line. Only a max-width clamps below that; a `min-w-0` here does nothing. */}
        <div className={cn("flex max-w-full items-end gap-2xs", isMine && "flex-row-reverse")}>
          {emoticon ? (
            // INFO: DESIGN.md § 6.5. An emoticon renders without a bubble, border or background, for the same reason an attachment does.
            // WARN: REQUIREMENTS.md § 13.9. The marker the room's panel dismissal looks for. A tap on the history closes the emoticon panel (§ 13.6.), and this tap re-aims it — without the exclusion the `pointerup` closes it a frame before the `click` opens it again.
            <div
              className={cn(
                "relative rounded-sm",
                LONG_PRESS_TARGET_CLASS,
                status !== "sent" && "opacity-60",
              )}
              data-emoticon-bubble
              {...longPressHandlers}
            >
              <EmoticonBubble
                emoticon={emoticon}
                awaitsArrivalSound={awaitsArrivalSound}
                onFollow={onFollowEmoticon}
                onArrivalSoundReady={onArrivalSoundReady}
              />
            </div>
          ) : soloEmoticon && soloBox ? (
            // INFO: § 13. One emoticon and no words, drawn at `toSoloEmoticonBox` — the same absence of a bubble an emoticon message takes, but a smaller ceiling than `toEmoticonBox`'s so the two kinds read apart. A mini never occupies `messages.emoticon_item_id`, so this is a rendering rule read off the content rather than a second kind of row.
            // WARN: § 8.3. The box is the **stored** one and never the loaded asset's, so it is the same before and after the image arrives — and `estimateRowHeight` prices it through the identical `toSoloEmoticonBox` call.
            // WARN: `lineHeight` is what resizes the shared `InlineEmoticon`, whose own `1lh` is otherwise one line of body text. It is an inline style there, so no class could win it — setting the line-height this box inherits is the one lever that reaches it, and it lands exactly: `1lh × width/height` is `toSoloEmoticonBox`'s own width by construction.
            <div
              className={cn(
                "relative rounded-sm",
                LONG_PRESS_TARGET_CLASS,
                status !== "sent" && "opacity-60",
              )}
              style={{ ...soloBox, lineHeight: `${soloBox.height}px` }}
              {...longPressHandlers}
            >
              {soloEmoticon.info.isDeleted ? (
                <InlineEmoticonTombstone className="rounded-md" iconClassName="size-5" />
              ) : (
                <InlineEmoticon
                  itemId={soloEmoticon.itemId}
                  version={soloEmoticon.info.version}
                  width={soloEmoticon.info.width}
                  height={soloEmoticon.info.height}
                  name={soloEmoticon.info.name}
                  hasAudio={soloEmoticon.info.hasAudio}
                  isTappable
                  awaitsArrivalSound={awaitsArrivalSound}
                  onArrivalSoundReady={onArrivalSoundReady}
                />
              )}
            </div>
          ) : linkOnlyCard ? (
            // INFO: DESIGN.md § 6.9. Where a photo would stand, and no bubble — the bubble would only repeat the address the card names.
            // WARN: `w-55 min-w-0` and not the top card's `w-full max-w-55`: this one shares its row with the timestamp, whose `shrink-0` makes the card the thing that gives on a narrow shell — which § 8.3.'s estimate prices as the column less `TIME_SLOT`.
            <div
              className={cn(
                "w-55 min-w-0",
                LONG_PRESS_TARGET_CLASS,
                status !== "sent" && "opacity-60",
              )}
              {...longPressHandlers}
            >
              <LinkPreviewCard url={linkOnlyCard} />
            </div>
          ) : voiceCell ? (
            // INFO: REQUIREMENTS.md § 9.3. `VoicePlayer` draws its own fill, so the row hands it only the notch corner the group rule asks for (DESIGN.md § 6.2.).
            // WARN: The waveform's tap is a `pointerdown` on a descendant of this wrapper, so the hold's click capture still reaches it — a held finger opens the sheet and the seek it would have made is swallowed with the release.
            <div className={LONG_PRESS_TARGET_CLASS} {...longPressHandlers}>
              {voiceCell.isDeleted ? (
                // INFO: The finished restructure. `VOICE_CARD_HEIGHT`'s own `h-14` and the player's own radius, so the row keeps its height and its shape — the transport would otherwise draw a waveform over an object that is gone.
                <MediaTombstone className="h-14 w-55 flex-row rounded-bubble" cell={voiceCell} />
              ) : (
                <VoicePlayer
                  className={cn(isFirstOfGroup && (isMine ? "rounded-tr-xs" : "rounded-tl-xs"))}
                  src={voiceCell.originalUrl}
                  durationMs={voiceCell.durationMs ?? 0}
                  peaks={voiceCell.voice?.peaks ?? []}
                  isMine={isMine}
                  isOnlyMe={isOnlyMe}
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
                isOnlyMe={isOnlyMe}
                encodingIndex={encodingIndex}
                encodeProgress={encodeProgress}
                onOpen={onOpenMedia}
              />
            </div>
          ) : (
            // INFO: DESIGN.md § 6.2. The notch marks the sender's side and only on the first bubble of a group; the rest stay fully rounded.
            <div
              className={cn(
                // INFO: DESIGN.md § 4.2.3. `break-normal` opts the bubble out of the app's `keep-all`: Korean body copy breaks between syllables, and a whole-어절 push otherwise leaves the worst gaps.
                // WARN: The arbitrary property and never `break-normal`, which also sets `overflow-wrap: normal` — that would leave `wrap-anywhere` winning on Tailwind's emission order alone, and a long URL overflowing the column the day it changes.
                // WARN: `min-w-0` is the other half of the stack's `max-w-full`. A flex item does not shrink below its own min-content without it, and a quote's `truncate` is min-content the whole width of its line.
                "min-w-0 rounded-bubble px-sm py-xs text-chat-body wrap-anywhere [word-break:normal] whitespace-pre-wrap transition-colors select-text",
                LONG_PRESS_TARGET_CLASS,
                // INFO: REQUIREMENTS.md § 16.1. 나에게만 보내기 reads the other theme's fill/ink, on both counts — a withdrawn onlyMe row keeps `only_me` on its tombstone, so the private colour survives the delete along with the bubble's shape and side.
                isOnlyMe ? "text-bubble-private-ink" : "text-bubble-ink",
                isMine
                  ? isOnlyMe
                    ? "bg-bubble-mine-private active:bg-bubble-mine-private-pressed"
                    : "bg-bubble-mine active:bg-bubble-mine-pressed"
                  : "border border-hairline bg-bubble-theirs active:bg-bubble-theirs-pressed",
                isFirstOfGroup && (isMine ? "rounded-tr-xs" : "rounded-tl-xs"),
                // INFO: DESIGN.md § 6.5. Optimistic and failed bubbles dim instead of showing a spinner.
                status !== "sent" && "opacity-60",
                // INFO: DESIGN.md § 6.2.1. A tombstone keeps the bubble's shape and side so the timeline still reads as a conversation, and gives up its ink — it is a note about a message rather than one.
                isDeleted && (isOnlyMe ? "text-bubble-private-ink/55" : "text-bubble-ink/55"),
                isDeleted && "italic select-none",
                bubbleClassName,
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
              {/* WARN: REQUIREMENTS.md § 8.13. Ahead of everything else in the bubble, and it returns nothing else. A withdrawn row carries no text, no quote and no attachment, so every branch below it would render empty — but the estimate in `estimateRowHeight` prices exactly this one line, and a stray sibling here is height it cannot see. */}
              {isDeleted ? (
                DELETED_MESSAGE_TEXT
              ) : (
                <>
                  {replyTo && (
                    // INFO: DESIGN.md § 6.10. The divider is the bubble's, not the quote's — it separates two things and only this caller has both. `REQUIREMENTS.md § 8.3.` prices it at the same call site.
                    <ReplyQuote
                      className="mb-2xs border-b border-quote-divider pb-2xs"
                      replyTo={replyTo}
                      heading={replyToHeading ?? ""}
                      onOpen={onOpenReply}
                    />
                  )}
                  {text && (
                    // WARN: REQUIREMENTS.md § 8.3. `line-clamp` lays out exactly this many line boxes, which is the whole reason the cut is expressible in the estimate — a `max-height` would leave a partial line the arithmetic has no name for.
                    <MessageText
                      className={cn(
                        isCollapsed ? "line-clamp-1" : isTruncated && TRUNCATED_TEXT_CLASS,
                      )}
                      text={text}
                      inlineEmoticonItemIds={inlineEmoticonItemIds}
                      inlineEmoticons={inlineEmoticons}
                      query={searchQuery}
                    />
                  )}
                  {/* WARN: REQUIREMENTS.md § 8.3. Never conditioned on `onExpand`. The estimate prices this row from `text` alone, so a caller that forgot the handler must still draw the box it reserved rather than silently losing it. */}
                  {isTruncated && <ExpandBodyButton label="전체보기" onClick={onExpand} />}
                  {isCollapsed && (
                    <ExpandBodyButton label="펼치기" Icon={ChevronDown} onClick={onUnfold} />
                  )}
                </>
              )}
            </div>
          )}
          {hasReplyBadge && (
            // WARN: REQUIREMENTS.md § 8.3. `size-8` is `REPLY_BADGE` in the estimate; it stands in the same `items-end` row as the timestamp, so its height is the floor of the row and nothing else about it may grow.
            // WARN: REQUIREMENTS.md § 8.5. `pointer-events-auto` keeps the jump reachable under `SelectableRow`'s sweep, as `ReplyQuote`'s own button does.
            <button
              className="pointer-events-auto flex size-8 shrink-0 cursor-pointer items-center justify-center self-start rounded-full bg-surface-soft text-meta ring-1 ring-hairline transition-colors outline-none ring-inset hover:text-ink focus-visible:ring-primary active:bg-surface-strong"
              type="button"
              aria-label="답장한 메시지로 이동"
              onClick={onOpenReply}
            >
              <CornerUpLeft className="size-4" strokeWidth={1.75} />
            </button>
          )}
          {status === "failed" || status === "queued" ? (
            // INFO: DESIGN.md § 6.5. The failure affordance sits on the outer side of the bubble; cancel is beside retry so a send that cannot succeed can still be cleared.
            <div className="flex shrink-0 flex-col">
              {status === "failed" ? (
                <IconButton
                  buttonClassName="size-9 text-semantic-error hover:bg-primary-tint hover:text-semantic-error-hover"
                  iconClassName="size-4"
                  Icon={RotateCcw}
                  haptic
                  aria-label="다시 보내기"
                  onClick={onRetry}
                />
              ) : (
                // WARN: A glyph and not a button. The outbox retries this itself on `online`, so a 다시 보내기 here would offer the reader work that is already promised — and in `semantic-error`, for a send nothing has refused.
                <span
                  className="inline-flex size-9 items-center justify-center text-meta"
                  role="img"
                  aria-label={OFFLINE_QUEUED_SEND_TEXT}
                >
                  <Clock className="size-4" strokeWidth={1.75} />
                </span>
              )}
              {/* INFO: Reachable on both, and that is the whole of why `queued` renders a column at all — a message waiting out a tunnel is otherwise one the reader can neither send nor be rid of. */}
              <IconButton
                className="size-9"
                iconClassName="size-4"
                Icon={X}
                aria-label="전송 취소"
                onClick={onCancel}
              />
            </div>
          ) : (
            (isLastOfGroup || unreadCount > 0 || isEdited || onReply || onShare) && (
              // INFO: DESIGN.md § 6.3. One timestamp per minute-group, on its last bubble; § 8.8.'s unread count and § 8.13.'s 수정됨 stack above it on the bubbles that carry them.
              // WARN: REQUIREMENTS.md § 8.3. A fixed `w-[68px]`, wide enough for the longest `오후 12:34` — widened past the timestamp's own 56px floor to match the § 8.10./§ 8.11. hover pill sharing this column, since the two can never disagree about the width the § 8.3. estimate reserves. It is beside the bubble rather than under it, so its width comes off the width the text wraps in — left to size itself, the estimate would have to re-measure a string it cannot see, and would flip a whole line wherever it guessed wrong.
              // WARN: `whitespace-nowrap` guards the fixed width above. `오후 12:34` clears it easily now, and the app's font is `display: swap` — a wider fallback on the first paint would wrap the time onto a second line, breaking § 6.3.'s one-line rule and the § 8.3. estimate that trusts it. Invisible to a developer whose webfont is already cached.
              // INFO: DESIGN.md § 7.16. The clock keeps `chat-meta`'s quiet tone and takes the lift instead — over a wallpaper it is unreadable for the same reason the name was, but making it darker would give it emphasis it is not owed.
              // WARN: `relative`, and always rendered whenever a hover action exists — the § 8.10./§ 8.11. pill overlays exactly this box (`renderHoverActions`) rather than sitting beside it, so the box has to exist even on a mid-group bubble that shows no timestamp of its own.
              <div
                className={cn(
                  "relative flex w-[68px] shrink-0 flex-col text-chat-time whitespace-nowrap text-chat-meta",
                  // INFO: DESIGN.md § 6.3. The clock hugs the bubble's edge of the slot, not the column's — the slot is wider than the time it holds.
                  isMine ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "flex flex-col transition-opacity",
                    isMine ? "items-end" : "items-start",
                    // INFO: The pill takes this box's place on hover rather than sitting beside it — the timestamp/unread/수정됨 stack keeps its box (so grouping math never moves) and only its opacity changes.
                    (onReply || onShare) &&
                      "group-focus-within/row:opacity-0 group-hover/row:opacity-0",
                  )}
                >
                  {/* INFO: REQUIREMENTS.md § 8.13. Beside the bubble rather than inside it — the § 8.3. estimate wraps the body text in one font, and a label of another size sharing that measurement is exactly what it cannot express. Here it is a whole line whose height is already known. */}
                  {isEdited && <span>수정됨</span>}
                  {/* INFO: REQUIREMENTS.md § 8.8. KakaoTalk's own marker — how many have yet to read it, gone entirely at zero rather than turning into a read state. `unread` is the token the tab-bar badge already uses (DESIGN.md § 4.1.4.), so the one number in the room that counts something live is the one thing here not in `chat-meta`. */}
                  {/* WARN: `tabular-nums` so a count that changes under the reader cannot change the line's width, and `aria-label` because a bare digit beside a bubble reads as nothing to a screen reader. */}
                  {unreadCount > 0 &&
                    (readerTotal === 1 ? (
                      // INFO: REQUIREMENTS.md § 8.8. One reader has no count to make — a `1` that only ever reads `1` is a heart, and it leaves at zero exactly as the digit did.
                      // WARN: `h-[1lh]` so the marker is the same one `chat-time` line the digit was, which is what keeps § 8.3.'s estimate a `Number()` of a predicate.
                      <span
                        className="flex h-[1lh] items-center text-unread"
                        role="img"
                        aria-label="읽지 않음"
                      >
                        <Heart className="size-2.5 fill-current" strokeWidth={0} />
                      </span>
                    ) : (
                      <span
                        className="text-unread tabular-nums"
                        aria-label={`읽지 않음 ${unreadCount}`}
                      >
                        {unreadCount}
                      </span>
                    ))}
                  {isLastOfGroup && <time dateTime={createdAt}>{formatTime(createdAt)}</time>}
                </div>
                {renderHoverActions()}
              </div>
            )
          )}
        </div>
        {reactions.length > 0 && currentUserId && onToggleReaction && (
          <ReactionBadges
            className={cn(isMine ? "justify-end" : "justify-start")}
            reactions={reactions}
            currentUserId={currentUserId}
            onToggleReaction={onToggleReaction}
          />
        )}
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
   * WARN: DESIGN.md § 6.3. One pill, always horizontal, replacing the timestamp/unread
   * stack in place rather than sitting beside or above it — it is `absolute` inside the
   * same `relative` box that stack renders in, which is what the previous
   * sibling-inside-the-column-edge version still risked drifting
   * out of step with. `HOVER_PILL_WIDTH` (`estimate-row-height.ts`) is what raised
   * that shared box past 56px to fit the pill, so the bubble's own wrap already
   * leaves it room rather than the pill ever covering the bubble's text. Out of flow
   * for the same reason as before — in flow it would only exist while hovered, and
   * its appearance would shove the bubble sideways under the cursor aiming at it —
   * and because it is `absolute`, a one-line bubble whose box is shorter than the
   * pill's own height lets it overflow **upward** rather than adding to that box's
   * (and so the row's) flow height.
   */
  function renderHoverActions() {
    if (!onReply && !onShare) {
      return null;
    }

    return (
      <div
        className={cn(
          "absolute bottom-0 flex w-fit items-center gap-0.5 rounded-full border border-hairline bg-surface-soft px-1 py-0.5 shadow-raised",
          // WARN: `w-fit` on the bubble's own edge of the 68px slot, never `inset-x-0` — a row with 답장 alone (an emoticon has nothing to 공유) would otherwise stretch the pill across the slot and hang half of it empty.
          isMine ? "right-0" : "left-0",
          // INFO: `hover:` already resolves under `@media (hover: hover)`, so a touch device never reveals these and never has to.
          "pointer-events-none opacity-0 transition-opacity group-hover/row:pointer-events-auto group-hover/row:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100",
        )}
      >
        {onReply && (
          <IconButton
            className="size-7"
            iconClassName="size-4"
            Icon={CornerUpLeft}
            aria-label="답장"
            onClick={onReply}
          />
        )}
        {onShare && (
          <IconButton
            className="size-7"
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
