import { MEDIA_SCOPES, type MediaScope } from "@/shared/config";
import {
  chatSettings,
  emoticonItems,
  getDb,
  media,
  messageMedia,
  nextSnowflake,
  users,
  type Media,
} from "@/shared/db";
import { AN_HOUR, idFloorBefore, type MediaId } from "@/shared/lib";
import { and, eq, inArray, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { formatBytes, notifyOps } from "./notify";

/**
 * REQUIREMENTS.md § 9., § 12. One-time cleanup for `media` rows that are registered,
 * never referenced, and invisible to `sweep.ts` (bucket-vs-db) and `purge.ts`
 * (already soft-deleted) alike.
 */

/**
 * Every column across the schema that can name a `media.id`, mirrored from
 * `src/shared/db/schema/**`. `link_previews` is not here — it stores a third-party
 * `image_url` and holds no media reference at all (`link-previews.ts`).
 *
 * WARN: A row `message_media` or `emoticon_items` still names is never an orphan here,
 * whether or not the message or item holding it is itself soft-deleted — that row's own
 * delete path (`delete-message.ts`, `get-emoticon-asset.ts`) stamps `media.deleted_at`
 * in the same transaction, and a case where it has not is theirs to reconcile, not this
 * script's to guess at.
 */
function isUnreferenced() {
  return and(
    notExists(
      getDb()
        .select({ one: sql`1` })
        .from(messageMedia)
        .where(eq(messageMedia.mediaId, media.id)),
    ),
    notExists(
      getDb()
        .select({ one: sql`1` })
        .from(users)
        .where(or(eq(users.avatarMediaId, media.id), eq(users.profileBackgroundMediaId, media.id))),
    ),
    notExists(
      getDb()
        .select({ one: sql`1` })
        .from(chatSettings)
        .where(eq(chatSettings.backgroundMediaId, media.id)),
    ),
    notExists(
      getDb()
        .select({ one: sql`1` })
        .from(emoticonItems)
        .where(
          or(
            eq(emoticonItems.stillImageId, media.id),
            eq(emoticonItems.animatedImageId, media.id),
            eq(emoticonItems.audioId, media.id),
          ),
        ),
    ),
  );
}

/**
 * WARN: Independent of `sweep.ts`'s `MIN_AGE`. What this one covers is the gap § 9.
 * closed: a row registered by a request that never attached it. Nothing mints one any
 * more, so the age gate is what keeps a legitimate write in flight out of range.
 */
const MIN_AGE = AN_HOUR;

const SAMPLE_SIZE = 20;

function isWriteEnabled(): boolean {
  return process.env.ORPHANS_WRITE?.trim().toLowerCase() === "true";
}

function cutoffId(): MediaId {
  return idFloorBefore(nextSnowflake<MediaId>(), MIN_AGE);
}

async function findOrphans(): Promise<Media[]> {
  return getDb()
    .select()
    .from(media)
    .where(and(isNull(media.deletedAt), lt(media.id, cutoffId()), isUnreferenced()));
}

function summarize(orphans: Media[]): {
  byScope: Record<MediaScope, { count: number; bytes: number }>;
  totalBytes: number;
} {
  const byScope = Object.fromEntries(
    MEDIA_SCOPES.map((scope) => [scope, { count: 0, bytes: 0 }]),
  ) as Record<MediaScope, { count: number; bytes: number }>;

  for (const row of orphans) {
    byScope[row.scope].count += 1;
    byScope[row.scope].bytes += row.size;
  }

  return { byScope, totalBytes: orphans.reduce((total, row) => total + row.size, 0) };
}

async function main() {
  const orphans = await findOrphans();
  const { byScope, totalBytes } = summarize(orphans);

  console.log(`[orphans] found ${orphans.length} (${formatBytes(totalBytes)})`);

  for (const scope of MEDIA_SCOPES) {
    const { count, bytes } = byScope[scope];

    if (count > 0) {
      console.log(`[orphans]   ${scope}: ${count} (${formatBytes(bytes)})`);
    }
  }

  for (const row of orphans.slice(0, SAMPLE_SIZE)) {
    console.log(
      `[orphans]   ${row.id} · ${row.scope}/${row.kind} · ${formatBytes(row.size)} · ${row.r2Key}`,
    );
  }

  if (orphans.length === 0) {
    await notifyOps("고아 미디어 점검", "고아 미디어 없음");

    return;
  }

  if (!isWriteEnabled()) {
    await notifyOps(
      "고아 미디어 발견",
      `미참조 미디어 ${orphans.length}개 · ${formatBytes(totalBytes)} 확보 가능`,
    );

    return;
  }

  const stamped = await getDb()
    .update(media)
    .set({ deletedAt: new Date() })
    .where(
      and(
        inArray(
          media.id,
          orphans.map((row) => row.id),
        ),
        isNull(media.deletedAt),
      ),
    )
    .returning({ id: media.id });

  console.log(`[orphans] soft-deleted ${stamped.length}/${orphans.length}`);

  await notifyOps(
    "고아 미디어 정리",
    `미참조 미디어 ${stamped.length}개 소프트 삭제 · ${formatBytes(totalBytes)} 회수 대기`,
  );
}

main().then(
  () => process.exit(0),
  async (error: unknown) => {
    console.error("[orphans] failed", error);
    await notifyOps(
      "고아 미디어 점검 실패",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  },
);
