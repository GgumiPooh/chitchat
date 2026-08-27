"use client";

import type { InlineEmoticonMap } from "@/shared/config";
import {
  formatDate,
  formatTime,
  type EmoticonItemId,
  type Nullable,
} from "@/shared/lib";
import { BottomSheet, MarkdownBody } from "@/shared/ui";
import { useState } from "react";
import { MessageText } from "./message-text";

/** REQUIREMENTS.md § 8.16. What a § 6.2.2. cut is hiding — an ordinary bubble's text, or an § 8.15. answer's markdown. */
export type ExpandedBody = {
  createdAt: string;
  inlineEmoticonItemIds: EmoticonItemId[];
  /** REQUIREMENTS.md § 13. Carried rather than read from the room, because an outbox row's emoticons are not in the page's map until its echo lands. */
  inlineEmoticons: InlineEmoticonMap;
  isMarkdown: boolean;
  /** Whoever spoke — a participant's § 8.7. nickname, a § 8.15. answer's provider 별명, or 시스템. */
  senderName: string;
  text: string;
};

export type ExpandedBodySheetProps = {
  className?: string;
  body: Nullable<ExpandedBody>;
  /** REQUIREMENTS.md § 8.6.1. The open search's query, lit here as it is in the bubble — the sheet is where a match past the cut is legible at all. */
  searchQuery?: string;
  onClose: () => void;
};

/**
 * DESIGN.md § 6.2.2., § 7.5. The whole of a cut message, in a sheet opened at its full
 * height rather than one sized to what it holds — what the reader asked for is the length.
 */
export function ExpandedBodySheet({
  className,
  body,
  searchQuery,
  onClose,
}: ExpandedBodySheetProps) {
  // INFO: The caller clears the body on close, and the exit animation would otherwise play over an empty header and no text — `ActionSheet` holds its own rows the same way and for the same reason.
  const [snapshot, setSnapshot] = useState(body);
  if (body !== null && body !== snapshot) {
    setSnapshot(body);
  }
  const shown = body ?? snapshot;
  const isOpen = body !== null;

  const bodyContent = shown?.isMarkdown ? (
    <MarkdownBody text={shown.text} />
  ) : (
    shown && (
      // INFO: DESIGN.md § 6.2. The bubble's own wrapping rules, so the sheet breaks the message where the bubble was breaking it.
      <MessageText
        className="block text-chat-body wrap-anywhere [word-break:normal] whitespace-pre-wrap text-ink select-text"
        inlineEmoticonItemIds={shown.inlineEmoticonItemIds}
        inlineEmoticons={shown.inlineEmoticons}
        query={searchQuery}
        text={shown.text}
      />
    )
  );

  return (
    <BottomSheet
      className={className}
      isOpen={isOpen}
      isTall
      header={{
        description: shown
          ? `${formatDate(shown.createdAt)} ${formatTime(shown.createdAt)}`
          : undefined,
        title: shown?.senderName ?? "전체보기",
      }}
      onClose={onClose}
    >
      {bodyContent}
    </BottomSheet>
  );
}

