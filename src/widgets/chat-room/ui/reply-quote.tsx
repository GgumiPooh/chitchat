"use client";

import type { ReplyPreview } from "@/entities/message";
import { toEmoticonAssetUrl, toMediaUrl, type QuoteThumbnail } from "@/shared/config";
import { cn } from "@/shared/lib";
import { PreloadImage } from "@/shared/ui";
import { Trash2 } from "lucide-react";
import { toReplySummary } from "../model/to-reply-summary";

export type ReplyQuoteProps = {
  className?: string;
  headingClassName?: string;
  summaryClassName?: string;
  replyTo: ReplyPreview;
  /** `toQuoteHeading`'s sentence, composed by the caller — the name in it is resolved from the participant set and never carried on the wire (REQUIREMENTS.md § 8.7.). */
  heading: string;
  /**
   * DESIGN.md § 6.10. `rule` sits on a surface that already exists — inside a bubble,
   * inside the composer pill — and draws nothing of its own. `card` is for a message
   * that has no bubble to sit in.
   */
  variant?: "rule" | "card";
  /** DESIGN.md § 6.2. Whose message the quote stands on, which is what the `card` variant takes its fill from — the `rule` one draws none. */
  isMine?: boolean;
  /** DESIGN.md § 6.2. The notch corner, which the `card` variant carries because it stands where the run's first bubble would. */
  hasNotch?: boolean;
  /** Absent while the quote is staged in the composer, where there is nothing to jump to yet. */
  onOpen?: () => void;
};

/**
 * DESIGN.md § 6.10. The message a reply points at: who wrote it, over one line of
 * what it said. Tapping it jumps to the original (REQUIREMENTS.md § 8.6.1.).
 *
 * WARN: The thumbnail's box is fixed rather than derived from the image. It is the
 * only asset in the quote, and a row whose height settles after the asset loads is
 * what § 8.3. forbids on this list.
 */
export function ReplyQuote({
  className,
  headingClassName,
  summaryClassName,
  replyTo,
  heading,
  variant = "rule",
  isMine = false,
  hasNotch = false,
  onOpen,
}: ReplyQuoteProps) {
  const shape = cn(
    "flex w-full min-w-0 items-center gap-xs text-left transition-colors outline-none",
    // INFO: DESIGN.md § 6.10. `rule` is bare — the surface it sits in is already one, and what separates it from the text below is the divider that surface's own caller draws.
    // INFO: DESIGN.md § 6.2. The card **is** the bubble the message does not have, so it takes that shape whole — radius, notch, padding and fill. Anything of its own reads as a second kind of bubble in a column that has one.
    variant === "card" &&
      cn(
        "rounded-bubble px-sm py-xs",
        isMine ? "bg-bubble-mine" : "border border-hairline bg-bubble-theirs",
        hasNotch && (isMine ? "rounded-tr-xs" : "rounded-tl-xs"),
      ),
    className,
  );

  // INFO: A staged quote has nothing to jump to yet, and a button that does nothing is still a tab stop — so the composer's copy is not one.
  if (!onOpen) {
    return <div className={shape}>{renderContent()}</div>;
  }

  return (
    <button
      // WARN: REQUIREMENTS.md § 8.5. `pointer-events-auto` is what keeps the jump reachable under `SelectableRow`'s sweep, where the bubble's own whole-body tap becomes the row's toggle.
      className={cn(
        shape,
        "pointer-events-auto cursor-pointer opacity-90 hover:opacity-100 focus-visible:opacity-100",
      )}
      type="button"
      aria-label="답장한 메시지로 이동"
      onClick={onOpen}
    >
      {renderContent()}
    </button>
  );

  function renderContent() {
    return (
      <>
        {replyTo.thumbnail && renderThumbnail(replyTo.thumbnail)}
        <span className="flex min-w-0 flex-col">
          <span className={cn("truncate text-chat-time text-chat-meta", headingClassName)}>
            {heading}
          </span>
          {/* INFO: One line, always — a quote that grows with the message it points at competes with the reply itself. */}
          <span
            className={cn("truncate text-chat-name leading-snug text-meta-soft", summaryClassName)}
          >
            {toReplySummary(replyTo)}
          </span>
        </span>
      </>
    );
  }

  /**
   * WARN: One 32px box for both kinds, and `QUOTE_THUMBNAIL` prices exactly that one —
   * a margin, a padding or a border on either would have to be added to the § 8.3.
   * estimate as well. Everything that differs below is inside the box.
   *
   * INFO: DESIGN.md § 6.10.'s ring and radius frame a photograph, which fills its box.
   * Emoticon art is transparent-background and non-square (§ 13.2.), so it is fitted
   * rather than cropped and takes neither — a ring around it is a box drawn around nothing.
   */
  function renderThumbnail(thumbnail: QuoteThumbnail) {
    // INFO: REQUIREMENTS.md § 10. The icon alone — at 32px there is no room for the sentence `MediaTombstone` draws, and the summary line beside it already names what the message was.
    if (thumbnail.kind === "deleted") {
      return (
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-xs bg-surface-soft ring-1 ring-hairline ring-inset"
          aria-hidden
        >
          <Trash2 className="size-4 text-meta-soft" strokeWidth={1.75} />
        </span>
      );
    }

    if (thumbnail.kind === "emoticon") {
      return (
        // WARN: `hasSkeleton={false}` for the reason the ring is off. `Skeleton` is an opaque `surface-strong` square, so the tile that refuses to frame transparent art would otherwise draw exactly that frame for as long as the asset takes to decode.
        <PreloadImage
          className="size-8 shrink-0"
          imgClassName="size-full object-contain"
          src={toEmoticonAssetUrl(thumbnail.itemId, "still-image", thumbnail.version)}
          hasSkeleton={false}
          alt=""
        />
      );
    }

    if (thumbnail.kind === "link") {
      return (
        // WARN: `canRetry` off and `no-referrer` as the § 6.9. card sets them — this is the same third-party image, on a host we do not own (REQUIREMENTS.md § 8.9.).
        <PreloadImage
          className="size-8 shrink-0 overflow-hidden rounded-xs"
          imgClassName="size-full object-cover ring-1 ring-hairline ring-inset"
          src={thumbnail.imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          canRetry={false}
        />
      );
    }

    return (
      <PreloadImage
        className="size-8 shrink-0 overflow-hidden rounded-xs"
        imgClassName="size-full object-cover ring-1 ring-hairline ring-inset"
        src={toMediaUrl(thumbnail.mediaId)}
        alt=""
      />
    );
  }
}
