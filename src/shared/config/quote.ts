import type { Nullable, Optional } from "@/shared/lib";
import { toLlmProviderBranding } from "./llm";

/**
 * DESIGN.md § 6.10. Whose message is being quoted, as the quote's first line.
 *
 * INFO: `에게` is invariant, so this is an interpolation `AGENTS.md § 0.4.` has no
 * particle pair to pick — there is nothing here for `josa` to answer.
 *
 * INFO: REQUIREMENTS.md § 8.10. `llmProvider` outranks `isMine` — an `assistant_reply`
 * carries the asker's own `senderId`, so quoting one's own AI answer would otherwise
 * read `나에게 답장` instead of naming 쨈미니.
 *
 * WARN: One copy for the bubble, the composer and the § 12.2. mirror alike. The three
 * quote the same message and a wording that reached only one of them is drift.
 */
export function toQuoteHeading(
  name: Optional<string>,
  isMine: boolean,
  llmProvider?: Nullable<string>,
): string {
  if (llmProvider) {
    return `${toLlmProviderBranding(llmProvider).name}에게 답장`;
  }

  if (isMine) {
    return "나에게 답장";
  }

  // INFO: A participant the room cannot name — the sentence keeps its verb rather than reading `에게 답장`.
  return name ? `${name}에게 답장` : "답장";
}

/**
 * The 32px tile a quote draws beside its summary (DESIGN.md § 6.10.).
 *
 * INFO: One discriminated field rather than a nullable id per kind, so `toQuoteHeight`
 * answers "is there a tile?" with a single test — two parallel ids are a pair that can
 * disagree, and the § 8.3. estimate would be reading whichever one it was written against.
 */
export type QuoteThumbnail =
  | { kind: "media"; mediaId: string }
  // WARN: REQUIREMENTS.md § 13.4. The version travels with the id, because `toEmoticonAssetUrl` cannot address an edited item without it — the edit swaps the object behind an unchanged id and the redirect in front of it is cached.
  | { kind: "emoticon"; itemId: string; version: number }
  // INFO: REQUIREMENTS.md § 8.9. The scraped card's own image, which is a third-party URL rendered directly rather than an `/api/media` object (§ 9.).
  | { kind: "link"; imageUrl: string }
  // INFO: REQUIREMENTS.md § 10. The attachment was destroyed from 보관함 and there is no object left to draw; the tile is still there, and it is the same 32px box the other two fill (§ 8.3.).
  | { kind: "deleted" };

/**
 * Which tile a quote of this bubble draws, if any (REQUIREMENTS.md § 8.10.).
 *
 * WARN: Lives here rather than in `entities/message` for the reason `toMediaNoun`
 * does — the chat room composes an optimistic quote in the browser, and a value
 * import from that barrel drags `server-only` into the bundle. **This is the one
 * copy.** The optimistic bubble and the echoed row answer for the same message, and
 * a disagreement is not only a tile swapping under the reader: § 8.3. prices the
 * quote at `max(tile, two lines)` and keys its cached measurement on the tile being
 * there, so the two answers differing re-measures the row and corrects the scroll.
 */
export function toQuoteThumbnail(
  emoticon: Nullable<QuotedEmoticon>,
  attachments: QuotedAttachment[],
  // INFO: REQUIREMENTS.md § 13. A mini sent alone carries no `emoticon_item_id` — it lives in `text` as one `OBJECT_PLACEHOLDER` — so the caller resolves it separately and hands it here as the same `{id, version}` shape.
  soloInlineEmoticon: Nullable<QuotedEmoticon> = null,
  // INFO: REQUIREMENTS.md § 8.9. Resolved by the caller — the scrape cache is a table on the server and a query cache in the browser, and neither is reachable from here.
  linkImageUrl: Nullable<string> = null,
): Nullable<QuoteThumbnail> {
  // INFO: REQUIREMENTS.md § 6. A row carries one payload or the other, so the order settles nothing — an emoticon message has no attachments to reach the test below.
  const resolved = emoticon ?? soloInlineEmoticon;
  if (resolved) {
    // INFO: § 13. A deleted item keeps its tile for the reason a destroyed attachment does below — the row survives its objects, so the id still resolves while the asset route 404s.
    return resolved.isDeleted
      ? { kind: "deleted" }
      : { kind: "emoticon", itemId: resolved.id, version: resolved.version };
  }

  // INFO: § 8.9. Last, so a bubble that carries both draws its own art rather than the page it linked to.
  return (
    toAttachmentThumbnail(attachments[0]) ??
    (linkImageUrl ? { kind: "link", imageUrl: linkImageUrl } : null)
  );
}

/**
 * WARN: Both fields, never `filename` alone. A recording carries no filename either,
 * so testing that one field pointed the quote's `<img>` at an audio object — which
 * `GET /api/media/{id}` now serves as the original — and reserved `QUOTE_THUMBNAIL`
 * in the § 8.3. estimate for a tile that can never draw.
 *
 * WARN: REQUIREMENTS.md § 10. A destroyed attachment is the one case that keeps its
 * tile. A photo deleted from 보관함 keeps its `media` row for the box its bubble
 * reserves (§ 9.), so the id still resolves — but the object behind it is gone, and the
 * quote drew a broken 32px `<img>` for it. It answers `deleted` rather than `null`
 * precisely so the tile stays: the § 8.3. estimate prices the box off this being
 * non-null, and a quote that lost its tile is a row that changes height when a photo is
 * deleted somewhere else entirely.
 */
function toAttachmentThumbnail(attachment: Optional<QuotedAttachment>): Nullable<QuoteThumbnail> {
  if (!attachment || attachment.filename || attachment.voice) {
    return null;
  }

  return attachment.isDeleted ? { kind: "deleted" } : { kind: "media", mediaId: attachment.id };
}

// WARN: Structural, and that is what lets one copy serve both callers — the server holds database rows and the browser holds a `ChatMessage`, and `shared` may name neither.
// WARN: `voice` is **required**, which is the whole of what keeps a `MediaDraft[]` out of here — REQUIREMENTS.md § 9.3. flags a draft recording as `waveformPeaks` and never as `voice`, so an optional field would take one, read `undefined`, and hand the tile an audio object.
// WARN: `isDeleted` is required for `voice`'s reason — a draft has none, and an optional one would read `undefined` on the very shape this is written to keep out.
type QuotedAttachment = {
  filename: Nullable<string>;
  voice: Nullable<unknown>;
  isDeleted: boolean;
  id: string;
};

/** @see QuotedAttachment — the emoticon half, whose `version` is `emoticon_items.updated_at` in milliseconds (§ 13.4.). */
// WARN: `isDeleted` is required for the reason `QuotedAttachment`'s is — an optional one would read `undefined` on a shape this is written to keep out, and the quote would draw a purged object.
type QuotedEmoticon = { version: number; isDeleted: boolean; id: string };
