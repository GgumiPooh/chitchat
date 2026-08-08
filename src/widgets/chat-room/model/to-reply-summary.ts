import type { ReplyPreview } from "@/entities/message";
import { DELETED_MESSAGE_TEXT, toMediaLabel } from "@/shared/config";

/**
 * The one line a quote shows for the message it points at (DESIGN.md § 6.10.).
 *
 * INFO: A bubble-less kind is named rather than drawn — the quote is one line tall,
 * so an emoticon or a nine-photo grid has nowhere to render itself.
 */
export function toReplySummary(replyTo: ReplyPreview): string {
  // INFO: REQUIREMENTS.md § 8.13. The same constant the tombstone bubble reads, so the quote and the row it points at cannot drift apart in wording.
  if (replyTo.isDeleted) {
    return DELETED_MESSAGE_TEXT;
  }

  switch (replyTo.kind) {
    case "media":
      return toMediaLabel(replyTo.mediaKind);
    case "emoticon":
      return "이모티콘";
    default:
      return replyTo.text ?? "";
  }
}
