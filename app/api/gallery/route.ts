import { listGalleryMedia, removeGalleryMedia } from "@/entities/media";
import { getCurrentUser } from "@/shared/auth";
import {
  GALLERY_PAGE_SIZE,
  LIBRARY_KINDS,
  MAX_GALLERY_PAGE_SIZE,
  MAX_GALLERY_SELECTION,
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
    limit: z.coerce.number().int().positive().optional(),
  })
  .refine(
    ({ beforeCreatedAt, beforeId }) => (beforeCreatedAt === undefined) === (beforeId === undefined),
    { message: "cursor_incomplete" },
  );

const bodySchema = z.object({
  ids: z.array(z.uuid()).min(1).max(MAX_GALLERY_SELECTION),
});

// INFO: AGENTS.md § 6.4. A Route Handler answers its own 401 — the App Router does not honour a thrown `Response`.
export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!query.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { kind, beforeCreatedAt, beforeId, limit } = query.data;

  return NextResponse.json({
    media: await listGalleryMedia({
      kind,
      before:
        beforeCreatedAt && beforeId ? { createdAt: beforeCreatedAt, id: beforeId } : undefined,
      limit: Math.min(limit ?? GALLERY_PAGE_SIZE, MAX_GALLERY_PAGE_SIZE),
    }),
  });
}

/**
 * REQUIREMENTS.md § 18. #1. Takes photos out of the gallery without touching the
 * messages that carry them.
 *
 * INFO: Unscoped to the uploader on purpose — the gallery belongs to the
 * conversation (§ 6.), so either participant removes any tile. An id that is not
 * in the gallery simply removes nothing, which is why there is no per-id 404 to
 * report and no way to probe with one.
 */
export async function DELETE(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  return NextResponse.json(await removeGalleryMedia(body.data.ids));
}
