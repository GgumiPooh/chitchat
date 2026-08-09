import { listArchiveMedia, removeArchiveMedia } from "@/entities/media";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import {
  ARCHIVE_PAGE_SIZE,
  LIBRARY_KINDS,
  MAX_ARCHIVE_PAGE_SIZE,
  MAX_ARCHIVE_SELECTION,
} from "@/shared/config";
import { NextResponse } from "next/server";
import { z } from "zod";

// INFO: REQUIREMENTS.md § 6. Both halves of the keyset cursor, or neither — `created_at` alone cannot separate the rows of one multi-photo send.
const querySchema = z
  .object({
    // INFO: REQUIREMENTS.md § 10. Which segment is being paged, 사진 when the caller says nothing. An unknown value is a 400 rather than a silent fallback — a client asking for a shelf this build has never heard of must not be handed photos.
    kind: z.enum(LIBRARY_KINDS).optional(),
    beforeCreatedAt: z.iso.datetime({ offset: true }).optional(),
    beforeId: z.uuid().optional(),
    // INFO: REQUIREMENTS.md § 10. The window's first tile, for paging upward out of a jumped window — the mirror of the pair above, and refused half-given for the same reason.
    afterCreatedAt: z.iso.datetime({ offset: true }).optional(),
    afterId: z.uuid().optional(),
    // INFO: REQUIREMENTS.md § 10. The photo 보관함 is to open on, for the position jump — a single id rather than a cursor pair, because the row it names is what the pair is then resolved from.
    around: z.uuid().optional(),
    limit: z.coerce.number().int().positive().optional(),
  })
  .refine(
    ({ beforeCreatedAt, beforeId }) => (beforeCreatedAt === undefined) === (beforeId === undefined),
    { message: "cursor_incomplete" },
  )
  .refine(
    ({ afterCreatedAt, afterId }) => (afterCreatedAt === undefined) === (afterId === undefined),
    {
      message: "cursor_incomplete",
    },
  );

const bodySchema = z.object({
  ids: z.array(z.uuid()).min(1).max(MAX_ARCHIVE_SELECTION),
});

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

  const { kind, beforeCreatedAt, beforeId, afterCreatedAt, afterId, around, limit } = query.data;

  return NextResponse.json({
    media: await listArchiveMedia({
      kind,
      before:
        beforeCreatedAt && beforeId ? { createdAt: beforeCreatedAt, id: beforeId } : undefined,
      after: afterCreatedAt && afterId ? { createdAt: afterCreatedAt, id: afterId } : undefined,
      around,
      limit: Math.min(limit ?? ARCHIVE_PAGE_SIZE, MAX_ARCHIVE_PAGE_SIZE),
    }),
  });
}

/**
 * REQUIREMENTS.md § 18. #1. Takes photos out of the library without touching the
 * messages that carry them.
 *
 * INFO: Unscoped to the uploader on purpose — the library belongs to the
 * conversation (§ 6.), so either participant removes any tile. An id that is not
 * in the library simply removes nothing, which is why there is no per-id 404 to
 * report and no way to probe with one.
 */
export async function DELETE(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  return NextResponse.json(await removeArchiveMedia(body.data.ids));
}
