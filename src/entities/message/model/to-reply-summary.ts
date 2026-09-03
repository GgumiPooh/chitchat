import { DELETED_MESSAGE_TEXT, toMediaCountUnit, toMediaLabel } from "@/shared/config";
import type { ReplyPreview } from "./types";

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
      return toMediaSummary(replyTo);
    case "emoticon":
      return "이모티콘";
    // INFO: A mini sent alone is `kind: "text"` (§ 13.), so its tile alone marks it — the summary reads the same as a full pack's rather than the `(이모티콘)` a placeholder mid-sentence gets.
    default:
      return replyTo.thumbnail?.kind === "emoticon" ? "이모티콘" : (replyTo.text ?? "");
  }
}

/**
 * INFO: DESIGN.md § 6.10. Counted only past one, as KakaoTalk counts it — `사진 1장`
 * tells the reader nothing the tile beside it has not already shown.
 *
 * INFO: AGENTS.md § 0.4. `toMediaCountUnit` rather than a literal 장, and no `josa`:
 * the counter ends the line, so no particle follows it.
 */
function toMediaSummary({ mediaKind, mediaCount }: ReplyPreview): string {
  // WARN: One kind for both helpers, never the raw field twice — `toMediaLabel` reads a null as 사진 and `toMediaCountUnit` reads it as 개, so a preview that lost its kind would be counted `사진 3개`.
  const kind = mediaKind ?? "photo";
  const label = toMediaLabel(kind);

  return mediaCount > 1 ? `${label} ${mediaCount}${toMediaCountUnit(kind)}` : label;
}
