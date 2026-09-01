import { listArchiveMonthCounts } from "@/entities/media";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { ARCHIVE_MODE_FILTERS, LIBRARY_SHELVES } from "@/shared/config";
import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  shelf: z.enum(LIBRARY_SHELVES).optional(),
  modeFilter: z.enum(ARCHIVE_MODE_FILTERS).optional(),
});

/**
 * REQUIREMENTS.md § 10. The `lg` panel's month totals for one shelf and mode —
 * `archive/layout.tsx` seeds the panel with the 전체보기 counts, and this is how it
 * follows the 보기 옵션 filter and the shelf's own uploads and 삭제 afterwards: a
 * layout can read no `searchParams` and does not re-render on a client mutation.
 */
// INFO: AGENTS.md § 6.4. A Route Handler answers its own 401 — the App Router does not honour a thrown `Response`.
export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!query.success) {
    return apiError("invalid_request");
  }

  const { shelf, modeFilter } = query.data;

  return NextResponse.json({
    months: await listArchiveMonthCounts(shelf ?? "gallery", user.id, modeFilter),
  });
}
