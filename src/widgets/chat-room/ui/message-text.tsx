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
            // WARN: `pointerdown` is what arms the bubble's long press, so it has to stop here or holding a link opens the action sheet *and* follows the link on release.
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
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
