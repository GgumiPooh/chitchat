"use client";

import type { InlineEmoticonMap, MessageSegment } from "@/shared/config";
import { cn, splitTextByQuery, splitTextByUrls, type EmoticonItemId } from "@/shared/lib";
import { InlineEmoticon } from "@/shared/ui";
import { Fragment } from "react";
import { toInlineContent } from "../model/to-inline-content";
import { toInlineEmoticonBox } from "../model/to-inline-emoticon-box";
import { InlineEmoticonTombstone } from "./inline-emoticon-tombstone";

export type MessageTextProps = {
  className?: string;
  markClassName?: string;
  text: string;
  /** REQUIREMENTS.md § 13. One id per `OBJECT_PLACEHOLDER` in `text`; empty for every message written before the format existed. */
  inlineEmoticonItemIds?: EmoticonItemId[];
  /** REQUIREMENTS.md § 13. What each of those ids draws, out of the map the page came down with (§ 8.3.). */
  inlineEmoticons?: InlineEmoticonMap;
  /** REQUIREMENTS.md § 8.6.1. Lit in the bubble while a search is open; empty the rest of the time. */
  query?: string;
};

const NO_EMOTICONS: InlineEmoticonMap = {};

/**
 * DESIGN.md § 6.9. The body of a text bubble, with any link in it made tappable and any
 * emoticon in it drawn between the characters.
 *
 * INFO: The URL is left in the text rather than replaced by the card's title —
 * what the sender typed is what the bubble says, and the card above it is an
 * addition to the message, not a rewrite of it.
 */
export function MessageText({
  className,
  markClassName,
  text,
  inlineEmoticonItemIds,
  inlineEmoticons = NO_EMOTICONS,
  query = "",
}: MessageTextProps) {
  const inline = toInlineContent(text, inlineEmoticonItemIds);

  return (
    <span className={cn(className)}>
      {/* WARN: § 8.3. The `none` branch has to stay literally the old call. A message with no emoticon in it is every message written before this format, and `estimateRowHeight` prices those through `countTextLines` — one segment routed through the run walker instead would be a bubble the estimate no longer matches. */}
      {/* INFO: `solo` walks the segments too. `MessageRow` draws that case bubble-less and never reaches here, but a caller that did would otherwise print the placeholder character itself. */}
      {inline.kind === "none"
        ? renderText(text)
        : inline.segments.map((segment, index) => (
            <Fragment key={index}>{renderSegment(segment)}</Fragment>
          ))}
    </span>
  );

  function renderSegment(segment: MessageSegment) {
    if (segment.kind === "text") {
      return renderText(segment.text);
    }

    const info = inlineEmoticons[segment.itemId];
    // WARN: § 8.3. The box comes from here and `toInlineRuns` prices the same call — an id sized in one and guessed in the other is a bubble wider than the estimate reserved.
    const box = toInlineEmoticonBox(info);

    if (info && box.isKnown && !info.isDeleted) {
      return (
        <InlineEmoticon
          itemId={segment.itemId}
          version={info.version}
          width={info.width}
          height={info.height}
          name={info.name}
        />
      );
    }

    // INFO: § 13. A deleted item keeps its stored box, so the replacement occupies exactly what the picture did; an id the page never sized takes the square `toInlineEmoticonBox` falls back to.
    // WARN: An unsized id is not a withdrawn one, and only this caller knows which it is — the tombstone's default copy would tell a screen reader an item was deleted when it may be perfectly alive.
    return (
      <span className="inline-block align-bottom" style={{ height: "1lh", aspectRatio: box.ratio }}>
        <InlineEmoticonTombstone label={info?.isDeleted ? undefined : "이모티콘"} />
      </span>
    );
  }

  function renderText(value: string) {
    return splitTextByUrls(value).map((segment, index) =>
      segment.kind === "url" ? (
        <a
          key={index}
          className="underline underline-offset-2 transition-colors hover:text-primary active:text-primary-pressed"
          href={segment.value}
          target="_blank"
          rel="noreferrer"
          // WARN: REQUIREMENTS.md § 8.10. The pointer is deliberately left to bubble, so a link pulls to reply and holds to the action sheet like the rest of the bubble. Stopping it here is what made a link the one dead spot in the row. Nothing follows the link on release either: both gestures swallow the `click` from `onClickCapture` on an ancestor of this anchor, which is exactly where `useLongPress` says those handlers have to live.
          // WARN: An `<a>` is natively draggable, and WebKit's link drag takes the gesture before the pull has measured a move.
          draggable={false}
        >
          {segment.value}
        </a>
      ) : (
        // INFO: REQUIREMENTS.md § 8.6.1. Only the written text is lit — a URL is one unbroken run the reader is meant to recognise as an address, and cutting a mark through it would break that shape for a match nobody was looking for there.
        <Fragment key={index}>{renderMatches(segment.value)}</Fragment>
      ),
    );
  }

  function renderMatches(value: string) {
    if (query.trim().length === 0) {
      return value;
    }

    return splitTextByQuery(value, query).map((part, index) => (
      <Fragment key={index}>
        {part.isMatch ? (
          // INFO: DESIGN.md § 6.8. The same `search-hit` the result row uses, so the line the list showed and the bubble it led to are marked the same way.
          <mark className={cn("rounded-xs bg-search-hit text-ink", markClassName)}>
            {part.value}
          </mark>
        ) : (
          part.value
        )}
      </Fragment>
    ));
  }
}
