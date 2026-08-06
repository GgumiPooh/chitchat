"use client";

import { cn, splitTextByUrls } from "@/shared/lib";
import { Fragment } from "react";

export type MessageTextProps = {
  className?: string;
  text: string;
};

/**
 * DESIGN.md § 6.9. The body of a text bubble, with any link in it made tappable.
 *
 * INFO: The URL is left in the text rather than replaced by the card's title —
 * what the sender typed is what the bubble says, and the card above it is an
 * addition to the message, not a rewrite of it.
 */
export function MessageText({ className, text }: MessageTextProps) {
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
          <Fragment key={index}>{segment.value}</Fragment>
        ),
      )}
    </span>
  );
}
