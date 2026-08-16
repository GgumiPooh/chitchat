import type { Nullable, Optional } from "@/shared/lib";

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
  | { kind: "emoticon"; itemId: string; version: number };

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
): Nullable<QuoteThumbnail> {
  // INFO: REQUIREMENTS.md § 6. A row carries one payload or the other, so the order settles nothing — an emoticon message has no attachments to reach the test below.
  if (emoticon) {
    return { kind: "emoticon", itemId: emoticon.id, version: emoticon.version };
  }

  return toAttachmentThumbnail(attachments[0]);
}

/**
 * WARN: Both fields, never `filename` alone. A recording carries no filename either,
 * so testing that one field pointed the quote's `<img>` at an audio object — which
 * `GET /api/media/{id}` now serves as the original — and reserved `QUOTE_THUMBNAIL`
 * in the § 8.3. estimate for a tile that can never draw.
 *
 * WARN: REQUIREMENTS.md § 10. And the deletion, which is a third way to have no tile.
 * A photo destroyed from 보관함 keeps its `media` row for the box its bubble reserves
 * (§ 9.), so the id here still resolves — but the object behind it is gone, and the
 * quote drew a broken 32px `<img>` for it and priced the tile into the § 8.3. estimate.
 */
function toAttachmentThumbnail(attachment: Optional<QuotedAttachment>): Nullable<QuoteThumbnail> {
  if (!attachment || attachment.filename || attachment.voice || attachment.isDeleted) {
    return null;
  }

  return { kind: "media", mediaId: attachment.id };
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
type QuotedEmoticon = { version: number; id: string };
