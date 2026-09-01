import { listArchiveMonthCounts } from "@/entities/media";
import { ArchiveJumpProvider, ArchiveMonthCountsProvider, ArchiveShell } from "@/pages/archive";
import { requireUserOrRedirect } from "@/shared/auth";
import type { PropsWithChildren } from "react";

/**
 * AGENTS.md § 4.1. Persists `ArchiveShell` (the `lg` panel) across the three shelf
 * routes — a route-scoped `page.tsx` remounts on every navigation, and the pill's
 * travelling fill (`LibrarySegments`) needs to survive that to have anything to
 * travel from. All three shelves' 전체보기 month counts are fetched here, once, as
 * the panel's first-paint seed — a layout reads no `searchParams`, so following
 * the 보기 옵션 mode from here is impossible and `ArchiveMonthCountsProvider`'s
 * client query owns every count after this render.
 */
export default async function ArchiveLayout({ children }: PropsWithChildren) {
  const user = await requireUserOrRedirect();
  const [gallery, file, voice] = await Promise.all([
    listArchiveMonthCounts("gallery", user.id),
    listArchiveMonthCounts("file", user.id),
    listArchiveMonthCounts("voice", user.id),
  ]);

  return (
    <ArchiveJumpProvider>
      <ArchiveMonthCountsProvider seed={{ gallery, file, voice }}>
        <ArchiveShell>{children}</ArchiveShell>
      </ArchiveMonthCountsProvider>
    </ArchiveJumpProvider>
  );
}
