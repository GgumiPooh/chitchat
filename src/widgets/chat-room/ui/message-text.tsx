"use client";

import { cn, splitTextByQuery, splitTextByUrls } from "@/shared/lib";
import { Fragment } from "react";

export type MessageTextProps = {
  className?: string;
  markClassName?: string;
  text: string;
  /** REQUIREMENTS.md § 8.6.1. Lit in the bubble while a search is open; empty the rest of the time. */
  query?: string;
};

/**
 * DESIGN.md § 6.9. The body of a text bubble, with any link in it made tappable.
 *
 * INFO: The URL is left in the text rather than replaced by the card's title —
 * what the sender typed is what the bubble says, and the card above it is an
 * addition to the message, not a rewrite of it.
 */
export function MessageText({ className, markClassName, text, query = "" }: MessageTextProps) {
  return (
    <span className={cn(className)}>
      {splitTextByUrls(text).map((segment, index) =>
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
      )}
    </span>
  );

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
