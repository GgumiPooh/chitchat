"use client";

import type { InlineEmoticonMap } from "@/shared/config";
import type { EmoticonItemId, Nullable } from "@/shared/lib";
import { BottomSheet, MarkdownBody } from "@/shared/ui";
import { MessageText } from "./message-text";

/** REQUIREMENTS.md § 8.16. What a § 6.2.2. cut is hiding — an ordinary bubble's text, or an § 8.15. answer's markdown. */
export type ExpandedBody = {
  isMarkdown: boolean;
  text: string;
  inlineEmoticonItemIds: EmoticonItemId[];
  /** REQUIREMENTS.md § 13. Carried rather than read from the room, because an outbox row's emoticons are not in the page's map until its echo lands. */
  inlineEmoticons: InlineEmoticonMap;
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
  return (
    <BottomSheet
      className={className}
      isOpen={body !== null}
      isTall
      header={{ title: "전체보기" }}
      onClose={onClose}
    >
      {body?.isMarkdown ? (
        <MarkdownBody text={body.text} />
      ) : (
        body && (
          // INFO: DESIGN.md § 6.2. The bubble's own wrapping rules, so the sheet breaks the message where the bubble was breaking it.
          <MessageText
            className="block text-chat-body wrap-anywhere [word-break:normal] whitespace-pre-wrap text-ink select-text"
            text={body.text}
            inlineEmoticonItemIds={body.inlineEmoticonItemIds}
            inlineEmoticons={body.inlineEmoticons}
            query={searchQuery}
          />
        )
      )}
    </BottomSheet>
  );
}
