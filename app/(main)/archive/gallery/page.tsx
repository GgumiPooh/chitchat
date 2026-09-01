import { listArchiveMedia } from "@/entities/media";
import { ArchivePage } from "@/pages/archive";
import { requireUserOrRedirect } from "@/shared/auth";
import {
  ARCHIVE_MODE_PARAM,
  ARCHIVE_TARGET_PARAM,
  snowflakeSchema,
  toArchiveModeFilter,
} from "@/shared/config";
import type { Maybe, MediaId, Optional } from "@/shared/lib";

type PageProps = {
  searchParams: Promise<Record<string, Maybe<string | string[]>>>;
};

export default async function Page({ searchParams }: PageProps) {
  const user = await requireUserOrRedirect();
  const params = await searchParams;
  // INFO: REQUIREMENTS.md § 10. 채팅's viewer taps through carrying the photo it was showing, and the window comes back centred on that tile rather than on the newest one.
  const targetId = toMediaId(params[ARCHIVE_TARGET_PARAM]);
  const modeFilter = toArchiveModeFilter(params[ARCHIVE_MODE_PARAM]);

  return (
    <ArchivePage
      key={`${targetId ?? ""}-${modeFilter}`}
      targetId={targetId}
      modeFilter={modeFilter}
      initialMedia={await listArchiveMedia({
        around: targetId,
        currentUserId: user.id,
        modeFilter,
      })}
    />
  );
}

/**
 * WARN: Shape-checked rather than merely typed, as § 8.6.1.'s `?message=` and § 11.5.'s
 * `?day=` are. The value is bound with an explicit `::bigint` cast (`listArchiveMedia`),
 * so `?target=abc` is a driver error rather than a miss — which is a 500 on a URL
 * anybody can type.
 *
 * WARN: `snowflakeSchema` itself, never a regex written out here. This id has two
 * readers — this route and `GET /api/archive` — so a copied regex that drifted would
 * pass here and 400 at the endpoint, which is the exact input class the check is for.
 */
function toMediaId(value: Maybe<string | string[]>): Optional<MediaId> {
  const id = snowflakeSchema<MediaId>().safeParse(value);

  return id.success ? id.data : undefined;
}
