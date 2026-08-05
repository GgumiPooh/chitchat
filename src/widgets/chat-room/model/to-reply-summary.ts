import type { ReplyPreview } from "@/entities/message";

/**
 * The one line a quote shows for the message it points at (DESIGN.md § 6.9.).
 *
 * INFO: A bubble-less kind is named rather than drawn — the quote is one line tall,
 * so an emoticon or a nine-photo grid has nowhere to render itself.
 */
export function toReplySummary(replyTo: ReplyPreview): string {
  if (replyTo.isDeleted) {
    return "삭제된 메시지예요";
  }

  switch (replyTo.kind) {
    case "media":
      return replyTo.isVideoOnly ? "동영상" : "사진";
    case "emoticon":
      return "이모티콘";
    default:
      return replyTo.text ?? "";
  }
}
