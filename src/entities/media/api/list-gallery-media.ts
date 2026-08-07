import "server-only";

import { GALLERY_PAGE_SIZE } from "@/shared/config";
import { getDb, media, messageMedia, messages } from "@/shared/db";
import type { Optional } from "@/shared/lib";
import { and, desc, eq, exists, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { toGalleryMedia } from "../model/to-gallery-media";
import type { GalleryMedia } from "../model/types";

export type GalleryCursor = {
  createdAt: string;
  id: string;
};

export type ListGalleryMediaParams = {
  /** The last tile of the previous page — everything older than it comes next. */
  before?: GalleryCursor;
  limit?: number;
};

/**
 * One page of the gallery, newest first (REQUIREMENTS.md § 10.).
 *
 * WARN: The cursor is the `(created_at, id)` **pair**, never `created_at` alone.
 * `created_at` defaults to the transaction timestamp, so every attachment of one
 * multi-photo send compares equal — a page boundary inside that group would skip
 * or repeat images (§ 6.).
 */
export async function listGalleryMedia({
  before,
  limit = GALLERY_PAGE_SIZE,
}: ListGalleryMediaParams = {}): Promise<GalleryMedia[]> {
  const rows = await getDb()
    .select()
    .from(media)
    .where(before ? and(isInGallery(), isOlderThan(before)) : isInGallery())
    .orderBy(desc(media.createdAt), desc(media.id))
    .limit(limit);

  return rows.map(toGalleryMedia);
}

/**
 * INFO: REQUIREMENTS.md § 10. `media` is the gallery's single source, so a photo
 * belongs here either because a message that is still visible carries it, or
 * because it was uploaded straight into the gallery. An object with neither is an
 * upload whose send never landed, and it is not a photo the user ever saw.
 */
export function isInGallery(): Optional<SQL> {
  const isPosted = exists(
    getDb()
      .select({ one: sql`1` })
      .from(messageMedia)
      .innerJoin(messages, eq(messages.id, messageMedia.messageId))
      .where(and(eq(messageMedia.mediaId, media.id), isNull(messages.deletedAt))),
  );

  // INFO: REQUIREMENTS.md § 18. #1. The gallery's own delete, and the only place it is read — a hidden photo still renders in the bubble it was sent in.
  // WARN: REQUIREMENTS.md § 9.1. `filename` is what keeps file attachments out of the grid, and it is the whole of that guard — a file has no `_thumb` object, so a tile of one is a broken image and the § 7.10. viewer opens on nothing.
  return and(
    isNull(media.filename),
    isNull(media.galleryHiddenAt),
    or(isNotNull(media.galleryAddedAt), isPosted),
  );
}

/**
 * WARN: The timestamp is bound as its ISO **string**, not as a `Date`. A raw
 * template parameter carries no column to take its type from, so drizzle hands it
 * to postgres.js as-is and the driver refuses a `Date` outright.
 *
 * WARN: Which is why both sides are cast. Without `::timestamptz` Postgres has to
 * infer the parameter's type from a row constructor, and an `unknown` there
 * resolves to `text` — where `2026-08-06T…` sorts after `2026-08-1…`.
 *
 * WARN: This is only exact because `media.created_at` is `timestamptz(3)`. The
 * string above came from a JS `Date`, which has no sub-millisecond digits, so at
 * the default microsecond precision the cursor would be a truncated copy of the
 * row it names and every sibling sharing that timestamp would compare greater and
 * be skipped. Never widen the column back.
 */
function isOlderThan({ createdAt, id }: GalleryCursor): SQL {
  return sql`(${media.createdAt}, ${media.id}) < (${createdAt}::timestamptz, ${id}::uuid)`;
}
