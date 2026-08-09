import { listArchiveMedia } from "@/entities/media";
import { ArchivePage } from "@/pages/archive";
import { ARCHIVE_TARGET_PARAM } from "@/shared/config";
import type { Maybe, Optional } from "@/shared/lib";
import { z } from "zod";

type PageProps = {
  searchParams: Promise<Record<string, Maybe<string | string[]>>>;
};

export default async function Page({ searchParams }: PageProps) {
  // INFO: REQUIREMENTS.md § 10. 채팅's viewer taps through carrying the photo it was showing, and the window comes back centred on that tile rather than on the newest one.
  const targetId = toMediaId((await searchParams)[ARCHIVE_TARGET_PARAM]);

  return (
    <ArchivePage initialMedia={await listArchiveMedia({ around: targetId })} targetId={targetId} />
  );
}

/**
 * WARN: Shape-checked rather than merely typed, as § 8.6.1.'s `?message=` and § 11.5.'s
 * `?day=` are. The value is bound with an explicit `::uuid` cast (`listArchiveMedia`),
 * so `?target=abc` is a driver error rather than a miss — which is a 500 on a URL
 * anybody can type.
 *
 * WARN: `z.uuid()` itself, never a regex written out here. This id has two readers —
 * this route and `GET /api/archive` — and zod's own shape is stricter than the obvious
 * hand-rolled one: it requires the RFC version nibble and variant, so the loose form
 * passes a copied regex and 400s at the endpoint, which is the exact input class the
 * check exists for.
 */
function toMediaId(value: Maybe<string | string[]>): Optional<string> {
  const id = z.uuid().safeParse(value);

  return id.success ? id.data : undefined;
}
