import type { ArchiveMedia, MediaAttachmentInput } from "@/entities/media";
import type { ChatMessage } from "@/entities/message";
import { request } from "@/shared/api";
import type { InlineEmoticonMap, NotifyMode } from "@/shared/config";
import type { EmoticonItemId, MessageId } from "@/shared/lib";

// INFO: REQUIREMENTS.md § 8.10. The quoted id is not a payload of its own — it rides on whichever of the three a reply happens to be.
type ReplyParams = { replyToId?: MessageId; notifyMode?: NotifyMode; onlyMe?: boolean };

// INFO: REQUIREMENTS.md § 6. Text, attachments, or one emoticon — never a combination. The route's schema and the table's CHECK constraint say the same thing.
// WARN: `media`, not `mediaIds` — an item is either a fresh upload registered and attached in the same transaction the message is created by, or REQUIREMENTS.md § 10.x.'s 채팅으로 보내기 re-reference of a row already in the library, told apart by `MediaAttachmentInput`'s own union.
export type PostMessageParams = ReplyParams &
  // INFO: REQUIREMENTS.md § 13. One id per `OBJECT_PLACEHOLDER` in the text; the route refuses a body whose halves disagree.
  (
    | { clientMsgId: string; text: string; inlineEmoticonItemIds?: EmoticonItemId[] }
    | { clientMsgId: string; media: MediaAttachmentInput[]; isAiAttachment?: boolean }
    | { clientMsgId: string; emoticonItemId: EmoticonItemId }
  );

export type PostMessageResult = {
  message: ChatMessage;
  /** WARN: The finished restructure. Populated only for a `media` send — the rows this request just registered, with the id `uploadDraft` never had. Empty otherwise. */
  media: ArchiveMedia[];
};

export async function postMessage(params: PostMessageParams): Promise<PostMessageResult> {
  const response = await request("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`POST /api/messages responded ${response.status}`);
  }

  // INFO: § 13. The echo carries the map every read path does; the row's own emoticons reach the window through the § 8.4. event that arrives with it, so nothing here has to hold it.
  const { message, media } = (await response.json()) as {
    message: ChatMessage;
    emoticons: InlineEmoticonMap;
    media?: ArchiveMedia[];
  };

  return { message, media: media ?? [] };
}
