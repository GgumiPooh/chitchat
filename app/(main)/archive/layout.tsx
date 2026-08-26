import { listArchiveMonthCounts } from "@/entities/media";
import { ArchiveJumpProvider, ArchiveShell } from "@/pages/archive";
import { requireUserOrRedirect } from "@/shared/auth";
import type { PropsWithChildren } from "react";

/**
 * AGENTS.md § 4.1. Persists `ArchiveShell` (the `lg` panel) across the three shelf
 * routes — a route-scoped `page.tsx` remounts on every navigation, and the pill's
 * travelling fill (`LibrarySegments`) needs to survive that to have anything to
 * travel from. All three shelves' month counts are fetched here, once, since the
 * panel needs the other two on hand before the tap that switches to them.
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
      <ArchiveShell monthCountsByShelf={{ gallery, file, voice }}>{children}</ArchiveShell>
    </ArchiveJumpProvider>
  );
}
