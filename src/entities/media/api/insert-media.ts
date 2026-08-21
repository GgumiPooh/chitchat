import "server-only";

import { media, nextSnowflake } from "@/shared/db";
import type { MediaId, Nullable, UserId } from "@/shared/lib";
import { consumeReservations, type DbTransaction } from "@/shared/storage";
import { and, eq } from "drizzle-orm";
import { toArchiveMedia } from "../model/to-archive-media";
import type { ArchiveMedia } from "../model/types";
import type { ValidatedMedia } from "./validate-media-upload";

export type { ValidatedMedia } from "./validate-media-upload";

/**
 * The INSERT half of registration, on the caller's own transaction — everything
 * `validateMediaUpload` decided is trusted here as-is.
 *
 * WARN: § 9. Consuming the reservation is what proves the claim on `r2Key` is still
 * live. Null means it had already lapsed — a reclaim may have taken the bytes this
 * row would point at, so the caller must abort the whole write rather than insert one.
 *
 * WARN: No reservation at all is **not** a refusal, and "the reservation is the
 * proof" is the wrong inference to draw here. Registration is idempotent on
 * `r2_key`, so a retry arrives after the first attempt consumed the claim — refusing
 * it would fail every resend of a message whose upload already landed.
 */
export async function insertMedia(
  tx: DbTransaction,
  validated: ValidatedMedia,
): Promise<Nullable<ArchiveMedia>> {
  const { expired } = await consumeReservations(tx, [validated.r2Key]);

  if (expired.length > 0) {
    return null;
  }

  const [inserted] = await tx
    .insert(media)
    .values({
      id: nextSnowflake<MediaId>(),
      ownerId: validated.ownerId,
      r2Key: validated.r2Key,
      mime: validated.mime,
      size: validated.size,
      kind: validated.kind,
      scope: validated.scope,
      width: validated.width,
      height: validated.height,
      durationMs: validated.durationMs,
      blurhash: validated.blurhash,
      filename: validated.filename,
      waveformPeaks: validated.waveformPeaks,
    })
    // INFO: `r2_key` is unique, so a retried registration returns the row the first attempt wrote instead of failing the send.
    .onConflictDoNothing({ target: media.r2Key })
    .returning();

  if (inserted) {
    return toArchiveMedia(inserted);
  }

  return getMediaByKey(tx, validated.r2Key, validated.ownerId);
}

async function getMediaByKey(
  tx: DbTransaction,
  r2Key: string,
  ownerId: UserId,
): Promise<Nullable<ArchiveMedia>> {
  const [existing] = await tx
    .select()
    .from(media)
    // WARN: Scoped to the owner for the same reason `createTextMessage` scopes its re-read — a conflict must never hand the caller a row that is not theirs.
    .where(and(eq(media.r2Key, r2Key), eq(media.ownerId, ownerId)))
    .limit(1);

  return existing ? toArchiveMedia(existing) : null;
}
