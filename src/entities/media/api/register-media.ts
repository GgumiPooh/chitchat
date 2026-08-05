import "server-only";

import {
  MAX_THUMBNAIL_SIZE,
  THUMBNAIL_MIME,
  isAllowedMediaMime,
  maxSizeForMime,
} from "@/shared/config";
import { getDb, media } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { headObject, toThumbKey } from "@/shared/storage";
import { and, eq } from "drizzle-orm";
import { toChatMedia } from "../model/to-chat-media";
import type { ChatMedia } from "../model/types";

export type RegisterMediaParams = {
  ownerId: string;
  r2Key: string;
  width: number;
  height: number;
  durationMs?: Nullable<number>;
};

/**
 * Turns an uploaded pair of objects into the row the rest of the app points at.
 *
 * WARN: This is where REQUIREMENTS.md § 14.'s type and size limits are actually
 * enforced. The upload went straight to R2 (§ 9.), so the server never saw the
 * bytes — it reads back what R2 stored and refuses to write a row for anything
 * outside the allow-list. Nothing without a row is reachable from the app.
 */
export async function registerMedia({
  ownerId,
  r2Key,
  width,
  height,
  durationMs,
}: RegisterMediaParams): Promise<Nullable<ChatMedia>> {
  const [object, thumbnail] = await Promise.all([headObject(r2Key), headObject(toThumbKey(r2Key))]);

  if (!object || !thumbnail) {
    return null;
  }

  if (!isAllowedMediaMime(object.mime) || object.size > maxSizeForMime(object.mime)) {
    return null;
  }

  // WARN: The thumbnail is checked as strictly as the original. It is what every chat cell, grid tile and video poster loads, so an unchecked `_thumb` key is the same hole in § 14. by another name.
  if (thumbnail.mime !== THUMBNAIL_MIME || thumbnail.size > MAX_THUMBNAIL_SIZE) {
    return null;
  }

  const [row] = await getDb()
    .insert(media)
    .values({
      ownerId,
      r2Key,
      mime: object.mime,
      size: object.size,
      width,
      height,
      durationMs: durationMs ?? null,
    })
    // INFO: `r2_key` is unique, so a retried registration returns the row the first attempt wrote instead of failing the send.
    .onConflictDoNothing({ target: media.r2Key })
    .returning();

  if (row) {
    return toChatMedia(row);
  }

  return getMediaByKey(r2Key, ownerId);
}

async function getMediaByKey(r2Key: string, ownerId: string): Promise<Nullable<ChatMedia>> {
  const [existing] = await getDb()
    .select()
    .from(media)
    // WARN: Scoped to the owner for the same reason `createTextMessage` scopes its re-read — a conflict must never hand the caller a row that is not theirs.
    .where(and(eq(media.r2Key, r2Key), eq(media.ownerId, ownerId)))
    .limit(1);

  return existing ? toChatMedia(existing) : null;
}
