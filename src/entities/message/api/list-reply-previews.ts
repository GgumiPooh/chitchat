import "server-only";

import { listInlineEmoticons } from "@/entities/emoticon/@x/message";
import { listLinkPreviewImages } from "@/entities/link-preview/@x/message";
import {
  REPLY_PREVIEW_MAX_LENGTH,
  toMediaNoun,
  toMessageSummary,
  toQuoteThumbnail,
  toSoloInlineEmoticonId,
} from "@/shared/config";
import { emoticonItems, getDb, messages } from "@/shared/db";
import {
  findFirstUrl,
  withoutFragment,
  type EmoticonItemId,
  type MessageId,
  type Nullable,
} from "@/shared/lib";
import { eq, inArray } from "drizzle-orm";
import type { ReplyPreview } from "../model/types";
import { listMessageMedia } from "./list-message-media";

/** The quote for one reply — what the create paths resolve before they echo the row back. */
export async function getReplyPreview(
  parentId: Nullable<MessageId>,
): Promise<Nullable<ReplyPreview>> {
  if (parentId === null) {
    return null;
  }

  const byId = await listReplyPreviews([parentId]);

  return byId.get(parentId) ?? null;
}

/**
 * The quoted messages for a whole page of replies, keyed by the quoted id.
 *
 * INFO: REQUIREMENTS.md § 8.10. One query for the page, for the same reason
 * `listMessageMedia` is one query, and keyed by the *parent* id because a page
 * commonly quotes the same message several times.
 *
 * WARN: Deliberately does not filter `deleted_at`. The row is what the quote reads
 * `isDeleted` off — filtering it here would render a deleted parent as no quote at
 * all rather than as 삭제된 메시지예요.
 */
export async function listReplyPreviews(
  parentIds: MessageId[],
): Promise<Map<MessageId, ReplyPreview>> {
  const byId = new Map<MessageId, ReplyPreview>();

  if (parentIds.length === 0) {
    return byId;
  }

  const rows = await getDb()
    .select({
      id: messages.id,
      senderId: messages.senderId,
      type: messages.type,
      text: messages.text,
      inlineEmoticonItemIds: messages.inlineEmoticonItemIds,
      deletedAt: messages.deletedAt,
      emoticonItemId: messages.emoticonItemId,
      // INFO: REQUIREMENTS.md § 13.4. Joined for this column alone — the tile's URL is versioned by it, and the join is what keeps the quote showing an edited emoticon's correction (§ 8.10.).
      emoticonUpdatedAt: emoticonItems.updatedAt,
      emoticonDeletedAt: emoticonItems.deletedAt,
    })
    .from(messages)
    .leftJoin(emoticonItems, eq(messages.emoticonItemId, emoticonItems.id))
    .where(inArray(messages.id, parentIds));

  // INFO: DESIGN.md § 6.10. The quote draws the bubble's first attachment as a 32px tile and counts the rest, which have nowhere to go on one line.
  const byMessage = await listMessageMedia(
    rows.filter((row) => row.type === "media" && !row.deletedAt).map((row) => row.id),
  );
  // INFO: REQUIREMENTS.md § 13. A mini sent alone is a `type: "text"` row with no `emoticon_item_id`, so its tile is resolved off `inline_emoticon_item_ids` instead — one extra batch query, on the same `listInlineEmoticons` the message payload itself uses.
  const soloInlineIds = new Map<MessageId, EmoticonItemId>();
  for (const row of rows) {
    if (row.type !== "text" || row.deletedAt) {
      continue;
    }
    const soloId = toSoloInlineEmoticonId({
      text: row.text ?? "",
      inlineEmoticonItemIds: row.inlineEmoticonItemIds,
    });
    if (soloId) {
      soloInlineIds.set(row.id, soloId);
    }
  }
  const soloInlineEmoticons = await listInlineEmoticons([...soloInlineIds.values()]);
  // INFO: REQUIREMENTS.md § 8.9. The full row text, not the sliced `text` the quote carries — `REPLY_PREVIEW_MAX_LENGTH` cuts a link in half as readily as a sentence.
  const linkUrls = new Map<MessageId, string>();
  for (const row of rows) {
    const url = row.deletedAt ? null : findFirstUrl(row.text);
    if (url) {
      linkUrls.set(row.id, withoutFragment(url));
    }
  }
  const linkImages = await listLinkPreviewImages([...linkUrls.values()]);

  for (const row of rows) {
    const attachments = byMessage.get(row.id) ?? [];
    const soloId = soloInlineIds.get(row.id);
    const soloInfo = soloId ? soloInlineEmoticons[soloId] : undefined;

    byId.set(row.id, {
      senderId: row.senderId,
      kind: row.type,
      // INFO: A deleted parent surrenders its content and keeps only its identity — the quote replaces both with 삭제된 메시지예요.
      text: row.deletedAt ? null : toQuotedText(row),
      // WARN: The deletion is tested here rather than left to the helper, because only the media half gets it for free — `listMessageMedia` is never asked about a deleted row, where the emoticon join above is on `messages` itself and answers for one.
      thumbnail: row.deletedAt
        ? null
        : toQuoteThumbnail(
            toQuotedEmoticon(row),
            attachments,
            soloId && soloInfo
              ? { id: soloId, version: soloInfo.version, isDeleted: soloInfo.isDeleted }
              : null,
            toLinkImageUrl(row.id),
          ),
      // INFO: The same rule the § 16.1. push body applies — 동영상 only when there is no photo in the bubble to contradict it.
      mediaKind: toMediaNoun(attachments),
      // INFO: DESIGN.md § 6.10. The summary counts what the tile cannot show — it is the first attachment alone, however many were sent.
      mediaCount: attachments.length,
      isDeleted: row.deletedAt !== null,
      id: row.id,
    });
  }

  return byId;

  function toLinkImageUrl(id: MessageId): Nullable<string> {
    const url = linkUrls.get(id);

    return (url && linkImages.get(url)) ?? null;
  }
}

/**
 * REQUIREMENTS.md § 13. The quoted line, which is one line with no room to draw an
 * emoticon — so every placeholder reads as `(이모티콘)`.
 *
 * WARN: Text rows only. Every other kind carries no text and is named by its own kind
 * in `toReplySummary`, where a 이모티콘 answered here for a nine-photo bubble would
 * never be read but would sit in the payload contradicting it.
 */
function toQuotedText(row: { type: string; text: Nullable<string> }): Nullable<string> {
  if (row.type !== "text") {
    return row.text?.slice(0, REPLY_PREVIEW_MAX_LENGTH) ?? null;
  }

  return toMessageSummary(row.text ?? "").slice(0, REPLY_PREVIEW_MAX_LENGTH);
}

/**
 * The joined columns as `toQuoteThumbnail` names them — plumbing for the left join,
 * never the rule itself, which `@/shared/config` owns for both callers.
 *
 * INFO: REQUIREMENTS.md § 13.4. `updated_at` in milliseconds is what `Emoticon.version` is, so a quote and a bubble address the same edited asset by the same URL.
 *
 * INFO: Both fields are tested because the left join makes both nullable, not because they are two states — `updated_at` is `NOT NULL`, so the pair is null together exactly when the row carries no emoticon.
 */
function toQuotedEmoticon({
  emoticonItemId,
  emoticonUpdatedAt,
  emoticonDeletedAt,
}: {
  emoticonItemId: Nullable<EmoticonItemId>;
  emoticonUpdatedAt: Nullable<Date>;
  emoticonDeletedAt: Nullable<Date>;
}): Nullable<{ version: number; isDeleted: boolean; id: string }> {
  if (!emoticonItemId || !emoticonUpdatedAt) {
    return null;
  }

  return {
    id: emoticonItemId,
    version: emoticonUpdatedAt.getTime(),
    isDeleted: emoticonDeletedAt !== null,
  };
}
